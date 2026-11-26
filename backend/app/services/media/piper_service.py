"""Lightweight CPU-only Piper TTS narrator engine with cached voice loading."""

from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path
import re
import threading
import wave
from typing import Any

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MARKDOWN_DECOR_RE = re.compile(r"[`*_~>#]+")
_UNSUPPORTED_CHAR_RE = re.compile(r"[^\w\s\.,!?;:'\"()\-\+/%°।]")
_MULTISPACE_RE = re.compile(r"\s+")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?।])\s+")


def preprocess_text_for_speech(raw_text: str) -> str:
    """Clean markdown, symbols, and clinical abbreviations for natural spoken narration."""
    if not raw_text or not raw_text.strip():
        return ""
    text = _MARKDOWN_LINK_RE.sub(r"\1", raw_text)
    text = _MARKDOWN_DECOR_RE.sub(" ", text)
    text = text.replace("•", ". ").replace("|", ", ").replace("—", ", ").replace("–", ", ")
    text = re.sub(r"\bmg\b", "milligrams", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmcg\b", "micrograms", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmL\b", "milliliters", text)
    text = re.sub(r"°\s*F\b", " degrees Fahrenheit", text, flags=re.IGNORECASE)
    text = re.sub(r"°\s*C\b", " degrees Celsius", text, flags=re.IGNORECASE)
    text = text.replace(">=", "greater than or equal to ").replace("<=", "less than or equal to ")
    text = text.replace(">", "greater than ").replace("<", "less than ")
    text = _UNSUPPORTED_CHAR_RE.sub(" ", text)
    text = _MULTISPACE_RE.sub(" ", text).strip()
    return text


def _chunk_long_text(cleaned_text: str, max_chars: int = 380) -> list[str]:
    """Split long narration text into bounded sentence chunks for smooth synthesis."""
    if len(cleaned_text) <= max_chars:
        return [cleaned_text]
    sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(cleaned_text) if s.strip()]
    chunks: list[str] = []
    current = ""
    for sent in sentences:
        if len(sent) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            words = sent.split()
            buf = ""
            for w in words:
                if len(buf) + len(w) + 1 > max_chars and buf:
                    chunks.append(buf)
                    buf = w
                else:
                    buf = f"{buf} {w}".strip()
            if buf:
                chunks.append(buf)
        elif len(current) + len(sent) + 1 > max_chars and current:
            chunks.append(current)
            current = sent
        else:
            current = f"{current} {sent}".strip()
    if current:
        chunks.append(current)
    return chunks or [cleaned_text]


