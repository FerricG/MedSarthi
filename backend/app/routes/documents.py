"""Medical document upload, PyMuPDF/RapidOCR extraction, split-screen verification, and explain routes."""

from __future__ import annotations

from typing import Any
import uuid
from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import get_current_user, get_db, require_doctor_patient_link
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.clinical import MedicalDocument
from app.routes._helpers import (
    build_personalization_context,
    check_consultation_access,
    check_document_access,
    delete_storage_file_safe,
    format_integrity_and_safety,
    get_doctor_profile_for_user,
    get_patient_profile_for_user,
    resolve_storage_path,
    serialize_document,
    utcnow,
)
from app.routes.explain import _enforce_document_ocr_gate
from app.schemas.clinical import DocumentExplainRequest, DocumentVerifyRequest
from app.schemas.common import ok_envelope
from app.services.ai.explanation_service import explanation_service
from app.services.media.ocr_service import (
    extract_document_text_and_fields,
    render_document_page_png,
    validate_document_upload,
)

router = APIRouter(prefix="/documents", tags=["documents"])

_VALID_DOC_TYPES = {
    "prescription",
    "lab_report",
    "discharge_summary",
    "clinical_note",
    "other",
}
_MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    document_type: str = Form("other"),
    consultation_id: str | None = Form(default=None),
    patient_id: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Validate magic bytes/size, store private file outside web root, and create MedicalDocument."""
    if document_type not in _VALID_DOC_TYPES:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"document_type must be one of {sorted(_VALID_DOC_TYPES)}.",
        )

    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        assert profile is not None
        if patient_id and patient_id != profile.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot upload a document for another patient.")
        resolved_patient_id = profile.id
    else:
        doctor = await get_doctor_profile_for_user(db, current_user)
        assert doctor is not None
        if not patient_id:
            raise AppError(422, "VALIDATION_ERROR", "patient_id is required for doctor uploads.")
        await require_doctor_patient_link(db, doctor.id, patient_id)
        resolved_patient_id = patient_id

    if consultation_id:
        consult = await check_consultation_access(
            db, current_user, consultation_id, require_shared_for_patient=False
        )
        if consult.patient_id != resolved_patient_id:
            raise AppError(
                403,
                "RBAC_FORBIDDEN",
                "Consultation does not belong to the specified patient.",
            )

    file_bytes = await file.read()
    meta = validate_document_upload(file_bytes, file.filename)

    settings = get_settings()
    doc_id = str(uuid.uuid4())
    ext = _MIME_TO_EXT.get(meta["mime_type"], ".bin")
    rel_path = f"documents/{resolved_patient_id}/{doc_id}{ext}"
    abs_path = (settings.storage_path / rel_path).resolve()
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(file_bytes)

    doc = MedicalDocument(
        id=doc_id,
        patient_id=resolved_patient_id,
        consultation_id=consultation_id,
        uploaded_by_user_id=current_user.id,
        document_type=document_type,
        original_filename=meta["original_filename"],
        mime_type=meta["mime_type"],
        file_size_bytes=meta["file_size_bytes"],
        storage_path=rel_path,
        sha256_checksum=meta["sha256_checksum"],
        page_count=meta["page_count"],
        processing_status="uploaded",
        verification_status="unverified",
        uncertain_spans=[],
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return ok_envelope(serialize_document(doc))


@router.get("")
async def list_documents(
    patient_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List documents scoped strictly to the owning patient or consented doctor."""
    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        assert profile is not None
        if patient_id and patient_id != profile.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot list another patient's documents.")
        target_patient_id = profile.id
    else:
        doctor = await get_doctor_profile_for_user(db, current_user)
        assert doctor is not None
        if not patient_id:
            raise AppError(422, "VALIDATION_ERROR", "patient_id query parameter is required.")
        await require_doctor_patient_link(db, doctor.id, patient_id)
        target_patient_id = patient_id

    rows = (
        await db.execute(
            select(MedicalDocument)
            .where(
                MedicalDocument.patient_id == target_patient_id,
                MedicalDocument.deleted_at.is_(None),
            )
            .order_by(MedicalDocument.created_at.desc())
        )
    ).scalars().all()
    return ok_envelope([serialize_document(d) for d in rows])


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return metadata and OCR fields for a single authorized medical document."""
    doc = await check_document_access(db, current_user, document_id)
    return ok_envelope(serialize_document(doc))


@router.get("/{document_id}/preview")
async def preview_document_page(
    document_id: str,
    page: int = Query(default=1, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Render authenticated PDF/image page as PNG bytes with nosniff and private no-store headers."""
    doc = await check_document_access(db, current_user, document_id)
    abs_path = resolve_storage_path(doc.storage_path)
    if not abs_path or not abs_path.exists():
        raise AppError(404, "NOT_FOUND", "Document file preview is unavailable on disk.")

    png_bytes = render_document_page_png(abs_path, mime_type=doc.mime_type, page_num=page)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{document_id}/extract")
