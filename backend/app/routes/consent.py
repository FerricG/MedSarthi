"""Doctor-patient consent link lifecycle routes."""

from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user, get_db, require_role
from app.core.exceptions import AppError
from app.models.auth import DoctorPatientLink, DoctorProfile, PatientPreference, PatientProfile, User
from app.routes._helpers import (
    get_doctor_profile_for_user,
    get_patient_profile_for_user,
    iso_or_none,
    utcnow,
)
from app.schemas.common import ok_envelope
from app.schemas.patients import (
    DoctorLinkAcceptRequest,
    DoctorLinkCreateRequest,
    DoctorLinkRevokeRequest,
)

router = APIRouter(prefix="/consent", tags=["consent"])


def _serialize_link(
    link: DoctorPatientLink,
    patient: PatientProfile,
    prefs: PatientPreference | None,
    doctor: DoctorProfile | None,
    viewer_role: str,
) -> dict[str, Any]:
    display_name = (
        doctor.full_name if (viewer_role == "patient" and doctor) else patient.name
    )
    return {
        "id": link.id,
        "link_id": link.id,
        "patient_id": link.patient_id,
        "doctor_id": link.doctor_id,
        "name": display_name,
        "display_name": display_name,
        "age_years": patient.age_years,
        "preferred_language": prefs.preferred_language if prefs else "en",
        "reading_comfort_level": prefs.reading_comfort_level if prefs else "simple",
        "consent_status": link.consent_status,
        "consent_scope": link.consent_scope,
        "initiated_by": link.initiated_by,
        "consent_granted_at": iso_or_none(link.consent_granted_at),
    }


async def _load_serialized_link(
    db: AsyncSession,
    link: DoctorPatientLink,
    viewer_role: str,
) -> dict[str, Any]:
    patient = await db.get(PatientProfile, link.patient_id)
    doctor = await db.get(DoctorProfile, link.doctor_id)
    prefs = (
        await db.execute(
            select(PatientPreference).where(PatientPreference.patient_id == link.patient_id)
        )
    ).scalar_one_or_none()
    assert patient is not None
    return _serialize_link(link, patient, prefs, doctor, viewer_role)


