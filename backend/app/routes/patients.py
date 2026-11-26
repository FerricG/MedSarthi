"""Patient profile, preferences, shared consultations, and derived medications routes."""

from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user, get_db, require_doctor_patient_link, require_role
from app.core.exceptions import AppError
from app.models.auth import (
    DoctorProfile,
    PatientPreference,
    PatientProfile,
    User,
    compute_age_accessibility_defaults,
)
from app.models.clinical import Consultation, Conversation, MedicalDocument
from app.routes._helpers import (
    check_consultation_access,
    comfort_to_default_depth,
    ensure_patient_preferences,
    get_doctor_profile_for_user,
    get_patient_profile_for_user,
    serialize_consultation_detail,
    serialize_consultation_summary,
)
from app.routes.auth import _serialize_patient, _serialize_preferences
from app.schemas.common import ok_envelope
from app.schemas.patients import (
    GuidedReviewCreateRequest,
    GuidedReviewRatingRequest,
    PatientOnboardingRequest,
    PatientPreferencePatch,
    PatientProfileUpdateRequest,
)
from app.services.knowledge.retriever import knowledge_retriever
from app.services.notifications.notification_service import notification_framework

router = APIRouter(tags=["patients"])


def _apply_preference_patch(
    prefs: PatientPreference,
    patch: PatientPreferencePatch,
    age_years: int | None,
) -> None:
    if patch.reset_accessibility_to_recommended:
        defaults = compute_age_accessibility_defaults(age_years)
        prefs.font_size = str(defaults["font_size"])
        prefs.font_scale_pct = int(defaults["font_scale_pct"])
        prefs.audio_speed = float(defaults["audio_speed"])
        prefs.accessibility_manual_override = False

    data = patch.model_dump(
        exclude_unset=True,
        exclude={"reset_accessibility_to_recommended"},
    )
    touched_a11y = any(
        k in data for k in ("font_size", "font_scale_pct", "audio_speed")
    )
    for field_name, val in data.items():
        if val is not None:
            setattr(prefs, field_name, val)

    if touched_a11y and "accessibility_manual_override" not in data:
        prefs.accessibility_manual_override = True