class PiperTTSService:
    """Thread-safe, CPU-only Piper TTS manager reusing a single loaded PiperVoice instance."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._voice: Any = None
        self._loaded_voice_name: str | None = None
        self._loaded_model_path: Path | None = None

    @staticmethod
    def _ensure_piper_installed():
        try:
            from piper import PiperVoice, SynthesisConfig  # noqa: F401
        except ImportError as exc:
            raise AppError(
                503,
                "PROVIDER_UNAVAILABLE",
                "Piper TTS dependency ('piper-tts') is not installed. Run 'pip install piper-tts'.",
            ) from exc

    def ensure_voice_files(
        self,
        voice_name: str | None = None,
        settings: Settings | None = None,
    ) -> tuple[Path, Path]:
        """Return (onnx_path, json_path), downloading once if missing and auto-download is enabled."""
        cfg = settings or get_settings()
        target_voice = (voice_name or cfg.PIPER_VOICE_NAME or "en_US-amy-medium").strip()
        model_dir = cfg.piper_model_path
        model_dir.mkdir(parents=True, exist_ok=True)

        onnx_path = model_dir / f"{target_voice}.onnx"
        json_path = model_dir / f"{target_voice}.onnx.json"

        if onnx_path.exists() and json_path.exists() and onnx_path.stat().st_size > 0:
            return onnx_path, json_path

        if not cfg.PIPER_AUTO_DOWNLOAD:
            raise AppError(
                503,
                "PROVIDER_UNAVAILABLE",
                f"Piper voice model '{target_voice}' is missing at {onnx_path} and PIPER_AUTO_DOWNLOAD is disabled.",
            )

        self._ensure_piper_installed()
        try:
            from piper.download_voices import download_voice

            logger.info("Downloading Piper voice model '%s' to %s ...", target_voice, model_dir)
            download_voice(target_voice, model_dir)
        except Exception as exc:
            raise AppError(
                503,
                "PROVIDER_UNAVAILABLE",
                f"Failed to download Piper voice model '{target_voice}': {exc}",
            ) from exc

        if not onnx_path.exists() or not json_path.exists():
            raise AppError(
                503,
                "PROVIDER_UNAVAILABLE",
                f"Piper voice files not found after download attempt: {onnx_path}",
            )
        return onnx_path, json_path

    def get_voice(
        self,
        voice_name: str | None = None,
        settings: Settings | None = None,
    ) -> tuple[Any, str]:
        """Load and cache the PiperVoice instance on CPU (reloads only if voice changes)."""
        cfg = settings or get_settings()
        target_voice = (voice_name or cfg.PIPER_VOICE_NAME or "en_US-amy-medium").strip()
        self._ensure_piper_installed()

        with self._lock:
            if self._voice is not None and self._loaded_voice_name == target_voice:
                return self._voice, target_voice

            onnx_path, json_path = self.ensure_voice_files(target_voice, cfg)
            try:
                from piper import PiperVoice

                voice = PiperVoice.load(str(onnx_path), config_path=str(json_path), use_cuda=False)
            except Exception as exc:
                raise AppError(
                    503,
                    "PROVIDER_UNAVAILABLE",
                    f"Failed to load Piper voice model '{target_voice}': {exc}",
                ) from exc

            self._voice = voice
            self._loaded_voice_name = target_voice
            self._loaded_model_path = onnx_path
            logger.info("Loaded Piper voice '%s' on CPU (%s)", target_voice, onnx_path)
            return voice, target_voice

    def synthesize_wav_sync(
        self,
        text: str,
        *,
        audio_speed: float = 1.0,
        voice_name: str | None = None,
        settings: Settings | None = None,
    ) -> dict[str, Any]:
        """Synchronously synthesize cleaned text into 16-bit mono WAV bytes."""
        cleaned = preprocess_text_for_speech(text)
        if not cleaned:
            raise AppError(
                400,
                "VALIDATION_ERROR",
                "Cannot narrate empty text or text with no speakable characters.",
            )

        speed = max(0.5, min(2.0, float(audio_speed or 1.0)))
        length_scale = round(1.0 / speed, 3)

        voice, active_voice_name = self.get_voice(voice_name=voice_name, settings=settings)

        from piper import SynthesisConfig

        syn_cfg = SynthesisConfig(length_scale=length_scale)
        chunks = _chunk_long_text(cleaned)

        pcm_frames: list[bytes] = []
        sample_rate = int(getattr(voice.config, "sample_rate", 22050) or 22050)
        sample_width = 2
        sample_channels = 1

        try:
            with self._lock:
                for chunk_text in chunks:
                    for audio_chunk in voice.synthesize(chunk_text, syn_config=syn_cfg):
                        pcm_frames.append(audio_chunk.audio_int16_bytes)
                        sample_rate = int(audio_chunk.sample_rate or sample_rate)
                        sample_width = int(audio_chunk.sample_width or sample_width)
                        sample_channels = int(audio_chunk.sample_channels or sample_channels)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(
                500,
                "AUDIO_GENERATION_FAILED",
                f"Piper audio generation failed: {exc}",
            ) from exc

        raw_pcm = b"".join(pcm_frames)
        if not raw_pcm:
            raise AppError(500, "AUDIO_GENERATION_FAILED", "Piper generated empty audio output.")

        wav_buf = io.BytesIO()
        with wave.open(wav_buf, "wb") as wf:
            wf.setnchannels(sample_channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(sample_rate)
            wf.writeframes(raw_pcm)

        wav_bytes = wav_buf.getvalue()
        duration_seconds = round(len(raw_pcm) / float(sample_rate * sample_width * sample_channels), 3)
        return {
            "wav_bytes": wav_bytes,
            "duration_seconds": duration_seconds,
            "sample_rate": sample_rate,
            "voice_name": active_voice_name,
            "cleaned_text": cleaned,
        }

    async def synthesize_wav_async(
        self,
        text: str,
        *,
        audio_speed: float = 1.0,
        voice_name: str | None = None,
        settings: Settings | None = None,
    ) -> dict[str, Any]:
        """Run CPU Piper synthesis in a worker thread so the FastAPI event loop stays responsive."""
        return await asyncio.to_thread(
            self.synthesize_wav_sync,
            text,
            audio_speed=audio_speed,
            voice_name=voice_name,
            settings=settings,
        )


piper_tts_service = PiperTTSService()
