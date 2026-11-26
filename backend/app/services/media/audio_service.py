"""Audio upload validation, FFmpeg 16kHz PCM WAV normalization, STT/TTS providers, and ephemeral purge."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime
import io
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Any
import wave
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.models.clinical import AudioRecord
from app.services.ai.base import normalize_language
from app.services.media.mithi_service import mithi_tts_service

MAX_AUDIO_BYTES = 50 * 1024 * 1024  # 50 MB
GROQ_STT_MAX_BYTES = 25 * 1024 * 1024  # 25 MB
STT_CONFIRMATION_THRESHOLD = 0.78
SUPPORTED_AUDIO_SPEEDS = (0.75, 0.85, 1.0, 1.15, 1.25)

_MEDICAL_KEYTERMS_HINT = (
    "Paracetamol, Amlodipine, Metformin, Azithromycin, Amoxicillin, Cefixime, "
    "Acute Nasopharyngitis, Hypertension, Pneumonia, HbA1c, Creatinine, mg, mmHg, SOS"
)


def detect_audio_mime(file_bytes: bytes, filename: str | None = None) -> tuple[str, str] | None:
    """Validate audio magic bytes (WebM, WAV, MP3, M4A) and return (mime_type, ext)."""
    if len(file_bytes) >= 4 and file_bytes[:4] == b"\x1a\x45\xdf\xa3":
        return "audio/webm", "webm"
    if len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WAVE":
        return "audio/wav", "wav"
    if len(file_bytes) >= 3 and file_bytes[:3] == b"ID3":
        return "audio/mpeg", "mp3"
    if len(file_bytes) >= 2 and file_bytes[0] == 0xFF and (file_bytes[1] & 0xE0) == 0xE0:
        return "audio/mpeg", "mp3"
    if len(file_bytes) >= 12 and file_bytes[4:8] == b"ftyp":
        return "audio/mp4", "m4a"
    return None


def validate_audio_upload(file_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    """Validate audio upload <= 50 MB and supported magic bytes (WebM/WAV/MP3/M4A)."""
    if not file_bytes:
        raise AppError(422, "VALIDATION_ERROR", "Uploaded audio file is empty.")
    if len(file_bytes) > MAX_AUDIO_BYTES:
        raise AppError(
            413,
            "VALIDATION_ERROR",
            f"Audio exceeds maximum allowed size of {MAX_AUDIO_BYTES // (1024 * 1024)} MB.",
        )

    detected = detect_audio_mime(file_bytes, filename)
    if not detected:
        raise AppError(
            415,
            "VALIDATION_ERROR",
            "Unsupported audio format. Upload a valid WebM, WAV, MP3, or M4A recording.",
        )

    mime_type, ext = detected
    return {
        "mime_type": mime_type,
        "extension": ext,
        "file_size_bytes": len(file_bytes),
        "original_filename": Path(filename).name if filename else f"audio.{ext}",
    }


def find_ffmpeg_executable() -> str | None:
    """Locate ffmpeg executable on PATH or standard WinGet installation directory."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    winget_root = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    if winget_root.exists():
        matches = list(winget_root.glob("Gyan.FFmpeg*/**/ffmpeg.exe"))
        if matches:
            return str(matches[0])
    return None


def normalize_audio_with_ffmpeg(
    input_bytes: bytes,
    input_ext: str = "webm",
    apply_loudnorm: bool = False,
) -> dict[str, Any]:
    """Normalize uploaded audio to 16 kHz, mono, 16-bit PCM WAV using FFmpeg 9.0.2."""
    ffmpeg_bin = find_ffmpeg_executable()
    if not ffmpeg_bin:
        raise AppError(503, "PROVIDER_UNAVAILABLE", "FFmpeg executable is unavailable.")

    with tempfile.TemporaryDirectory(prefix="medsarthi_audio_") as tmpdir:
        tmp_path = Path(tmpdir)
        src_path = tmp_path / f"input.{input_ext}"
        dst_path = tmp_path / "normalized_16k_mono.wav"
        src_path.write_bytes(input_bytes)

        cmd = [
            ffmpeg_bin,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(src_path),
            "-vn",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
        ]
        if apply_loudnorm:
            cmd.extend(["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"])
        cmd.append(str(dst_path))

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=45, check=False)
        if proc.returncode != 0 or not dst_path.exists():
            raise AppError(
                422,
                "VALIDATION_ERROR",
                f"Failed to decode or normalize audio stream: {proc.stderr.strip() or 'unknown error'}",
            )
        wav_bytes = dst_path.read_bytes()

    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        sample_rate = wf.getframerate()
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        nframes = wf.getnframes()
        duration_seconds = round(nframes / float(sample_rate), 3) if sample_rate > 0 else 0.0

    return {
        "wav_bytes": wav_bytes,
        "mime_type": "audio/wav",
        "sample_rate": sample_rate,
        "channels": channels,
        "sample_width_bytes": sampwidth,
        "duration_seconds": duration_seconds,
        "file_size_bytes": len(wav_bytes),
    }


