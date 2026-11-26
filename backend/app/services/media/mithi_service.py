"""Mithi v2 Flash multilingual text-to-speech engine with NVIDIA RTX 3050 GPU acceleration and CPU fallback."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any
import numpy as np
import soundfile as sf
import torch

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError


def find_ffmpeg_executable() -> str | None:
    """Locate ffmpeg executable on PATH or standard WinGet installation directory."""
    import shutil
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    winget_root = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    if winget_root.exists():
        matches = list(winget_root.glob("Gyan.FFmpeg*/**/ffmpeg.exe"))
        if matches:
            return str(matches[0])
    return None

logger = logging.getLogger(__name__)

# Supported languages in Mithi v2 Flash
SUPPORTED_MITHI_LANGUAGES = {
    "en": "en",
    "hi": "hi",
    "hi-Latn": "hi",
    "bn": "bn",
    "gu": "gu",
    "kn": "kn",
    "ml": "ml",
    "mr": "mr",
    "or": "or",
    "pa": "pa",
    "ta": "ta",
    "te": "te",
}

# 10 available voices (5 female, 5 male)
MITHI_VOICES = [
    "charvi",
    "ahana",
    "vaidehi",
    "malini",
    "jahnavi",
    "satvik",
    "anirban",
    "nakul",
    "vasant",
    "siddhant",
]

VOICE_MAP = {
    # Female voices
    "warm_female": "charvi",
    "female": "charvi",
    "default_female": "charvi",
    "calm_female": "vaidehi",
    "clear_female": "ahana",
    "gentle_female": "malini",
    "expressive_female": "jahnavi",
    # Male voices
    "warm_male": "satvik",
    "male": "satvik",
    "default_male": "satvik",
    "calm_male": "anirban",
    "clear_male": "nakul",
    "friendly_male": "vasant",
    "deep_male": "siddhant",
}

_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MARKDOWN_DECOR_RE = re.compile(r"[`*_~>#]+")
_UNSUPPORTED_CHAR_RE = re.compile(r"[^\w\s\.,!?;:'\"()\-\+/%°।\u0900-\u0D7F]")
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


def resolve_mithi_voice(preference: str | None) -> str:
    """Map user/narrator voice preference to a valid Mithi voice name."""
    if not preference:
        return "charvi"
    norm = preference.strip().lower()
    if norm in MITHI_VOICES:
        return norm
    return VOICE_MAP.get(norm, "charvi")


def resolve_mithi_lang(language: str | None) -> str:
    """Map application language code to Mithi-supported language code."""
    if not language:
        return "en"
    norm = language.strip()
    return SUPPORTED_MITHI_LANGUAGES.get(norm, "en")


PREDEFINED_NARRATION_LINES: list[dict[str, Any]] = [
    # --- Guided Flow Step 1: Greeting & Welcome ---
    {
        "text": "Namaste! I am Dr. Sarthi. I will help you understand your prescription in English. You can tap the big green button to start right away without any account, or sign in if you want Email or SMS alerts.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "Namaste! I am Dr. Sarthi. I will help you understand your prescription in हिन्दी. You can tap the big green button to start right away without any account, or sign in if you want Email or SMS alerts.",
        "lang": "hi",
        "voice": "charvi",
    },
    {
        "text": "Namaste! I am Dr. Sarthi. I will help you understand your prescription in Hinglish. You can tap the big green button to start right away without any account, or sign in if you want Email or SMS alerts.",
        "lang": "hi",
        "voice": "charvi",
    },
    {
        "text": "नमस्ते! मैं डॉ. सारथी हूँ। मैं आपकी पर्ची को समझने में मदद करूँगा। आप बिना किसी खाते के तुरंत शुरू करने के लिए बड़े हरे बटन पर टैप कर सकते हैं।",
        "lang": "hi",
        "voice": "charvi",
    },
    {
        "text": "Namaste! Main Dr. Sarthi hoon. Main aapki prescription ko samajhne mein madad karunga. Aap bina account ke turant start karne ke liye bade green button par tap karein.",
        "lang": "hi",
        "voice": "charvi",
    },
    # --- Guided Flow Step 2: Prescription Photo Prompts ---
    {
        "text": "Please take a clear photo of your prescription, upload a picture, or tap Sample Prescription so I can read it for you.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "कृपया अपनी पर्ची की एक साफ़ तस्वीर लें, फ़ोटो अपलोड करें, या सैंपल पर्ची पर टैप करें ताकि मैं इसे आपके लिए पढ़ सकूँ।",
        "lang": "hi",
        "voice": "charvi",
    },
    {
        "text": "Kripya apni prescription ki saaf photo lein, picture upload karein, ya Sample Prescription par tap karein taaki main ise aapke liye padh sakun.",
        "lang": "hi",
        "voice": "charvi",
    },
    # --- Guided Flow Step 3: Demographics Checking ---
    {
        "text": "No problem! Please say your name, age, and gender using the microphone button, or type it below.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "koi baat nahi! kripya microphone button use karke apna naam, age aur gender batayein, ya neeche type karein.",
        "lang": "hi",
        "voice": "charvi",
    },
    {
        "text": "I read your name as Ramesh Sharma, age 64 years, and gender male. Is this correct?",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "I read your name as Patient, age not written, and gender not written. Is this correct?",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "I read your name as Guest Patient, age not written, and gender not written. Is this correct?",
        "lang": "en",
        "voice": "charvi",
    },
    # --- Guided Flow Step 4: Simple Medicine Guide ---
    {
        "text": "Here is your simple medicine guide.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "Here is your simple medicine guide. Please take Paracetamol after food if fever occurs, and Amlodipine every morning.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "Take Amlodipine 5 mg once every morning after breakfast. Do not stop suddenly without asking your doctor.",
        "lang": "en",
        "voice": "charvi",
    },
    # --- Guided Flow Step 5: Questions Prompt ---
    {
        "text": "Do you have any questions about your medicines or prescription? You can speak with the microphone or type your question.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "क्या आपकी दवाओं या पर्ची के बारे में कोई प्रश्न हैं? आप माइक्रोफ़ोन से बोल सकते हैं या अपना प्रश्न लिख सकते हैं।",
        "lang": "hi",
        "voice": "charvi",
    },
    # --- Guided Flow Step 6: Review & Rating ---
    {
        "text": "Your prescription and questions are safely recorded! A doctor will check everything within 24 hours. Please tap a star below to rate how helpful I was today.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "Thank you so much for your rating! A doctor will verify your prescription and questions within 24 hours. Take care!",
        "lang": "en",
        "voice": "charvi",
    },
    # --- Reports Workspace Section Narrator Guides ---
    {
        "text": "Welcome to your medical reports and prescription helper. You can upload a photo of your paper or scan the QR code from your mobile phone. MedSarthi will read every medicine and test without guessing.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "To upload, select your paper type, choose a file from your computer, or scan the QR code on your phone to upload wirelessly from any mobile network.",
        "lang": "en",
        "voice": "charvi",
    },
    {
        "text": "Some words or numbers on this paper were unclear. Please check the text on the right and tap Confirm when correct, or tap Ask My Doctor Instead.",
        "lang": "en",
        "voice": "charvi",
    },
    # --- Male Doctor Voice (Satvik) Variants ---
    {
        "text": "Namaste! I am Dr. Sarthi. I will help you understand your prescription in English. You can tap the big green button to start right away without any account, or sign in if you want Email or SMS alerts.",
        "lang": "en",
        "voice": "satvik",
    },
    {
        "text": "Please take a clear photo of your prescription, upload a picture, or tap Sample Prescription so I can read it for you.",
        "lang": "en",
        "voice": "satvik",
    },
    {
        "text": "Here is your simple medicine guide.",
        "lang": "en",
        "voice": "satvik",
    },
]


class MithiTTSService:
    """Thread-safe, singleton Mithi v2 Flash TTS service with GPU acceleration, CPU fallback, and persistent disk cache."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._engine: Any = None
        self._loaded_device: str | None = None
        self._load_lock = threading.Lock()
        self._mem_cache: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _compute_cache_key(cleaned_text: str, target_lang: str, target_voice: str, audio_speed: float) -> str:
        """Generate consistent SHA256 cache key based on cleaned text, lang, voice, and speed."""
        raw_key = f"{cleaned_text.strip().lower()}_{target_lang}_{target_voice}_{audio_speed:.2f}"
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:24]

    def _get_cache_dir(self, settings: Settings | None = None) -> Path:
        cfg = settings or get_settings()
        c_dir = (cfg.storage_path / "tts" / "cache").resolve()
        c_dir.mkdir(parents=True, exist_ok=True)
        return c_dir

    def _get_engine(self, settings: Settings | None = None) -> tuple[Any, str]:
        """Lazy-load and cache the Mithi v2 Flash instance."""
        if self._engine is not None:
            return self._engine, self._loaded_device or "cuda"

        with self._load_lock:
            if self._engine is not None:
                return self._engine, self._loaded_device or "cuda"

            cfg = settings or get_settings()
            model_dir = cfg.mithi_model_path.resolve()
            if not model_dir.exists():
                raise AppError(
                    503,
                    "PROVIDER_UNAVAILABLE",
                    f"Mithi v2 Flash model directory missing at {model_dir}.",
                )

            # Ensure model dir is on sys.path to import run.py
            str_dir = str(model_dir)
            if str_dir not in sys.path:
                sys.path.insert(0, str_dir)

            try:
                from run import Mithi
            except ImportError as exc:
                raise AppError(
                    503,
                    "PROVIDER_UNAVAILABLE",
                    f"Could not import Mithi from {model_dir}: {exc}",
                ) from exc

            desired_device = "cuda" if (torch.cuda.is_available() and cfg.MITHI_DEVICE == "cuda") else "cpu"
            logger.info("Initializing Mithi v2 Flash TTS on %s (from %s)...", desired_device, model_dir)

            try:
                engine = Mithi(device=desired_device)
                self._engine = engine
                self._loaded_device = desired_device
                logger.info("Mithi v2 Flash successfully loaded on %s", desired_device)
                return engine, desired_device
            except Exception as exc:
                if desired_device == "cuda" and cfg.MITHI_FALLBACK_CPU:
                    logger.warning(
                        "Failed to load Mithi v2 Flash on CUDA (%s). Retrying with CPU fallback...",
                        exc,
                    )
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    engine = Mithi(device="cpu")
                    self._engine = engine
                    self._loaded_device = "cpu"
                    logger.info("Mithi v2 Flash loaded on CPU fallback")
                    return engine, "cpu"
                raise AppError(
                    500,
                    "AUDIO_GENERATION_FAILED",
                    f"Failed to initialize Mithi v2 Flash TTS: {exc}",
                ) from exc

    def synthesize_wav_sync(
        self,
        text: str,
        language: str = "en",
        voice: str = "charvi",
        audio_speed: float = 1.0,
        settings: Settings | None = None,
    ) -> dict[str, Any]:
        """Synthesize text into 24kHz mono 16-bit PCM WAV bytes with timing cues and persistent cache."""
        cleaned_text = preprocess_text_for_speech(text)
        if not cleaned_text:
            raise AppError(422, "VALIDATION_ERROR", "Speech synthesis text cannot be empty.")

        target_lang = resolve_mithi_lang(language)
        target_voice = resolve_mithi_voice(voice)
        speed = max(0.5, min(2.0, float(audio_speed)))
        c_key = self._compute_cache_key(cleaned_text, target_lang, target_voice, speed)

        # 1. Check in-memory cache
        if c_key in self._mem_cache:
            hit = dict(self._mem_cache[c_key])
            hit["cached"] = True
            hit["cache_key"] = c_key
            return hit

        # 2. Check disk cache
        cache_dir = self._get_cache_dir(settings)
        wav_path = cache_dir / f"{c_key}.wav"
        json_path = cache_dir / f"{c_key}.json"
        if wav_path.exists() and json_path.exists():
            try:
                meta = json.loads(json_path.read_text(encoding="utf-8"))
                wav_bytes = wav_path.read_bytes()
                cached_res = {
                    "wav_bytes": wav_bytes,
                    "duration_seconds": meta["duration_seconds"],
                    "inference_seconds": 0.001,
                    "cleaned_text": cleaned_text,
                    "voice_name": meta["voice_name"],
                    "language": meta["language"],
                    "device": meta.get("device", self._loaded_device or "cuda"),
                    "peak_vram_mb": meta.get("peak_vram_mb", 0.0),
                    "sample_rate": meta.get("sample_rate", 24000),
                    "sentence_cues": meta.get("sentence_cues", []),
                    "cached": True,
                    "cache_key": c_key,
                }
                self._mem_cache[c_key] = cached_res
                return cached_res
            except Exception:
                pass

        engine, device = self._get_engine(settings)

        t_start = time.perf_counter()
        with self._lock:
            try:
                audio_arr = engine.synthesize(
                    cleaned_text,
                    lang=target_lang,
                    voice=target_voice,
                    gap=0.15,
                )
            except torch.cuda.OutOfMemoryError as oom_exc:
                logger.error("CUDA OOM during Mithi synthesis: %s. Attempting CPU fallback.", oom_exc)
                torch.cuda.empty_cache()
                engine, device = self._get_engine_cpu(settings)
                audio_arr = engine.synthesize(
                    cleaned_text,
                    lang=target_lang,
                    voice=target_voice,
                    gap=0.15,
                )
            except Exception as exc:
                raise AppError(
                    500,
                    "AUDIO_GENERATION_FAILED",
                    f"Mithi v2 Flash synthesis failed: {exc}",
                ) from exc

        t_elapsed = time.perf_counter() - t_start

        # Audio is 24000 Hz 1D float32 array
        sample_rate = 24000
        total_samples = len(audio_arr)
        raw_duration_s = total_samples / float(sample_rate)

        # Convert float32 [-1, 1] to 16-bit PCM WAV
        wav_buf = io.BytesIO()
        sf.write(wav_buf, audio_arr, sample_rate, format="WAV", subtype="PCM_16")
        wav_bytes = wav_buf.getvalue()

        # Apply FFmpeg atempo speed scaling if speed is not 1.0
        final_wav_bytes = wav_bytes
        final_duration_s = raw_duration_s
        if abs(speed - 1.0) > 0.02:
            final_wav_bytes, final_duration_s = self._apply_tempo(
                wav_bytes,
                audio_speed=speed,
                orig_duration_s=raw_duration_s,
            )

        # Calculate accurate sentence cues
        cues = self._generate_sentence_cues(cleaned_text, final_duration_s)

        peak_vram_mb = 0.0
        if torch.cuda.is_available() and device == "cuda":
            peak_vram_mb = round(torch.cuda.max_memory_allocated() / (1024 * 1024), 2)

        res_data = {
            "wav_bytes": final_wav_bytes,
            "duration_seconds": round(final_duration_s, 3),
            "inference_seconds": round(t_elapsed, 3),
            "cleaned_text": cleaned_text,
            "voice_name": target_voice,
            "language": target_lang,
            "device": device,
            "peak_vram_mb": peak_vram_mb,
            "sample_rate": sample_rate,
            "sentence_cues": cues,
            "cached": False,
            "cache_key": c_key,
        }

        # Persist to disk cache
        try:
            wav_path.write_bytes(final_wav_bytes)
            meta_to_save = {
                "duration_seconds": res_data["duration_seconds"],
                "voice_name": target_voice,
                "language": target_lang,
                "device": device,
                "peak_vram_mb": peak_vram_mb,
                "sample_rate": sample_rate,
                "sentence_cues": cues,
            }
            json_path.write_text(json.dumps(meta_to_save), encoding="utf-8")
        except Exception as e:
            logger.warning("Could not persist TTS cache file: %s", e)

        self._mem_cache[c_key] = res_data
        return res_data

    def _get_engine_cpu(self, settings: Settings | None = None) -> tuple[Any, str]:
        """Force CPU engine on OOM."""
        cfg = settings or get_settings()
        from run import Mithi

        cpu_engine = Mithi(device="cpu")
        self._engine = cpu_engine
        self._loaded_device = "cpu"
        return cpu_engine, "cpu"

    @staticmethod
    def _apply_tempo(wav_bytes: bytes, audio_speed: float, orig_duration_s: float) -> tuple[bytes, float]:
        """Use FFmpeg atempo filter for pitch-neutral speed scaling."""
        ffmpeg_bin = find_ffmpeg_executable()
        if not ffmpeg_bin:
            logger.warning("FFmpeg not found; skipping speed scaling.")
            return wav_bytes, orig_duration_s

        speed = max(0.5, min(2.0, float(audio_speed)))
        with tempfile.TemporaryDirectory(prefix="mithi_speed_") as td:
            in_file = Path(td) / "in.wav"
            out_file = Path(td) / "out.wav"
            in_file.write_bytes(wav_bytes)

            cmd = [
                ffmpeg_bin,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(in_file),
                "-filter:a",
                f"atempo={speed:.3f}",
                str(out_file),
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if res.returncode == 0 and out_file.exists():
                scaled_bytes = out_file.read_bytes()
                scaled_dur = orig_duration_s / speed
                return scaled_bytes, scaled_dur

        return wav_bytes, orig_duration_s

    @staticmethod
    def _generate_sentence_cues(text: str, duration_s: float) -> list[dict[str, Any]]:
        """Divide total duration proportionally across sentences for synchronized subtitles."""
        raw_chunks = re.split(r"(?<=[.!?।])\s+|\n+", text.strip())
        sentences = [c.strip() for c in raw_chunks if c and c.strip()]
        if not sentences:
            return []

        weights = [max(len(s.split()) * 420, len(s) * 65, 800) for s in sentences]
        total_w = sum(weights) or 1.0
        total_ms = int(duration_s * 1000)

        cues: list[dict[str, Any]] = []
        cursor_ms = 0
        for idx, (sent, w) in enumerate(zip(sentences, weights)):
            dur_ms = max(250, int(round((w / total_w) * total_ms)))
            if idx == len(sentences) - 1:
                dur_ms = max(250, total_ms - cursor_ms)
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

        return cues

    async def synthesize_wav_async(
        self,
        text: str,
        language: str = "en",
        voice: str = "charvi",
        audio_speed: float = 1.0,
        settings: Settings | None = None,
    ) -> dict[str, Any]:
        """Asynchronous wrapper running Mithi inference in worker thread."""
        return await asyncio.to_thread(
            self.synthesize_wav_sync,
            text=text,
            language=language,
            voice=voice,
            audio_speed=audio_speed,
            settings=settings,
        )

    def warmup_and_preload_cache(self, settings: Settings | None = None) -> None:
        """Warm up Mithi v2 Flash weights on GPU and pre-synthesize all predefined lines."""
        cfg = settings or get_settings()
        cache_dir = self._get_cache_dir(cfg)

        logger.info("Starting Mithi TTS warmup and cache preloading...")
        # 1. Warm up the engine on GPU/CPU
        try:
            self._get_engine(cfg)
        except Exception as exc:
            logger.error("Failed to warmup Mithi engine: %s", exc)
            return

        # 2. Iterate through PREDEFINED_NARRATION_LINES
        preloaded_count = 0
        newly_synthesized = 0
        for item in PREDEFINED_NARRATION_LINES:
            text = item["text"]
            lang = item["lang"]
            voice = item.get("voice", "charvi")
            speed = float(item.get("speed", 1.0))
            cleaned = preprocess_text_for_speech(text)
            c_key = self._compute_cache_key(cleaned, resolve_mithi_lang(lang), resolve_mithi_voice(voice), speed)
            wav_path = cache_dir / f"{c_key}.wav"
            json_path = cache_dir / f"{c_key}.json"

            if wav_path.exists() and json_path.exists():
                try:
                    meta = json.loads(json_path.read_text(encoding="utf-8"))
                    wav_bytes = wav_path.read_bytes()
                    self._mem_cache[c_key] = {
                        "wav_bytes": wav_bytes,
                        "duration_seconds": meta["duration_seconds"],
                        "inference_seconds": 0.001,
                        "cleaned_text": cleaned,
                        "voice_name": meta["voice_name"],
                        "language": meta["language"],
                        "device": meta.get("device", self._loaded_device or "cuda"),
                        "peak_vram_mb": meta.get("peak_vram_mb", 0.0),
                        "sample_rate": meta.get("sample_rate", 24000),
                        "sentence_cues": meta.get("sentence_cues", []),
                        "cached": True,
                        "cache_key": c_key,
                    }
                    preloaded_count += 1
                    continue
                except Exception:
                    pass

            # Synthesize and write to cache
            try:
                res = self.synthesize_wav_sync(
                    text=text,
                    language=lang,
                    voice=voice,
                    audio_speed=speed,
                    settings=cfg,
                )
                newly_synthesized += 1
                logger.info("Pre-synthesized narration line: [%s...] (%ss)", cleaned[:30], res["duration_seconds"])
            except Exception as e:
                logger.warning("Could not pre-synthesize line [%s...]: %s", cleaned[:30], e)

        logger.info(
            "Mithi TTS warmup finished: %d preloaded from disk, %d newly synthesized. Total in-memory: %d",
            preloaded_count,
            newly_synthesized,
            len(self._mem_cache),
        )


mithi_tts_service = MithiTTSService()


def get_mithi_service() -> MithiTTSService:
    """Return singleton MithiTTSService instance."""
    return mithi_tts_service
