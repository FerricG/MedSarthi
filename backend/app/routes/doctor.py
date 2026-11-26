"""Doctor clinical workspace routes: linked patients, consultations, generate, edit, approve, and share."""

from __future__ import annotations

from typing import Any
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import get_db, require_doctor_patient_link, require_role
from app.core.exceptions import AppError
from app.core.security import generate_opaque_token, hash_password, sha256_hex
from app.models.auth import (
    DoctorPatientLink,
    PatientPreference,
    PatientProfile,
    User,
    compute_age_accessibility_defaults,
)
from app.models.clinical import Consultation
from app.routes._helpers import (
    build_personalization_context,
    check_consultation_access,
    comfort_to_default_depth,
    ensure_patient_preferences,
    get_doctor_profile_for_user,
    iso_or_none,
    serialize_consultation_detail,
    serialize_consultation_summary,
    utcnow,
)
from app.schemas.clinical import (
    DoctorConsultationApproveRequest,
    DoctorConsultationCreateRequest,
    DoctorConsultationGenerateRequest,
    DoctorConsultationShareRequest,
    DoctorConsultationUpdateRequest,
    DoctorPatientCreateRequest,
)
from app.schemas.common import ok_envelope
from app.services.ai.explanation_service import (
    DEFAULT_DISCLAIMER,
    _flatten_provenance_text,
    _normalize_provenance_shape,
    explanation_service,
)
from app.services.safety import check_instruction_integrity, validate_provenance_and_guardrails

router = APIRouter(prefix="/doctor", tags=["doctor"])


def _extract_ai_text_for_integrity(provenance: dict[str, Any] | None) -> str:
    """Extract patient-facing ai_simplified prose (summary + steps) so doctor_provided never masks AI tampering."""
    if not isinstance(provenance, dict):
        return ""
    ai_block = provenance.get("ai_simplified")
    parts: list[str] = []
    if isinstance(ai_block, dict):
        if ai_block.get("summary"):
            parts.append(str(ai_block["summary"]))
        for step in ai_block.get("steps") or []:
            if step:
                parts.append(str(step))
    elif isinstance(ai_block, str) and ai_block.strip():
        parts.append(ai_block)
    if parts:
        return "\n".join(parts)
    return _flatten_provenance_text(provenance)


