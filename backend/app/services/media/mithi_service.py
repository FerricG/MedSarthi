"""Mithi v2 Flash multilingual text-to-speech engine with NVIDIA RTX 3050 GPU acceleration and CPU fallback."""

from __future__ import annotations

import asyncio
import io
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


class MithiTTSService:
    """Thread-safe, singleton Mithi v2 Flash TTS service with GPU acceleration and CPU fallback."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._engine: Any = None
        self._loaded_device: str | None = None
        self._load_lock = threading.Lock()

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
        """Synthesize text into 24kHz mono 16-bit PCM WAV bytes with timing cues."""
        cleaned_text = preprocess_text_for_speech(text)
        if not cleaned_text:
            raise AppError(422, "VALIDATION_ERROR", "Speech synthesis text cannot be empty.")

        target_lang = resolve_mithi_lang(language)
        target_voice = resolve_mithi_voice(voice)

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
        if abs(audio_speed - 1.0) > 0.02:
            final_wav_bytes, final_duration_s = self._apply_tempo(
                wav_bytes,
                audio_speed=audio_speed,
                orig_duration_s=raw_duration_s,
            )

        # Calculate accurate sentence cues
        cues = self._generate_sentence_cues(cleaned_text, final_duration_s)

        peak_vram_mb = 0.0
        if torch.cuda.is_available() and device == "cuda":
            peak_vram_mb = round(torch.cuda.max_memory_allocated() / (1024 * 1024), 2)

        return {
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
        }

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


mithi_tts_service = MithiTTSService()