def normalize_audio_speed(speed: float | None) -> float:
    """Snap/validate speed into supported range (0.75, 0.85, 1.0, 1.15, 1.25)."""
    if speed is None:
        return 1.0
    return min(SUPPORTED_AUDIO_SPEEDS, key=lambda s: abs(s - float(speed)))


def split_sentences_multilingual(text: str) -> list[str]:
    """Split English, Hindi (Devanagari danda), and Hinglish text into highlightable sentences."""
    if not text or not text.strip():
        return []
    raw_chunks = re.split(r"(?<=[.!?।])\s+|\n+", text.strip())
    return [c.strip() for c in raw_chunks if c and c.strip()]


def build_sentence_cues(
    text: str,
    audio_speed: float = 1.0,
    total_duration_ms: int | None = None,
) -> tuple[list[dict[str, Any]], float]:
    """Generate accurate sentence_cues [{sentence_index, text, start_ms, end_ms}] scaled to speed."""
    speed = normalize_audio_speed(audio_speed)
    sentences = split_sentences_multilingual(text)
    if not sentences:
        return [], 0.0

    # Estimate spoken duration: ~145 words/min at 1.0x (~415ms/word, min 900ms per short sentence)
    weights = [max(len(s.split()) * 420, len(s) * 65, 900) / speed for s in sentences]
    raw_total_ms = sum(weights)
    target_total_ms = float(total_duration_ms) if total_duration_ms and total_duration_ms > 0 else raw_total_ms
    scale = target_total_ms / raw_total_ms if raw_total_ms > 0 else 1.0

    cues: list[dict[str, Any]] = []
    cursor_ms = 0
    for idx, (sent, w) in enumerate(zip(sentences, weights)):
        dur_ms = max(300, int(round(w * scale)))
        end_ms = cursor_ms + dur_ms
        cues.append(
            {
                "sentence_index": idx,
                "text": sent,
                "start_ms": cursor_ms,
                "end_ms": end_ms,
            }
        )
        cursor_ms = end_ms

    return cues, round(cursor_ms / 1000.0, 3)


# ---------------------------------------------------------------------------
# STT Providers
# ---------------------------------------------------------------------------


