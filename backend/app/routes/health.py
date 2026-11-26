"""Health check endpoint (public, zero PHI)."""

import importlib.util
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import get_db
from app.core.exceptions import AppError
from app.schemas.common import ok_envelope

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    """Verify SQLite WAL database, storage directory, local PDF/TTS packages, and provider status."""
    settings = get_settings()

    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:
        raise AppError(503, "PROVIDER_UNAVAILABLE", f"Database unavailable: {exc}") from exc

    try:
        settings.storage_path.mkdir(parents=True, exist_ok=True)
        storage_status = "ok"
    except Exception as exc:
        raise AppError(503, "PROVIDER_UNAVAILABLE", f"Storage path error: {exc}") from exc

    has_pymupdf = importlib.util.find_spec("fitz") is not None
    has_rapidocr = importlib.util.find_spec("rapidocr") is not None
    has_torch = importlib.util.find_spec("torch") is not None
    has_cuda = False
    if has_torch:
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except Exception:
            has_cuda = False

    has_mithi = settings.mithi_model_path.exists()

    if has_pymupdf and has_rapidocr:
        ocr_local = "pymupdf+rapidocr"
    elif has_pymupdf:
        ocr_local = "pymupdf"
    else:
        ocr_local = "unavailable"

    tts_status = "mithi_v2_flash_cuda" if (has_mithi and has_cuda) else ("mithi_v2_flash_cpu" if has_mithi else "unavailable")

    return ok_envelope(
        {
            "status": "ok",
            "prototype": True,
            "prototype_notice": settings.PROTOTYPE_NOTICE,
            "db": db_status,
            "storage": storage_status,
            "ocr_local": ocr_local,
            "tts_local": tts_status,
            "ai_providers": {
                "llm": (
                    "configured"
                    if (
                        settings.GROQ_API_KEY
                        or settings.GEMINI_API_KEY
                        or settings.OPENAI_API_KEY
                        or settings.OPENROUTER_API_KEY
                    )
                    else "fallback_deterministic"
                ),
                "ocr": (
                    "configured"
                    if settings.GOOGLE_CLOUD_VISION_API_KEY
                    else ("pymupdf_rapidocr_local" if has_pymupdf and has_rapidocr else "pymupdf_local")
                ),
                "stt": "configured" if (settings.DEEPGRAM_API_KEY or settings.GROQ_API_KEY) else "fallback_browser",
                "tts": tts_status,
            },
        }
    )