@router.post("/patients", status_code=201)
async def create_or_complete_patient_onboarding(
    payload: PatientOnboardingRequest,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or finalize patient profile and accessibility preferences during onboarding."""
    profile = await get_patient_profile_for_user(db, current_user, required=False)
    if not profile:
        profile = PatientProfile(
            user_id=current_user.id,
            name=(payload.name or "Patient").strip(),
            age_years=payload.age_years,
            gender=payload.gender,
            onboarding_step=payload.onboarding_step or 1,
            onboarding_completed=bool(payload.onboarding_completed),
        )
        db.add(profile)
        await db.flush()
    else:
        if payload.name is not None:
            profile.name = payload.name.strip()
        if payload.age_years is not None:
            profile.age_years = payload.age_years
        if payload.gender is not None:
            profile.gender = payload.gender
        if payload.onboarding_step is not None:
            profile.onboarding_step = payload.onboarding_step
        if payload.onboarding_completed is not None:
            profile.onboarding_completed = payload.onboarding_completed

    prefs = await ensure_patient_preferences(db, profile)
    if payload.age_years is not None and not prefs.accessibility_manual_override:
        defaults = compute_age_accessibility_defaults(profile.age_years)
        prefs.font_size = str(defaults["font_size"])
        prefs.font_scale_pct = int(defaults["font_scale_pct"])
        prefs.audio_speed = float(defaults["audio_speed"])

    if payload.preferences:
        _apply_preference_patch(prefs, payload.preferences, profile.age_years)
        if (
            payload.preferences.reading_comfort_level is not None
            and payload.preferences.explanation_depth is None
        ):
            prefs.explanation_depth = comfort_to_default_depth(
                payload.preferences.reading_comfort_level
            )

    await db.commit()
    await db.refresh(profile)
    await db.refresh(prefs)
    return ok_envelope(
        {
            "profile": _serialize_patient(profile),
            "patient_profile": _serialize_patient(profile),
            "preferences": _serialize_preferences(prefs),
        }
    )


@router.get("/patients/me")
async def get_patient_me(
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return authenticated patient's profile and personalization preferences."""
    profile = await get_patient_profile_for_user(db, current_user)
    prefs = await ensure_patient_preferences(db, profile)  # type: ignore[arg-type]
    await db.commit()
    return ok_envelope(
        {
            "profile": _serialize_patient(profile),
            "patient_profile": _serialize_patient(profile),
            "preferences": _serialize_preferences(prefs),
        }
    )


@router.patch("/patients/me")
async def update_patient_me(
    payload: PatientProfileUpdateRequest,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update authenticated patient's profile fields and onboarding status."""
    profile = await get_patient_profile_for_user(db, current_user)
    assert profile is not None
    prefs = await ensure_patient_preferences(db, profile)

    updates = payload.model_dump(exclude_unset=True)
    age_changed = "age_years" in updates and updates["age_years"] != profile.age_years

    if "name" in updates and updates["name"] is not None:
        profile.name = updates["name"].strip()
    if "age_years" in updates:
        profile.age_years = updates["age_years"]
    if "gender" in updates:
        profile.gender = updates["gender"]
    if "onboarding_step" in updates and updates["onboarding_step"] is not None:
        profile.onboarding_step = updates["onboarding_step"]
    if "onboarding_completed" in updates and updates["onboarding_completed"] is not None:
        profile.onboarding_completed = updates["onboarding_completed"]

    if age_changed and not prefs.accessibility_manual_override:
        defaults = compute_age_accessibility_defaults(profile.age_years)
        prefs.font_size = str(defaults["font_size"])
        prefs.font_scale_pct = int(defaults["font_scale_pct"])
        prefs.audio_speed = float(defaults["audio_speed"])

    await db.commit()
    await db.refresh(profile)
    return ok_envelope(_serialize_patient(profile))


@router.get("/patients/me/preferences")
async def get_my_preferences(
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return current patient's accessibility and communication preferences."""
    profile = await get_patient_profile_for_user(db, current_user)
    prefs = await ensure_patient_preferences(db, profile)  # type: ignore[arg-type]
    await db.commit()
    return ok_envelope(_serialize_preferences(prefs))


@router.patch("/patients/me/preferences")
async def update_my_preferences(
    payload: PatientPreferencePatch,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Persist patient accessibility/language preferences or reset to age-recommended defaults."""
    profile = await get_patient_profile_for_user(db, current_user)
    assert profile is not None
    prefs = await ensure_patient_preferences(db, profile)
    _apply_preference_patch(prefs, payload, profile.age_years)
    await db.commit()
    await db.refresh(prefs)
    return ok_envelope(_serialize_preferences(prefs))


@router.get("/consultations")
async def list_patient_consultations(
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List consultations strictly belonging to this patient and shared_with_patient."""
    profile = await get_patient_profile_for_user(db, current_user)
    assert profile is not None

    stmt = (
        select(Consultation, DoctorProfile.full_name)
        .outerjoin(DoctorProfile, DoctorProfile.id == Consultation.doctor_id)
        .where(
            Consultation.patient_id == profile.id,
            Consultation.sharing_status == "shared_with_patient",
            Consultation.deleted_at.is_(None),
        )
        .order_by(Consultation.visit_date.desc(), Consultation.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    items = [
        serialize_consultation_summary(consult, doctor_name=doc_name)
        for consult, doc_name in rows
    ]
    return ok_envelope(items)


@router.get("/consultations/{consultation_id}")
async def get_patient_consultation(
    consultation_id: str,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a shared consultation for this patient with curated diagrams and highlighted terms."""
    consult = await check_consultation_access(
        db, current_user, consultation_id, require_shared_for_patient=True
    )
    profile = await get_patient_profile_for_user(db, current_user)
    assert profile is not None
    prefs = await ensure_patient_preferences(db, profile)
    detail = await serialize_consultation_detail(
        db,
        consult,
        language=prefs.preferred_language,
    )
    return ok_envelope(detail)


@router.get("/medications")
async def list_medications(
    patient_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Derive patient medications from shared consultations and verified prescription documents."""
    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        assert profile is not None
        if patient_id and patient_id != profile.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot view another patient's medications.")
        target_patient_id = profile.id
    else:
        doctor = await get_doctor_profile_for_user(db, current_user)
        assert doctor is not None
        if not patient_id:
            raise AppError(422, "VALIDATION_ERROR", "patient_id query parameter is required.")
        await require_doctor_patient_link(db, doctor.id, patient_id)
        target_patient_id = patient_id

    meds_out: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    # 1. Shared consultations
    consult_rows = (
        await db.execute(
            select(Consultation, DoctorProfile.full_name)
            .outerjoin(DoctorProfile, DoctorProfile.id == Consultation.doctor_id)
            .where(
                Consultation.patient_id == target_patient_id,
                Consultation.sharing_status == "shared_with_patient",
                Consultation.deleted_at.is_(None),
            )
            .order_by(Consultation.visit_date.desc(), Consultation.created_at.desc())
        )
    ).all()

    for consult, doc_name in consult_rows:
        sd = consult.structured_data or {}
        for idx, m in enumerate(sd.get("medications") or []):
            if not isinstance(m, dict):
                continue
            med_name = str(m.get("name") or m.get("medicine_name") or "").strip()
            if not med_name:
                continue
            dose = str(
                m.get("dose")
                or f"{m.get('dosage_value', '')} {m.get('dosage_unit', '')}".strip()
            ).strip()
            freq = str(m.get("frequency") or m.get("frequency_text") or "As directed").strip()
            dur = (m.get("duration") or m.get("duration_text") or None)
            route = m.get("route") or None
            warnings = list(m.get("warnings") or m.get("negations_and_warnings") or [])
            pieces = [p for p in [med_name, dose, freq, dur] if p]
            locked = " ".join(pieces)
            if warnings:
                locked = f"{locked} — {'; '.join(str(w) for w in warnings)}"

            kb_hit = await knowledge_retriever.lookup_medicine(db, med_name)
            dedup_key = (consult.id, med_name.lower(), dose.lower())
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            meds_out.append(
                {
                    "id": f"{consult.id}:med:{idx}",
                    "consultation_id": consult.id,
                    "consultation_title": consult.title,
                    "visit_date": consult.visit_date.isoformat() if consult.visit_date else None,
                    "doctor_name": doc_name,
                    "medicine_name": med_name,
                    "dose": dose,
                    "frequency": freq,
                    "duration": str(dur) if dur else None,
                    "route": str(route) if route else None,
                    "warnings": [str(w) for w in warnings],
                    "locked_instruction": locked,
                    "kb_slug": kb_hit["slug"] if kb_hit else None,
                }
            )

    # 2. Verified prescription documents
    doc_rows = (
        await db.execute(
            select(MedicalDocument).where(
                MedicalDocument.patient_id == target_patient_id,
                MedicalDocument.document_type == "prescription",
                MedicalDocument.verification_status.in_(
                    ["patient_confirmed", "doctor_verified"]
                ),
                MedicalDocument.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    for doc in doc_rows:
        fields = doc.ocr_structured_fields or {}
        for idx, m in enumerate(fields.get("medications") or []):
            if not isinstance(m, dict):
                continue
            med_name = str(m.get("name") or m.get("medicine_name") or "").strip()
            if not med_name:
                continue
            dose = str(m.get("dose") or "").strip()
            freq = str(m.get("frequency") or "As written on prescription").strip()
            raw_line = str(m.get("raw_line") or f"{med_name} {dose}".strip()).strip()
            kb_hit = await knowledge_retriever.lookup_medicine(db, med_name)

            meds_out.append(
                {
                    "id": f"doc:{doc.id}:med:{idx}",
                    "consultation_id": doc.consultation_id,
                    "consultation_title": f"Prescription: {doc.original_filename}",
                    "visit_date": doc.verified_at.date().isoformat() if doc.verified_at else None,
                    "doctor_name": None,
                    "medicine_name": med_name,
                    "dose": dose,
                    "frequency": freq,
                    "duration": None,
                    "route": None,
                    "warnings": [],
                    "locked_instruction": raw_line,
                    "kb_slug": kb_hit["slug"] if kb_hit else None,
                }
            )

    return ok_envelope(meds_out)


@router.post("/patients/me/guided-review", status_code=201)
async def submit_guided_review(
    payload: GuidedReviewCreateRequest,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record a guided prescription + Q&A session for 24-hour doctor verification and queue notification stub."""
    import uuid
    from datetime import UTC, datetime

    profile = await get_patient_profile_for_user(db, current_user)
    doc = (
        await db.execute(
            select(MedicalDocument).where(
                MedicalDocument.id == payload.document_id,
                MedicalDocument.patient_id == profile.id,
                MedicalDocument.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise AppError(404, "NOT_FOUND", "Prescription document not found.")

    convo = None
    if payload.conversation_id:
        convo = (
            await db.execute(
                select(Conversation).where(
                    Conversation.id == payload.conversation_id,
                    Conversation.patient_id == profile.id,
                )
            )
        ).scalar_one_or_none()

    review_id = f"grev_{uuid.uuid4().hex[:12]}"
    notification = notification_framework.queue_doctor_verification_alert(
        user_email=current_user.email,
        user_phone=current_user.phone,
        review_id=review_id,
        preferred_language=payload.preferred_language,
    )

    fields = dict(doc.ocr_structured_fields or {})
    fields["guided_review"] = {
        "review_id": review_id,
        "document_id": doc.id,
        "conversation_id": convo.id if convo else None,
        "patient_confirmed_demographics": payload.patient_confirmed_demographics,
        "eta_hours": 24,
        "doctor_verification_status": "pending_24h_review",
        "notification": notification.to_dict(),
        "submitted_at": datetime.now(UTC).isoformat(),
    }
    doc.ocr_structured_fields = fields
    await db.commit()

    return ok_envelope(
        {
            "review_id": review_id,
            "document_id": doc.id,
            "conversation_id": convo.id if convo else None,
            "doctor_verification_status": "pending_24h_review",
            "eta_hours": 24,
            "notification": notification.to_dict(),
        }
    )


@router.post("/patients/me/guided-review/rating", status_code=201)
async def submit_guided_review_rating(
    payload: GuidedReviewRatingRequest,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save the patient's 1-5 star rating and feedback for the guided narrator experience."""
    profile = await get_patient_profile_for_user(db, current_user)
    if payload.document_id:
        doc = (
            await db.execute(
                select(MedicalDocument).where(
                    MedicalDocument.id == payload.document_id,
                    MedicalDocument.patient_id == profile.id,
                    MedicalDocument.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if doc:
            fields = dict(doc.ocr_structured_fields or {})
            fields["guided_rating"] = {
                "rating": payload.rating,
                "feedback_text": (payload.feedback_text or "").strip() or None,
                "review_id": payload.review_id,
            }
            doc.ocr_structured_fields = fields
            await db.commit()

    return ok_envelope(
        {
            "saved": True,
            "rating": payload.rating,
            "thank_you": "Thank you for your feedback! Wishing you a speedy recovery.",
        }
    )