class STTProvider(ABC):
    """Abstract Speech-to-Text provider interface."""

    provider_name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True when required API key is set."""

    @abstractmethod
    async def transcribe(
        self,
        wav_bytes: bytes,
        language_hint: str | None = None,
        diarize: bool = True,
        duration_seconds: float = 0.0,
    ) -> dict[str, Any]:
        """Transcribe 16 kHz mono WAV into text, segments, confidence, and requires_confirmation."""


class DeepgramSTTProvider(STTProvider):
    """Deepgram nova-3-medical STT with mandatory mip_opt_out=true privacy parameter."""

    provider_name = "deepgram_nova3_medical"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.api_key = self.settings.DEEPGRAM_API_KEY.strip()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def transcribe(
        self,
        wav_bytes: bytes,
        language_hint: str | None = None,
        diarize: bool = True,
        duration_seconds: float = 0.0,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise AppError(503, "PROVIDER_UNAVAILABLE", "Deepgram API key is not configured.")

        params: dict[str, str] = {
            "model": "nova-3-medical",
            "language": "multi" if not language_hint or language_hint in ("hi", "hi-Latn") else language_hint,
            "smart_format": "true",
            "diarize": "true" if diarize else "false",
            # Mandatory MIP opt-out per provider audit #25 (never retain audio for training)
            "mip_opt_out": "true" if self.settings.DEEPGRAM_MIP_OPT_OUT else "true",
        }
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "audio/wav",
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                "https://api.deepgram.com/v1/listen",
                params=params,
                headers=headers,
                content=wav_bytes,
            )
        if resp.status_code >= 400:
            raise AppError(503, "PROVIDER_UNAVAILABLE", f"Deepgram STT error ({resp.status_code}).")

        data = resp.json()
        alt = (
            data.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
        )
        transcript = (alt.get("transcript") or "").strip()
        confidence = float(alt.get("confidence", 0.0))
        words = alt.get("words", []) or []

        segments: list[dict[str, Any]] = []
        if words:
            cur_speaker = words[0].get("speaker", 0)
            cur_words: list[str] = []
            cur_confs: list[float] = []
            seg_start = int(round(float(words[0].get("start", 0.0)) * 1000))
            seg_end = seg_start
            for w in words:
                sp = w.get("speaker", 0)
                if sp != cur_speaker and cur_words:
                    segments.append(
                        {
                            "segment_id": f"seg_{len(segments) + 1}",
                            "start_ms": seg_start,
                            "end_ms": seg_end,
                            "speaker_role": "unassigned",
                            "speaker_label": f"Speaker {int(cur_speaker) + 1}",
                            "text": " ".join(cur_words),
                            "confidence": round(sum(cur_confs) / len(cur_confs), 4),
                        }
                    )
                    cur_words = []
                    cur_confs = []
                    cur_speaker = sp
                    seg_start = int(round(float(w.get("start", 0.0)) * 1000))
                cur_words.append(str(w.get("punctuated_word") or w.get("word") or ""))
                cur_confs.append(float(w.get("confidence", confidence)))
                seg_end = int(round(float(w.get("end", 0.0)) * 1000))
            if cur_words:
                segments.append(
                    {
                        "segment_id": f"seg_{len(segments) + 1}",
                        "start_ms": seg_start,
                        "end_ms": seg_end,
                        "speaker_role": "unassigned",
                        "speaker_label": f"Speaker {int(cur_speaker) + 1}",
                        "text": " ".join(cur_words),
                        "confidence": round(sum(cur_confs) / len(cur_confs), 4),
                    }
                )

        low_word = any(float(w.get("confidence", 1.0)) < 0.75 for w in words)
        requires_confirmation = (
            not transcript
            or duration_seconds < 0.4
            or confidence < STT_CONFIRMATION_THRESHOLD
            or low_word
        )
        return {
            "status": "transcribed",
            "provider": self.provider_name,
            "mip_opt_out_enforced": True,
            "detected_language": data.get("results", {}).get("channels", [{}])[0].get("detected_language") or (language_hint or "multi"),
            "transcript_raw": transcript,
            "transcript_segments": segments,
            "confidence_score": round(confidence, 4),
            "requires_confirmation": requires_confirmation,
            "speaker_map_verified": False,
        }


class GroqWhisperSTTProvider(STTProvider):
    """Groq whisper-large-v3-turbo single-speaker STT (<= 25 MB, prompt <= 224 tokens)."""

    provider_name = "groq_whisper_large_v3_turbo"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.api_key = self.settings.GROQ_API_KEY.strip()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def transcribe(
        self,
        wav_bytes: bytes,
        language_hint: str | None = None,
        diarize: bool = False,
        duration_seconds: float = 0.0,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise AppError(503, "PROVIDER_UNAVAILABLE", "Groq API key is not configured.")
        if len(wav_bytes) > GROQ_STT_MAX_BYTES:
            raise AppError(413, "VALIDATION_ERROR", "Audio exceeds Groq Whisper 25 MB file limit.")

        form_data = {
            "model": "whisper-large-v3-turbo",
            "response_format": "verbose_json",
            "prompt": _MEDICAL_KEYTERMS_HINT,
        }
        if language_hint and language_hint != "hi-Latn":
            form_data["language"] = language_hint

        headers = {"Authorization": f"Bearer {self.api_key}"}
        files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                data=form_data,
                files=files,
            )
        if resp.status_code >= 400:
            raise AppError(503, "PROVIDER_UNAVAILABLE", f"Groq Whisper error ({resp.status_code}).")

        data = resp.json()
        transcript = (data.get("text") or "").strip()
        segs = data.get("segments", []) or []
        avg_logprobs = [float(s.get("avg_logprob", -0.35)) for s in segs]
        no_speech_probs = [float(s.get("no_speech_prob", 0.0)) for s in segs]
        mean_logprob = sum(avg_logprobs) / len(avg_logprobs) if avg_logprobs else -0.35
        max_no_speech = max(no_speech_probs) if no_speech_probs else 0.0
        confidence = round(max(0.0, min(1.0, math.exp(mean_logprob))), 4)

        requires_confirmation = (
            not transcript
            or duration_seconds < 0.4
            or confidence < STT_CONFIRMATION_THRESHOLD
            or mean_logprob < -0.60
            or max_no_speech > 0.40
            or language_hint == "hi-Latn"
        )
        return {
            "status": "transcribed",
            "provider": self.provider_name,
            "diarization_supported": False,
            "detected_language": data.get("language") or (language_hint or "en"),
            "transcript_raw": transcript,
            "transcript_segments": [
                {
                    "segment_id": f"seg_{idx + 1}",
                    "start_ms": int(round(float(s.get("start", 0.0)) * 1000)),
                    "end_ms": int(round(float(s.get("end", 0.0)) * 1000)),
                    "speaker_role": "unassigned",
                    "speaker_label": "Speaker 1",
                    "text": str(s.get("text", "")).strip(),
                    "confidence": round(max(0.0, min(1.0, math.exp(float(s.get("avg_logprob", -0.35))))), 4),
                }
                for idx, s in enumerate(segs)
            ],
            "confidence_score": confidence,
            "requires_confirmation": requires_confirmation,
            "speaker_map_verified": False,
        }


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    filename: str | None = None,
    language_hint: str | None = None,
    diarize: bool = True,
    synthetic_demo_transcript: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Validate audio, normalize via FFmpeg 16 kHz mono WAV, and route to STT provider or fallback."""
    cfg = settings or get_settings()
    meta = validate_audio_upload(audio_bytes, filename)
    norm = normalize_audio_with_ffmpeg(audio_bytes, input_ext=meta["extension"])

    deepgram = DeepgramSTTProvider(cfg)
    groq_stt = GroqWhisperSTTProvider(cfg)

    if cfg.STT_PRIMARY_PROVIDER == "deepgram" and deepgram.is_configured():
        try:
            res = await deepgram.transcribe(
                norm["wav_bytes"],
                language_hint=language_hint,
                diarize=diarize,
                duration_seconds=norm["duration_seconds"],
            )
            res["duration_seconds"] = norm["duration_seconds"]
            return res
        except AppError:
            if groq_stt.is_configured():
                res = await groq_stt.transcribe(
                    norm["wav_bytes"],
                    language_hint=language_hint,
                    diarize=False,
                    duration_seconds=norm["duration_seconds"],
                )
                res["duration_seconds"] = norm["duration_seconds"]
                return res
            raise

    if groq_stt.is_configured():
        res = await groq_stt.transcribe(
            norm["wav_bytes"],
            language_hint=language_hint,
            diarize=False,
            duration_seconds=norm["duration_seconds"],
        )
        res["duration_seconds"] = norm["duration_seconds"]
        return res

    if cfg.SYNTHETIC_PROTOTYPE_MODE and synthetic_demo_transcript:
        conf = 0.72 if "pneumonia" in synthetic_demo_transcript.lower() else 0.86
        return {
            "status": "synthetic_demo_transcript",
            "provider": "synthetic_demo_stt",
            "detected_language": normalize_language(language_hint),
            "duration_seconds": norm["duration_seconds"],
            "transcript_raw": synthetic_demo_transcript,
            "transcript_segments": [
                {
                    "segment_id": "seg_1",
                    "start_ms": 0,
                    "end_ms": int(norm["duration_seconds"] * 1000),
                    "speaker_role": "unassigned",
                    "speaker_label": "Speaker 1",
                    "text": synthetic_demo_transcript,
                    "confidence": conf,
                }
            ],
            "confidence_score": conf,
            "requires_confirmation": conf < STT_CONFIRMATION_THRESHOLD,
            "speaker_map_verified": False,
        }

    return {
        "status": "stt_unconfigured",
        "provider": "stt_unconfigured",
        "detected_language": normalize_language(language_hint),
        "duration_seconds": norm["duration_seconds"],
        "transcript_raw": "",
        "transcript_segments": [],
        "confidence_score": 0.0,
        "requires_confirmation": True,
        "speaker_map_verified": False,
        "message": "No cloud STT API key configured (DEEPGRAM_API_KEY or GROQ_API_KEY). Type or confirm transcript manually.",
    }


