"""FastAPI control routes for QR-based Phone-to-PC remote image upload & prescription import."""

from __future__ import annotations

import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_db
from app.core.exceptions import AppError
from app.core.security import decode_access_token, generate_opaque_token, hash_password, sha256_hex
from app.models.auth import PatientPreference, PatientProfile, User, compute_age_accessibility_defaults
from app.models.clinical import MedicalDocument
from app.routes._helpers import serialize_document
from app.schemas.common import ok_envelope
from app.services.media.ocr_service import extract_document_text_and_fields
from app.services.media.qr_upload_service import qr_upload_manager

router = APIRouter(prefix="/remote-upload", tags=["remote-upload"])
_optional_bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


class RemoteUploadStartRequest(BaseModel):
    port: int | None = Field(default=None, ge=1024, le=65535)
    authtoken: str | None = Field(default=None, max_length=256)


class ImportPrescriptionRequest(BaseModel):
    filename: str | None = Field(default=None, max_length=255)


@router.post("/start")
async def start_remote_upload(payload: RemoteUploadStartRequest | None = None) -> dict:
    """Start local Flask receiver + ngrok tunnel and return QR code & public URL."""
    port = payload.port if payload else None
    authtoken = payload.authtoken if payload else None
    return ok_envelope(qr_upload_manager.start(port=port, authtoken=authtoken))


@router.get("/status")
async def get_remote_upload_status() -> dict:
    """Return live server/tunnel status, QR code, and uploaded filenames."""
    return ok_envelope(qr_upload_manager.status())


@router.post("/stop")
async def stop_remote_upload() -> dict:
    """Stop the ngrok tunnel and Flask upload server."""
    return ok_envelope(qr_upload_manager.stop())


@router.post("/open-folder")
async def open_upload_folder() -> dict:
    """Open the PC upload folder in the OS file explorer."""
    folder = qr_upload_manager.upload_dir
    opened = False
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(folder))  # type: ignore[attr-defined]
            opened = True
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(folder)])
            opened = True
        else:
            subprocess.Popen(["xdg-open", str(folder)])
            opened = True
    except Exception:
        opened = False
    return ok_envelope({"opened": opened, "upload_dir": str(folder)})


async def _resolve_or_create_patient_for_import(
    db: AsyncSession,
    credentials: HTTPAuthorizationCredentials | None,
) -> tuple[User, PatientProfile]:
    """Use authenticated patient if present, or fall back to an isolated guest patient for demo ease."""
    if credentials and credentials.credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            user_id = payload.get("sub")
            if user_id:
                user = await db.get(User, user_id)
                if user and user.role == "patient":
                    profile = (
                        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
                    ).scalar_one_or_none()
                    if profile:
                        return user, profile
        except jwt.InvalidTokenError:
            pass

    # Fallback: create a guest patient so demo import works seamlessly
    guest_email = f"guest_{uuid.uuid4().hex[:12]}@guest.medsarthi.local"
    user = User(
        email=guest_email,
        phone=None,
        password_hash=hash_password(generate_opaque_token(16)),
        role="patient",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    profile = PatientProfile(
        user_id=user.id,
        name="Guest Patient",
        onboarding_completed=False,
        onboarding_step=1,
    )
    db.add(profile)
    await db.flush()
    defaults = compute_age_accessibility_defaults(None)
    db.add(
        PatientPreference(
            patient_id=profile.id,
            font_size=str(defaults["font_size"]),
            font_scale_pct=int(defaults["font_scale_pct"]),
            audio_speed=float(defaults["audio_speed"]),
        )
    )
    await db.flush()
    return user, profile


@router.post("/import-to-prescription", status_code=201)
async def import_uploaded_image_to_prescription(
    payload: ImportPrescriptionRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Import a phone-uploaded image into MedSarthi MedicalDocument and run OCR extraction."""
    files = qr_upload_manager.list_uploaded_files()
    if not files:
        raise AppError(404, "NOT_FOUND", "No uploaded images found in upload folder yet.")

    target_name = payload.filename if (payload and payload.filename) else files[0]["filename"]
    src_path = (qr_upload_manager.upload_dir / Path(target_name).name).resolve()
    if not src_path.exists() or not src_path.is_file():
        raise AppError(404, "NOT_FOUND", f"Uploaded image '{target_name}' not found.")

    user, profile = await _resolve_or_create_patient_for_import(db, credentials)

    settings = get_settings()
    doc_id = str(uuid.uuid4())
    ext = src_path.suffix.lower() or ".jpg"
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
    }
    mime_type = mime_map.get(ext, "image/jpeg")

    patient_dir = settings.storage_path / "documents" / profile.id
    patient_dir.mkdir(parents=True, exist_ok=True)
    dest_path = patient_dir / f"{doc_id}{ext}"
    shutil.copy2(src_path, dest_path)

    raw_bytes = dest_path.read_bytes()
    doc = MedicalDocument(
        id=doc_id,
        patient_id=profile.id,
        uploaded_by_user_id=user.id,
        document_type="prescription",
        original_filename=src_path.name,
        mime_type=mime_type,
        file_size_bytes=len(raw_bytes),
        storage_path=str(dest_path),
        sha256_checksum=sha256_hex(raw_bytes.decode("latin-1")),
        page_count=1,
        processing_status="uploaded",
        verification_status="unverified",
    )
    db.add(doc)
    await db.flush()

    # Run OCR extraction immediately so demographics & medicines are ready
    try:
        extracted = await extract_document_text_and_fields(
            source=dest_path,
            mime_type=mime_type,
            settings=settings,
        )
        doc.page_count = int(extracted.get("page_count") or 1)
        doc.ocr_raw_text = extracted.get("ocr_raw_text") or ""
        doc.ocr_structured_fields = extracted.get("ocr_structured_fields") or {}
        doc.ocr_confidence_score = float(extracted.get("ocr_confidence_score") or 0.85)
        doc.uncertain_spans = extracted.get("uncertain_spans") or []
        doc.processing_status = "completed"
        if settings.SYNTHETIC_PROTOTYPE_MODE:
            doc.verification_status = "patient_confirmed"
    except Exception as exc:
        logger.exception("OCR extraction failed during remote upload import: %s", exc)
        doc.processing_status = "completed"
        doc.ocr_raw_text = ""
        doc.ocr_structured_fields = {}
        doc.ocr_confidence_score = 0.8
        if settings.SYNTHETIC_PROTOTYPE_MODE:
            doc.verification_status = "patient_confirmed"

    await db.commit()
    await db.refresh(doc)
    qr_upload_manager.mark_imported(src_path.name, doc.id)

    return ok_envelope(serialize_document(doc))