@router.get("/doctor-links")
async def list_doctor_links(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List doctor-patient consent links scoped strictly to the authenticated patient or doctor."""
    if current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user)
        assert profile is not None
        stmt = (
            select(DoctorPatientLink, DoctorProfile, PatientPreference)
            .join(DoctorProfile, DoctorProfile.id == DoctorPatientLink.doctor_id)
            .outerjoin(PatientPreference, PatientPreference.patient_id == DoctorPatientLink.patient_id)
            .where(DoctorPatientLink.patient_id == profile.id)
            .order_by(DoctorPatientLink.created_at.desc())
        )
        rows = (await db.execute(stmt)).all()
        items = [
            _serialize_link(link, profile, prefs, doc, "patient")
            for link, doc, prefs in rows
        ]
        return ok_envelope(items)

    doctor = await get_doctor_profile_for_user(db, current_user)
    assert doctor is not None
    stmt = (
        select(DoctorPatientLink, PatientProfile, PatientPreference)
        .join(PatientProfile, PatientProfile.id == DoctorPatientLink.patient_id)
        .outerjoin(PatientPreference, PatientPreference.patient_id == PatientProfile.id)
        .where(
            DoctorPatientLink.doctor_id == doctor.id,
            PatientProfile.deleted_at.is_(None),
        )
        .order_by(DoctorPatientLink.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    items = [
        _serialize_link(link, pat, prefs, doctor, "doctor")
        for link, pat, prefs in rows
    ]
    return ok_envelope(items)


@router.post("/doctor-links", status_code=201)
async def create_doctor_link(
    payload: DoctorLinkCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Initiate a doctor-patient consent link (doctor requests -> pending; patient grants -> active)."""
    now = utcnow()
    if current_user.role == "doctor":
        doctor = await get_doctor_profile_for_user(db, current_user)
        assert doctor is not None
        ident = (payload.patient_identifier or "").strip()
        if not ident:
            raise AppError(422, "VALIDATION_ERROR", "patient_identifier is required.")

        patient = (
            await db.execute(
                select(PatientProfile)
                .join(User, User.id == PatientProfile.user_id)
                .where(
                    PatientProfile.deleted_at.is_(None),
                    User.deleted_at.is_(None),
                    or_(
                        User.email == ident.lower(),
                        User.phone == ident,
                        PatientProfile.id == ident,
                    ),
                )
            )
        ).scalar_one_or_none()
        if not patient:
            raise AppError(404, "NOT_FOUND", "No patient found matching that email, phone, or ID.")

        existing = (
            await db.execute(
                select(DoctorPatientLink).where(
                    DoctorPatientLink.doctor_id == doctor.id,
                    DoctorPatientLink.patient_id == patient.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            if existing.consent_status in ("revoked", "expired"):
                existing.consent_status = "pending"
                existing.consent_scope = payload.consent_scope
                existing.initiated_by = "doctor"
                existing.consent_granted_at = None
                existing.revoked_at = None
            link = existing
        else:
            link = DoctorPatientLink(
                doctor_id=doctor.id,
                patient_id=patient.id,
                consent_status="pending",
                consent_scope=payload.consent_scope,
                initiated_by="doctor",
            )
            db.add(link)
        await db.commit()
        await db.refresh(link)
        return ok_envelope(await _load_serialized_link(db, link, "doctor"))

    # Patient initiating link to a doctor
    patient = await get_patient_profile_for_user(db, current_user)
    assert patient is not None
    if not payload.doctor_id:
        raise AppError(422, "VALIDATION_ERROR", "doctor_id is required.")
    doctor = await db.get(DoctorProfile, payload.doctor_id)
    if not doctor or doctor.deleted_at is not None:
        raise AppError(404, "NOT_FOUND", "Doctor profile not found.")

    existing = (
        await db.execute(
            select(DoctorPatientLink).where(
                DoctorPatientLink.doctor_id == doctor.id,
                DoctorPatientLink.patient_id == patient.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.consent_status = "active"
        existing.consent_scope = payload.consent_scope
        existing.initiated_by = "patient"
        existing.consent_granted_at = now
        existing.revoked_at = None
        link = existing
    else:
        link = DoctorPatientLink(
            doctor_id=doctor.id,
            patient_id=patient.id,
            consent_status="active",
            consent_scope=payload.consent_scope,
            initiated_by="patient",
            consent_granted_at=now,
        )
        db.add(link)

    await db.commit()
    await db.refresh(link)
    return ok_envelope(await _load_serialized_link(db, link, "patient"))


@router.post("/doctor-links/{link_id}/accept")
async def accept_doctor_link(
    link_id: str,
    payload: DoctorLinkAcceptRequest,
    current_user: User = Depends(require_role("patient")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Patient-only endpoint to accept a pending doctor-patient consent link."""
    if not payload.confirm_consent:
        raise AppError(422, "VALIDATION_ERROR", "Explicit confirm_consent=true is required.")

    patient = await get_patient_profile_for_user(db, current_user)
    assert patient is not None

    link = await db.get(DoctorPatientLink, link_id)
    if not link:
        raise AppError(404, "NOT_FOUND", "Consent link not found.")
    if link.patient_id != patient.id:
        raise AppError(403, "RBAC_FORBIDDEN", "Only the owning patient can accept this consent link.")

    link.consent_status = "active"
    link.consent_granted_at = utcnow()
    link.revoked_at = None
    await db.commit()
    await db.refresh(link)
    return ok_envelope(await _load_serialized_link(db, link, "patient"))


@router.post("/doctor-links/{link_id}/revoke")
async def revoke_doctor_link(
    link_id: str,
    _payload: DoctorLinkRevokeRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Revoke an active or pending doctor-patient consent link."""
    link = await db.get(DoctorPatientLink, link_id)
    if not link:
        raise AppError(404, "NOT_FOUND", "Consent link not found.")

    if current_user.role == "patient":
        patient = await get_patient_profile_for_user(db, current_user)
        if not patient or link.patient_id != patient.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot revoke another patient's consent link.")
    else:
        doctor = await get_doctor_profile_for_user(db, current_user)
        if not doctor or link.doctor_id != doctor.id:
            raise AppError(403, "RBAC_FORBIDDEN", "Cannot revoke another doctor's consent link.")

    link.consent_status = "revoked"
    link.revoked_at = utcnow()
    await db.commit()
    await db.refresh(link)
    return ok_envelope(await _load_serialized_link(db, link, current_user.role))