# ---------------------------------------------------------------------------
# TTS Providers
# ---------------------------------------------------------------------------


class TTSProvider(ABC):
    """Abstract Text-to-Speech provider interface."""

    provider_name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if this TTS backend can run."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        language: str = "en",
        voice_preference: str = "warm_female",
        audio_speed: float = 1.0,
    ) -> dict[str, Any]:
        """Synthesize text and return audio metadata + accurate sentence_cues."""


class MithiTTSProvider(TTSProvider):
    """Mithi v2 Flash multilingual TTS with NVIDIA RTX 3050 GPU acceleration and CPU fallback."""

    provider_name = "mithi_v2_flash"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def is_configured(self) -> bool:
        return True

    async def synthesize(
        self,
        text: str,
        language: str = "en",
        voice_preference: str = "warm_female",
        audio_speed: float = 1.0,
    ) -> dict[str, Any]:
        speed = normalize_audio_speed(audio_speed)
        lang = normalize_language(language)
        mithi_res = await mithi_tts_service.synthesize_wav_async(
            text=text,
            language=lang,
            voice=voice_preference,
            audio_speed=speed,
            settings=self.settings,
        )
        return {
            "provider": self.provider_name,
            "voice_name": mithi_res["voice_name"],
            "language": mithi_res["language"],
            "audio_speed": speed,
            "mime_type": "audio/wav",
            "audio_bytes": mithi_res["wav_bytes"],
            "duration_seconds": mithi_res["duration_seconds"],
            "inference_seconds": mithi_res.get("inference_seconds", 0.0),
            "device": mithi_res.get("device", "cuda"),
            "peak_vram_mb": mithi_res.get("peak_vram_mb", 0.0),
            "sentence_cues": mithi_res.get("sentence_cues", []),
            "use_browser_speech_synthesis": False,
        }


