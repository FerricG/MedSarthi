"""Shared access-control, personalization, and DTO serialization helpers for MedSarthi routes."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import require_doctor_patient_link
from app.core.exceptions import AppError
from app.models.auth import (
    DoctorProfile,
    PatientPreference,
    PatientProfile,
    User,
    compute_age_accessibility_defaults,
)
from app.models.clinical import AudioRecord, Consultation, MedicalDocument
from app.services.ai.base import PersonalizationContext, normalize_depth, normalize_language
from app.services.knowledge.retriever import knowledge_retriever, list_diagrams


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso_or_none(dt: Any) -> str | None:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def comfort_to_default_depth(comfort: str | None) -> str:
    if comfort == "very_simple":
        return "very_simple"
    if comfort == "comfortable":
        return "detailed"
    return "simple"


async def get_patient_profile_for_user(
    db: AsyncSession,
    user: User,
    required: bool = True,
) -> PatientProfile | None:
    stmt = select(PatientProfile).where(
        PatientProfile.user_id == user.id,
        PatientProfile.deleted_at.is_(None),
    )
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if required and not profile:
        raise AppError(404, "NOT_FOUND", "Patient profile not found.")
    return profile


async def get_doctor_profile_for_user(
    db: AsyncSession,
    user: User,
    required: bool = True,
) -> DoctorProfile | None:
    stmt = select(DoctorProfile).where(
        DoctorProfile.user_id == user.id,
        DoctorProfile.deleted_at.is_(None),
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if required and not doc:
        raise AppError(404, "NOT_FOUND", "Doctor profile not found.")
    return doc


async def ensure_patient_preferences(
    db: AsyncSession,
    profile: PatientProfile,
) -> PatientPreference:
    prefs = (
        await db.execute(
            select(PatientPreference).where(PatientPreference.patient_id == profile.id)
        )
    ).scalar_one_or_none()
    if prefs:
        return prefs
    defaults = compute_age_accessibility_defaults(profile.age_years)
    prefs = PatientPreference(
        patient_id=profile.id,
        font_size=str(defaults["font_size"]),
        font_scale_pct=int(defaults["font_scale_pct"]),
        audio_speed=float(defaults["audio_speed"]),
    )
    db.add(prefs)
    await db.flush()
    return prefs


async def build_personalization_context(
    db: AsyncSession,
    patient_id: str | None = None,
    override_language: str | None = None,
    override_depth: str | None = None,
) -> PersonalizationContext:
    profile = await db.get(PatientProfile, patient_id) if patient_id else None
    prefs = None
    if profile:
        prefs = (
            await db.execute(
                select(PatientPreference).where(PatientPreference.patient_id == profile.id)
            )
        ).scalar_one_or_none()
    return PersonalizationContext.from_models(
        profile=profile,
        prefs=prefs,
        override_language=override_language,
        override_depth=override_depth,
    )


async def check_consultation_access(
    db: AsyncSession,
    current_user: User,
    consultation_id: str,
    require_shared_for_patient: bool = True,
    require_doctor_ownership: bool = False,
) -> Consultation:
    consult = (
        await db.execute(
            select(Consultation).where(
                Consultation.id == consultation_id,
                Consultation.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not consult:
        raise AppError(404, "NOT_FOUND", "Consultation not found.")

    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        if consult.patient_id != profile.id:  # type: ignore[union-attr]
            raise AppError(403, "RBAC_FORBIDDEN", "You do not have access to this consultation.")
        if require_shared_for_patient and consult.sharing_status != "shared_with_patient":
            raise AppError(
                403,
                "RBAC_FORBIDDEN",
                "This consultation is not shared with the patient yet.",
            )
        return consult

    doc = await get_doctor_profile_for_user(db, current_user)
    if require_doctor_ownership and consult.doctor_id and consult.doctor_id != doc.id:  # type: ignore[union-attr]
        raise AppError(403, "RBAC_FORBIDDEN", "You do not own this consultation draft.")
    await require_doctor_patient_link(db, doc.id, consult.patient_id)  # type: ignore[union-attr]
    return consult


async def check_document_access(
    db: AsyncSession,
    current_user: User,
    document_id: str,
) -> MedicalDocument:
    doc = (
        await db.execute(
            select(MedicalDocument).where(
                MedicalDocument.id == document_id,
                MedicalDocument.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise AppError(404, "NOT_FOUND", "Medical document not found.")

    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        if doc.patient_id != profile.id:  # type: ignore[union-attr]
            raise AppError(403, "RBAC_FORBIDDEN", "You do not have access to this document.")
        return doc

    doctor = await get_doctor_profile_for_user(db, current_user)
    await require_doctor_patient_link(db, doctor.id, doc.patient_id)  # type: ignore[union-attr]
    return doc


def resolve_storage_path(rel_or_abs: str | None) -> Path | None:
    if not rel_or_abs:
        return None
    settings = get_settings()
    base = settings.storage_path.resolve()
    raw = Path(rel_or_abs)
    target = raw.resolve() if raw.is_absolute() else (base / raw).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return None
    return target


def delete_storage_file_safe(rel_or_abs: str | None) -> bool:
    target = resolve_storage_path(rel_or_abs)
    if target and target.exists() and target.is_file():
        target.unlink()
        return True
    return False


def serialize_consultation_summary(
    consult: Consultation,
    doctor_name: str | None = None,
) -> dict[str, Any]:
    return {
        "id": consult.id,
        "patient_id": consult.patient_id,
        "doctor_id": consult.doctor_id,
        "doctor_name": doctor_name,
        "source_type": consult.source_type,
        "title": consult.title,
        "visit_date": consult.visit_date.isoformat() if consult.visit_date else None,
        "explanation_language": consult.explanation_language,
        "explanation_depth": consult.explanation_depth,
        "approval_status": consult.approval_status,
        "sharing_status": consult.sharing_status,
        "integrity_status": consult.integrity_status,
        "created_at": iso_or_none(consult.created_at),
        "updated_at": iso_or_none(consult.updated_at),
    }


async def extract_visuals_and_terms(
    db: AsyncSession,
    text: str,
    language: str = "en",
    depth: str = "simple",
) -> tuple[list[dict[str, Any]], list[str]]:
    if not text.strip():
        return [], []
    entries = await knowledge_retriever.find_relevant_entries(
        db, text, language=language, limit=6
    )
    seen_diagrams: set[str] = set()
    diagrams: list[dict[str, Any]] = []
    highlighted_terms: list[str] = []

    for entry in entries:
        canon = entry.get("canonical_name")
        if canon and canon not in highlighted_terms:
            highlighted_terms.append(canon)
        for alias in entry.get("aliases") or []:
            alias_s = str(alias)
            if len(alias_s) >= 3 and alias_s.lower() in text.lower() and alias_s not in highlighted_terms:
                highlighted_terms.append(alias_s)
        d_key = entry.get("diagram_key")
        if d_key and d_key not in seen_diagrams:
            seen_diagrams.add(d_key)
            diagrams.extend(list_diagrams(language=language, key=d_key, depth=depth))
    return diagrams, highlighted_terms


async def serialize_consultation_detail(
    db: AsyncSession,
    consult: Consultation,
    doctor_name: str | None = None,
    language: str | None = None,
    visual_diagrams: list[dict[str, Any]] | None = None,
    highlighted_terms: list[str] | None = None,
) -> dict[str, Any]:
    if doctor_name is None and consult.doctor_id:
        doc_row = await db.get(DoctorProfile, consult.doctor_id)
        doctor_name = doc_row.full_name if doc_row else None

    lang = normalize_language(language or consult.explanation_language)
    depth = normalize_depth(consult.explanation_depth)
    if visual_diagrams is None or highlighted_terms is None:
        comp_diagrams, comp_terms = await extract_visuals_and_terms(
            db, consult.original_doctor_input, language=lang, depth=depth
        )
        if visual_diagrams is None:
            visual_diagrams = comp_diagrams
        if highlighted_terms is None:
            highlighted_terms = comp_terms

    base = serialize_consultation_summary(consult, doctor_name=doctor_name)
    base.update(
        {
            "original_doctor_input": consult.original_doctor_input,
            "original_input_hash": consult.original_input_hash,
            "original_input_locked_at": iso_or_none(consult.original_input_locked_at),
            "structured_data": consult.structured_data or {},
            "generated_explanation": consult.generated_explanation,
            "integrity_report": consult.integrity_report,
            "visual_diagrams": visual_diagrams,
            "highlighted_terms": highlighted_terms,
        }
    )
    return base


def serialize_document(doc: MedicalDocument) -> dict[str, Any]:
    preview_path = f"/api/documents/{doc.id}/preview?page=1"
    return {
        "id": doc.id,
        "patient_id": doc.patient_id,
        "consultation_id": doc.consultation_id,
        "document_type": doc.document_type,
        "original_filename": doc.original_filename,
        "mime_type": doc.mime_type,
        "file_size_bytes": doc.file_size_bytes,
        "page_count": doc.page_count,
        "ocr_raw_text": doc.ocr_raw_text,
        "ocr_structured_fields": doc.ocr_structured_fields,
        "ocr_confidence_score": doc.ocr_confidence_score,
        "uncertain_spans": doc.uncertain_spans or [],
        "processing_status": doc.processing_status,
        "verification_status": doc.verification_status,
        "preview_url": preview_path,
        "signed_preview_url": preview_path,
        "created_at": iso_or_none(doc.created_at),
        "verified_at": iso_or_none(doc.verified_at),
    }


def serialize_kb_term(entry: dict[str, Any]) -> dict[str, Any]:
    meta = entry.get("metadata_json") or {}
    return {
        "id": entry.get("id"),
        "canonical_name": entry.get("canonical_name"),
        "slug": entry.get("slug"),
        "entry_type": entry.get("entry_type"),
        "aliases": entry.get("aliases") or [],
        "body_system": entry.get("body_system"),
        "pronunciation": meta.get("pronunciation") or entry.get("canonical_name"),
        "simple_en": entry.get("simple_en"),
        "detailed_en": entry.get("detailed_en"),
        "localized_name": entry.get("localized_name"),
        "localized_simple": entry.get("localized_simple"),
        "localized_detailed": entry.get("localized_detailed"),
        "hinglish_explanation": entry.get("hinglish_simple") or entry.get("simple_en"),
        "usage_example": meta.get("usage_example"),
        "when_to_ask_doctor": meta.get("when_to_ask_doctor"),
        "normal_ranges_info": meta.get("normal_ranges_info"),
        "related_slugs": meta.get("related_slugs") or [],
        "curated_diagram_key": entry.get("diagram_key") or meta.get("curated_diagram_key"),
        "diagram": entry.get("diagram"),
        "source_name": entry.get("source_name"),
        "source_url": entry.get("source_url"),
        "last_reviewed_at": entry.get("last_reviewed_at"),
        "translations": entry.get("translations") or {},
        "metadata_json": meta,
    }


def serialize_audio_record(rec: AudioRecord) -> dict[str, Any]:
    segments = (
        rec.tts_cues
        if rec.audio_purpose != "tts_output" and isinstance(rec.tts_cues, list)
        else []
    )
    return {
        "audio_id": rec.id,
        "consultation_id": rec.consultation_id,
        "audio_purpose": rec.audio_purpose,
        "duration_seconds": rec.duration_seconds,
        "processing_status": rec.processing_status,
        "stt_language_detected": rec.stt_language_detected,
        "stt_confidence_score": rec.stt_confidence_score,
        "transcript_raw": rec.transcript_raw,
        "transcript_segments": segments,
        "speaker_map_verified": rec.processing_status == "confirmed",
        "retention_policy": rec.retention_policy,
        "retention_expires_at": iso_or_none(rec.retention_expires_at),
        "audio_purged_at": iso_or_none(rec.purged_at),
    }


def format_integrity_and_safety(safety_summary: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build normalized IntegrityReport + enriched safety payload matching frontend and safety contracts."""
    report = dict(safety_summary.get("integrity_report") or {})
    status = safety_summary.get("integrity_status") or report.get("status") or "passed"
    report.setdefault("status", status)
    report.setdefault("mismatches", [])
    report.setdefault("disclaimer", safety_summary.get("disclaimer"))

    safety = {
        **report,
        "status": status,
        "integrity_status": status,
        "guardrail_check": safety_summary.get("guardrail_check"),
        "emergency_flag": bool(safety_summary.get("emergency_flag", False)),
        "emergency_guidance": safety_summary.get("emergency_guidance"),
    }
    return report, safety


def format_emergency_guidance(
    emergency_dict: dict[str, Any],
    language: str = "en",
) -> dict[str, Any]:
    guidance_map = emergency_dict.get("guidance") or {}
    lang = normalize_language(language)
    banner_message = (
        guidance_map.get(lang)
        or guidance_map.get("en")
        or "Urgent symptoms detected. Call 112 or 108 immediately or go to the nearest emergency room."
    )
    helplines = [
        {
            "label": h.get("name") or h.get("label") or "Emergency Helpline",
            "number": h.get("number", "112"),
        }
        for h in (emergency_dict.get("helplines") or [])
    ]
    if not helplines:
        helplines = [
            {"label": "National Emergency Helpline", "number": "112"},
            {"label": "Ambulance Services", "number": "108"},
        ]
    return {
        "is_emergency": bool(emergency_dict.get("is_emergency", False)),
        "severity": "emergency",
        "matched_triggers": list(emergency_dict.get("matched_phrases") or []),
        "banner_title": "Urgent Medical Care Needed",
        "banner_message": banner_message,
        "helplines": helplines,
    }