def _evaluate_provenance_integrity(
    consult: Consultation,
    provenance: dict[str, Any],
    output_language: str,
    guardrail_check: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Run deterministic integrity + provenance guardrail checks over ai_simplified prose."""
    integrity_report = check_instruction_integrity(
        source_text=consult.original_doctor_input,
        output_text=_extract_ai_text_for_integrity(provenance),
        structured_source=consult.structured_data or None,
        output_language=output_language,
    )
    guardrail = guardrail_check or validate_provenance_and_guardrails(
        {"provenance": provenance, "safety": {"disclaimer": DEFAULT_DISCLAIMER}}
    )
    status = integrity_report["status"]
    if not guardrail.get("is_valid", True) and status == "passed":
        status = "warning"
    return status, integrity_report


@router.get("/patients")
async def list_doctor_patients(
    q: str = Query(default="", max_length=120),
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List strictly active, consented patients linked to this doctor."""
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None

    stmt = (
        select(DoctorPatientLink, PatientProfile, PatientPreference)
        .join(PatientProfile, PatientProfile.id == DoctorPatientLink.patient_id)
        .outerjoin(PatientPreference, PatientPreference.patient_id == PatientProfile.id)
        .where(
            DoctorPatientLink.doctor_id == doctor.id,
            DoctorPatientLink.consent_status == "active",
            DoctorPatientLink.revoked_at.is_(None),
            PatientProfile.deleted_at.is_(None),
        )
        .order_by(PatientProfile.name.asc())
    )
    if q.strip():
        stmt = stmt.where(PatientProfile.name.ilike(f"%{q.strip()}%"))

    rows = (await db.execute(stmt)).all()
    items = [
        {
            "id": link.id,
            "link_id": link.id,
            "patient_id": pat.id,
            "doctor_id": doctor.id,
            "name": pat.name,
            "display_name": pat.name,
            "age_years": pat.age_years,
            "preferred_language": prefs.preferred_language if prefs else "en",
            "reading_comfort_level": prefs.reading_comfort_level if prefs else "simple",
            "consent_status": link.consent_status,
            "consent_scope": link.consent_scope,
            "consent_granted_at": iso_or_none(link.consent_granted_at),
        }
        for link, pat, prefs in rows
    ]
    return ok_envelope(items)


@router.post("/patients", status_code=201)
async def create_synthetic_doctor_patient(
    payload: DoctorPatientCreateRequest,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a synthetic demo patient + preferences + active link (only in SYNTHETIC_PROTOTYPE_MODE)."""
    settings = get_settings()
    if not settings.SYNTHETIC_PROTOTYPE_MODE:
        raise AppError(
            403,
            "RBAC_FORBIDDEN",
            "Direct synthetic patient creation is disabled outside prototype mode.",
        )

    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None

    email = payload.email.strip().lower() if payload.email and payload.email.strip() else None
    phone = payload.phone.strip() if payload.phone and payload.phone.strip() else None
    if not email and not phone:
        email = f"synth.{uuid.uuid4().hex[:8]}@medsarthi.local"

    filters = []
    if email:
        filters.append(User.email == email)
    if phone:
        filters.append(User.phone == phone)
    existing = (await db.execute(select(User).where(or_(*filters)))).scalar_one_or_none()
    if existing:
        raise AppError(409, "VALIDATION_ERROR", "A patient with this email or phone already exists.")

    user = User(
        email=email,
        phone=phone,
        password_hash=hash_password(generate_opaque_token(16)),
        role="patient",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    profile = PatientProfile(
        user_id=user.id,
        name=payload.name.strip(),
        age_years=payload.age_years,
        gender=payload.gender,
        onboarding_completed=True,
        onboarding_step=7,
    )
    db.add(profile)
    await db.flush()

    defaults = compute_age_accessibility_defaults(payload.age_years)
    prefs = PatientPreference(
        patient_id=profile.id,
        preferred_language=payload.preferred_language,
        reading_comfort_level=payload.reading_comfort_level,
        explanation_depth=comfort_to_default_depth(payload.reading_comfort_level),
        font_size=str(defaults["font_size"]),
        font_scale_pct=int(defaults["font_scale_pct"]),
        audio_speed=float(defaults["audio_speed"]),
    )
    db.add(prefs)
    await db.flush()

    now = utcnow()
    link = DoctorPatientLink(
        doctor_id=doctor.id,
        patient_id=profile.id,
        consent_status="active",
        consent_scope="linked_care",
        initiated_by="patient",
        consent_granted_at=now,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    return ok_envelope(
        {
            "id": link.id,
            "link_id": link.id,
            "patient_id": profile.id,
            "doctor_id": doctor.id,
            "name": profile.name,
            "display_name": profile.name,
            "age_years": profile.age_years,
            "preferred_language": prefs.preferred_language,
            "reading_comfort_level": prefs.reading_comfort_level,
            "consent_status": link.consent_status,
            "consent_scope": link.consent_scope,
            "consent_granted_at": iso_or_none(link.consent_granted_at),
        }
    )


@router.post("/consultation", status_code=201)
async def create_doctor_consultation(
    payload: DoctorConsultationCreateRequest,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new consultation with immutable SHA-256 locked original doctor input."""
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    await require_doctor_patient_link(db, doctor.id, payload.patient_id)

    patient = await db.get(PatientProfile, payload.patient_id)
    if not patient or patient.deleted_at is not None:
        raise AppError(404, "NOT_FOUND", "Patient profile not found.")
    prefs = await ensure_patient_preferences(db, patient)

    now = utcnow()
    raw_input = payload.original_doctor_input.strip()
    consult = Consultation(
        patient_id=patient.id,
        doctor_id=doctor.id,
        source_type=payload.source_type,
        title=payload.title.strip(),
        visit_date=payload.visit_date,
        original_doctor_input=raw_input,
        original_input_hash=sha256_hex(raw_input),
        original_input_locked_at=now,
        transcript_audio_id=payload.transcript_audio_id,
        structured_data=payload.structured_data or {},
        explanation_language=prefs.preferred_language,
        explanation_depth=prefs.explanation_depth,
        approval_status="draft",
        sharing_status="private_draft",
        integrity_status="unchecked",
    )
    db.add(consult)
    await db.commit()
    await db.refresh(consult)

    return ok_envelope(
        await serialize_consultation_detail(db, consult, doctor_name=doctor.full_name)
    )


@router.get("/consultations")
async def list_doctor_consultations(
    patient_id: str | None = Query(default=None),
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List consultations authored by this doctor for actively consented patients."""
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None

    if patient_id:
        await require_doctor_patient_link(db, doctor.id, patient_id)

    stmt = (
        select(Consultation)
        .join(
            DoctorPatientLink,
            (DoctorPatientLink.patient_id == Consultation.patient_id)
            & (DoctorPatientLink.doctor_id == doctor.id),
        )
        .where(
            Consultation.doctor_id == doctor.id,
            Consultation.deleted_at.is_(None),
            DoctorPatientLink.consent_status == "active",
            DoctorPatientLink.revoked_at.is_(None),
        )
        .order_by(Consultation.visit_date.desc(), Consultation.created_at.desc())
    )
    if patient_id:
        stmt = stmt.where(Consultation.patient_id == patient_id)

    rows = (await db.execute(stmt)).scalars().all()
    return ok_envelope(
        [serialize_consultation_summary(c, doctor_name=doctor.full_name) for c in rows]
    )


@router.get("/consultation/{consultation_id}")
async def get_doctor_consultation(
    consultation_id: str,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve a single consultation owned by this doctor with active patient consent."""
    consult = await check_consultation_access(
        db,
        current_user,
        consultation_id,
        require_shared_for_patient=False,
        require_doctor_ownership=True,
    )
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    return ok_envelope(
        await serialize_consultation_detail(db, consult, doctor_name=doctor.full_name)
    )


@router.post("/consultation/{consultation_id}/generate")
async def generate_consultation_explanation(
    consultation_id: str,
    payload: DoctorConsultationGenerateRequest | None = None,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate personalized 4-way provenance explanation & run 13-rule Safety Integrity Checker."""
    consult = await check_consultation_access(
        db,
        current_user,
        consultation_id,
        require_shared_for_patient=False,
        require_doctor_ownership=True,
    )
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    req = payload or DoctorConsultationGenerateRequest()

    if not consult.original_input_locked_at:
        consult.original_input_locked_at = utcnow()
    if not consult.original_input_hash:
        consult.original_input_hash = sha256_hex(consult.original_doctor_input)

    prefs = await build_personalization_context(
        db,
        patient_id=consult.patient_id,
        override_language=req.target_language,
        override_depth=req.explanation_depth,
    )

    res = await explanation_service.explain_clinical_input(
        session=db,
        source_text=consult.original_doctor_input,
        input_type="clinical_notes",
        structured_data=consult.structured_data or {},
        prefs=prefs,
        include_visuals=req.include_visuals,
    )
    safety = res["safety"]
    integrity_status, integrity_report = _evaluate_provenance_integrity(
        consult,
        res["provenance"],
        res["language"],
        guardrail_check=safety.get("guardrail_check"),
    )

    consult.generated_explanation = res["provenance"]
    consult.explanation_language = res["language"]
    consult.explanation_depth = res["depth"]
    consult.integrity_status = integrity_status
    consult.integrity_report = integrity_report
    if integrity_status == "blocked":
        consult.approval_status = "safety_flagged"
    elif consult.approval_status in ("draft", "safety_flagged", "needs_doctor_edit"):
        consult.approval_status = "pending_review"

    await db.commit()
    await db.refresh(consult)
    return ok_envelope(
        await serialize_consultation_detail(
            db,
            consult,
            doctor_name=doctor.full_name,
            language=res["language"],
            visual_diagrams=res["visual_diagrams"],
        )
    )


@router.patch("/consultation/{consultation_id}")
async def update_doctor_consultation(
    consultation_id: str,
    payload: DoctorConsultationUpdateRequest,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update consultation title/structured fields/edited explanation; block original_doctor_input edits."""
    consult = await check_consultation_access(
        db,
        current_user,
        consultation_id,
        require_shared_for_patient=False,
        require_doctor_ownership=True,
    )
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None

    if payload.original_doctor_input is not None and (
        consult.original_input_locked_at is not None
        or payload.original_doctor_input.strip() != consult.original_doctor_input
    ):
        raise AppError(
            409,
            "CONSULTATION_INPUT_LOCKED",
            "Original doctor clinical input is locked and cannot be overwritten.",
        )

    if payload.title is not None:
        consult.title = payload.title.strip()
    if payload.structured_data is not None:
        consult.structured_data = payload.structured_data

    if payload.edited_explanation is not None:
        base_prov: dict[str, Any] = dict(
            consult.generated_explanation
            or {
                "doctor_provided": [],
                "ai_simplified": {"summary": "", "steps": []},
                "general_education": [],
                "uncertain_or_missing": [],
            }
        )
        for key in ("doctor_provided", "ai_simplified", "general_education", "uncertain_or_missing"):
            if key in payload.edited_explanation and payload.edited_explanation[key] is not None:
                if key == "ai_simplified" and isinstance(payload.edited_explanation[key], dict):
                    merged_ai = dict(
                        base_prov.get("ai_simplified")
                        if isinstance(base_prov.get("ai_simplified"), dict)
                        else {}
                    )
                    merged_ai.update(payload.edited_explanation[key])
                    base_prov["ai_simplified"] = merged_ai
                else:
                    base_prov[key] = payload.edited_explanation[key]

        merged_prov = _normalize_provenance_shape(
            base_prov, consult.explanation_language, consult.explanation_depth
        )
        status, integrity_report = _evaluate_provenance_integrity(
            consult, merged_prov, consult.explanation_language
        )

        consult.generated_explanation = merged_prov
        consult.integrity_status = status
        consult.integrity_report = integrity_report
        if status == "blocked":
            consult.approval_status = "safety_flagged"
        else:
            consult.approval_status = "pending_review"

    await db.commit()
    await db.refresh(consult)
    return ok_envelope(
        await serialize_consultation_detail(db, consult, doctor_name=doctor.full_name)
    )


@router.post("/consultation/{consultation_id}/approve")
async def approve_doctor_consultation(
    consultation_id: str,
    payload: DoctorConsultationApproveRequest | None = None,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Clinician sign-off gate: hard-blocks with 409 SAFETY_INTEGRITY_BLOCKED if blocked."""
    consult = await check_consultation_access(
        db,
        current_user,
        consultation_id,
        require_shared_for_patient=False,
        require_doctor_ownership=True,
    )
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    req = payload or DoctorConsultationApproveRequest()

    if not consult.generated_explanation:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Generate a patient explanation before approving the consultation.",
        )

    recheck_status, recheck = _evaluate_provenance_integrity(
        consult, consult.generated_explanation, consult.explanation_language
    )
    if recheck["status"] == "blocked" or consult.integrity_status == "blocked":
        consult.integrity_status = "blocked"
        consult.integrity_report = recheck
        consult.approval_status = "safety_flagged"
        await db.commit()
        raise AppError(
            409,
            "SAFETY_INTEGRITY_BLOCKED",
            "Cannot approve consultation explanation while deterministic safety integrity checks are blocked.",
            details=recheck.get("mismatches", []),
        )

    if not req.approve:
        consult.approval_status = "needs_doctor_edit"
    else:
        consult.approval_status = "approved"
        consult.approved_by_doctor_id = doctor.id
        consult.approved_at = utcnow()
        consult.integrity_status = recheck_status
        consult.integrity_report = recheck

    await db.commit()
    await db.refresh(consult)
    return ok_envelope(
        await serialize_consultation_detail(db, consult, doctor_name=doctor.full_name)
    )


@router.post("/consultation/{consultation_id}/share")
async def share_doctor_consultation(
    consultation_id: str,
    payload: DoctorConsultationShareRequest | None = None,
    current_user: User = Depends(require_role("doctor")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Share an approved consultation with the patient or revoke sharing."""
    consult = await check_consultation_access(
        db,
        current_user,
        consultation_id,
        require_shared_for_patient=False,
        require_doctor_ownership=True,
    )
    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    req = payload or DoctorConsultationShareRequest()

    if req.sharing_target == "shared_with_patient":
        if consult.approval_status != "approved":
            raise AppError(
                409,
                "APPROVAL_REQUIRED",
                "Consultation explanation must be approved by the doctor before sharing with the patient.",
            )
        if consult.integrity_status == "blocked":
            raise AppError(
                409,
                "SAFETY_INTEGRITY_BLOCKED",
                "Cannot share a safety-blocked consultation explanation.",
            )
        consult.sharing_status = "shared_with_patient"
        consult.shared_at = utcnow()
    else:
        consult.sharing_status = "revoked"

    await db.commit()
    await db.refresh(consult)
    return ok_envelope(
        await serialize_consultation_detail(db, consult, doctor_name=doctor.full_name)
    )