async def synthesize_speech_with_cues(
    text: str,
    language: str = "en",
    voice_preference: str = "warm_female",
    audio_speed: float = 1.0,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Synthesize speech using Mithi v2 Flash on RTX 3050 GPU with synchronized sentence_cues."""
    cfg = settings or get_settings()
    provider = MithiTTSProvider(cfg)
    return await provider.synthesize(
        text=text,
        language=language,
        voice_preference=voice_preference,
        audio_speed=audio_speed,
    )


# ---------------------------------------------------------------------------
# Ephemeral Raw Audio Deletion & TTL Purge
# ---------------------------------------------------------------------------


def delete_audio_blob(storage_path: str | Path | None, settings: Settings | None = None) -> bool:
    """Safely delete an audio file blob from storage (handles relative & absolute storage paths)."""
    if not storage_path:
        return False
    cfg = settings or get_settings()
    base_dir = cfg.storage_path.resolve()
    raw_path = Path(storage_path)
    target = raw_path.resolve() if raw_path.is_absolute() else (base_dir / raw_path).resolve()

    # Guard against deleting files outside storage_path
    try:
        target.relative_to(base_dir)
    except ValueError:
        logger.warning("Refused to delete audio path outside storage_path: %s", target)
        return False

    if target.exists() and target.is_file():
        target.unlink()
        return True
    return False


async def purge_expired_audio(
    session: AsyncSession,
    now: datetime | None = None,
    settings: Settings | None = None,
) -> dict[str, int]:
    """Delete expired ephemeral audio blobs and mark AudioRecord rows as purged."""
    cfg = settings or get_settings()
    cutoff = now or datetime.now(UTC)

    stmt = select(AudioRecord).where(
        AudioRecord.purged_at.is_(None),
        AudioRecord.retention_expires_at <= cutoff,
    )
    rows = list((await session.execute(stmt)).scalars().all())
    files_deleted = 0
    records_purged = 0

    for rec in rows:
        if delete_audio_blob(rec.storage_path, settings=cfg):
            files_deleted += 1
        rec.storage_path = None
        rec.purged_at = cutoff
        rec.processing_status = "purged"
        records_purged += 1

    if records_purged > 0:
        await session.flush()

    return {"records_purged": records_purged, "files_deleted": files_deleted}