async def extract_document_ocr(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run PyMuPDF / RapidOCR / cloud OCR extraction and flag <0.75 or [UNREADABLE] spans."""
    doc = await check_document_access(db, current_user, document_id)
    abs_path = resolve_storage_path(doc.storage_path)
    if not abs_path or not abs_path.exists():
        if doc.ocr_raw_text is not None:
            return ok_envelope(serialize_document(doc))
        raise AppError(404, "NOT_FOUND", "Uploaded document file not found in storage.")

    ocr_res = await extract_document_text_and_fields(abs_path, mime_type=doc.mime_type)
    doc.page_count = int(ocr_res["page_count"])
    doc.ocr_raw_text = ocr_res["ocr_raw_text"]
    doc.ocr_structured_fields = ocr_res["ocr_structured_fields"]
    doc.ocr_confidence_score = float(ocr_res["ocr_confidence_score"])
    doc.uncertain_spans = ocr_res["uncertain_spans"]
    doc.processing_status = ocr_res["processing_status"]
    await db.commit()
    await db.refresh(doc)
    return ok_envelope(serialize_document(doc))


@router.post("/{document_id}/verify")
async def verify_document_ocr(
    document_id: str,
    payload: DocumentVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Confirm/correct extracted OCR text and fields, or mark the scan unreadable."""
    doc = await check_document_access(db, current_user, document_id)
    now = utcnow()
    if payload.verification_decision == "confirm":
        if payload.corrected_ocr_text is not None:
            doc.ocr_raw_text = payload.corrected_ocr_text
        if payload.corrected_structured_fields is not None:
            doc.ocr_structured_fields = payload.corrected_structured_fields
        doc.verification_status = (
            "doctor_verified" if current_user.role == "doctor" else "patient_confirmed"
        )
        doc.verified_by_user_id = current_user.id
        doc.verified_at = now
        if doc.processing_status in ("uploaded", "needs_verification", "failed"):
            doc.processing_status = "extracted"
    else:
        doc.verification_status = "rejected_unreadable"
        doc.verified_by_user_id = current_user.id
        doc.verified_at = now
        doc.processing_status = "needs_verification"

    await db.commit()
    await db.refresh(doc)
    return ok_envelope(serialize_document(doc))


@router.post("/{document_id}/explain")
async def explain_document(
    document_id: str,
    payload: DocumentExplainRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explain a verified document while enforcing the OCR No-Guessing Gate (<0.75 / [UNREADABLE])."""
    doc = await check_document_access(db, current_user, document_id)

    if doc.processing_status == "uploaded" and doc.ocr_raw_text is None:
        abs_path = resolve_storage_path(doc.storage_path)
        if abs_path and abs_path.exists():
            ocr_res = await extract_document_text_and_fields(abs_path, mime_type=doc.mime_type)
            doc.page_count = int(ocr_res["page_count"])
            doc.ocr_raw_text = ocr_res["ocr_raw_text"]
            doc.ocr_structured_fields = ocr_res["ocr_structured_fields"]
            doc.ocr_confidence_score = float(ocr_res["ocr_confidence_score"])
            doc.uncertain_spans = ocr_res["uncertain_spans"]
            doc.processing_status = ocr_res["processing_status"]
            await db.commit()
            await db.refresh(doc)

    ocr_warning = _enforce_document_ocr_gate(doc)
    req = payload or DocumentExplainRequest()
    prefs = await build_personalization_context(
        db,
        patient_id=doc.patient_id,
        override_language=req.target_language,
        override_depth=req.explanation_depth,
    )

    fields: dict[str, Any] = doc.ocr_structured_fields or {}
    lab_items = list(fields.get("tests") or fields.get("lab_rows") or [])
    if doc.document_type == "lab_report" or lab_items:
        res = await explanation_service.explain_report(
            session=db,
            structured_lab_items=lab_items,
            raw_report_text=doc.ocr_raw_text or "",
            prefs=prefs,
            target_language=req.target_language,
            uncertain_spans=doc.uncertain_spans or None,
        )
    else:
        res = await explanation_service.explain_clinical_input(
            session=db,
            source_text=doc.ocr_raw_text or "",
            input_type=doc.document_type,
            structured_data=fields,
            prefs=prefs,
        )

    doc.processing_status = "completed"
    await db.commit()

    integrity, safety = format_integrity_and_safety(res["safety"])
    return ok_envelope(
        {
            "document_id": doc.id,
            "provenance": res["provenance"],
            "integrity": integrity,
            "safety": safety,
            "visual_diagrams": res["visual_diagrams"],
            "ocr_warning": ocr_warning,
        }
    )


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Wipe file on disk and soft-delete the MedicalDocument record."""
    doc = await check_document_access(db, current_user, document_id)
    delete_storage_file_safe(doc.storage_path)
    doc.deleted_at = utcnow()
    await db.commit()
    return ok_envelope({"id": doc.id, "deleted_at": doc.deleted_at.isoformat()})
