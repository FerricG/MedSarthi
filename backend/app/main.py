"""FastAPI entrypoint for MedSarthi (educational prototype using synthetic data only)."""

from contextlib import asynccontextmanager
import sys
import threading
import uuid
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import get_settings
from app.core.database import init_db
from app.core.exceptions import AppError
from app.routes import (
    audio,
    auth,
    chat,
    consent,
    demo,
    doctor,
    documents,
    explain,
    health,
    knowledge,
    patients,
    remote_upload,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize SQLite schema + FTS5 index, storage, and background QR upload server."""
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    await init_db()
    if settings.QR_UPLOAD_AUTO_START and "pytest" not in sys.modules:
        from app.services.media.qr_upload_service import qr_upload_manager

        threading.Thread(target=qr_upload_manager.start, daemon=True).start()

    if "pytest" not in sys.modules:
        from app.services.media.mithi_service import mithi_tts_service

        threading.Thread(
            target=mithi_tts_service.warmup_and_preload_cache,
            daemon=True,
            name="mithi-startup-warmup",
        ).start()
    try:
        yield
    finally:
        if "pytest" not in sys.modules:
            from app.services.media.qr_upload_service import qr_upload_manager

            qr_upload_manager.stop()


def create_app() -> FastAPI:
    """Create and configure the MedSarthi FastAPI application."""
    app = FastAPI(
        title="MedSarthi API",
        version="0.1.0",
        description=(
            "Multilingual, accessibility-first healthcare communication prototype. "
            "Educational prototype using synthetic data only; not clinically validated."
        ),
        lifespan=lifespan,
    )

    cors_regex = (
        r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
        if settings.APP_ENV == "development" or settings.DEBUG
        else None
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_ORIGIN, "http://127.0.0.1:3000"],
        allow_origin_regex=cors_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:16]}"
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", f"req_{uuid.uuid4().hex[:16]}")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                    "request_id": request_id,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", f"req_{uuid.uuid4().hex[:16]}")
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed.",
                    "details": exc.errors(),
                    "request_id": request_id,
                }
            },
        )

    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(demo.router, prefix="/api")
    app.include_router(patients.router, prefix="/api")
    app.include_router(consent.router, prefix="/api")
    app.include_router(explain.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(documents.router, prefix="/api")
    app.include_router(audio.router, prefix="/api")
    app.include_router(doctor.router, prefix="/api")
    app.include_router(knowledge.router, prefix="/api")
    app.include_router(remote_upload.router, prefix="/api")
    return app


app = create_app()
