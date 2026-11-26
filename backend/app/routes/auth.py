"""Authentication routes: register, login, rotating refresh, logout, and /me."""

from datetime import UTC, datetime, timedelta
from typing import Literal
import uuid
from fastapi import APIRouter, Body, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.deps import get_current_user, get_db, verify_csrf
from app.core.exceptions import AppError
from app.core.security import (
    clear_auth_cookies,
    create_access_token,
    generate_opaque_token,
    hash_password,
    set_auth_cookies,
    sha256_hex,
    verify_password,
)
from app.models.auth import (
    AuthSession,
    DoctorProfile,
    PatientPreference,
    PatientProfile,
    User,
    compute_age_accessibility_defaults,
)
from app.schemas.auth import (
    DoctorProfileOut,
    LoginRequest,
    PatientPreferenceOut,
    PatientProfileOut,
    RegisterRequest,
    UserOut,
)
from app.schemas.common import ok_envelope

router = APIRouter(prefix="/auth", tags=["auth"])


class GuestSessionRequest(BaseModel):
    """Optional configuration for starting an account-free guest session."""

    role: Literal["patient", "doctor"] = "patient"
    name: str | None = Field(default=None, max_length=120)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _serialize_user(user: User) -> dict:
    return UserOut(
        id=user.id,
        role=user.role,  # type: ignore[arg-type]
        email=user.email,
        phone=user.phone,
        is_active=user.is_active,
    ).model_dump()


def _serialize_patient(profile: PatientProfile | None) -> dict | None:
    if not profile:
        return None
    return PatientProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        name=profile.name,
        age_years=profile.age_years,
        gender=profile.gender,
        onboarding_completed=profile.onboarding_completed,
        onboarding_step=profile.onboarding_step,
    ).model_dump()


def _serialize_preferences(prefs: PatientPreference | None) -> dict | None:
    if not prefs:
        return None
    return PatientPreferenceOut(
        id=prefs.id,
        patient_id=prefs.patient_id,
        preferred_language=prefs.preferred_language,
        reading_comfort_level=prefs.reading_comfort_level,
        explanation_depth=prefs.explanation_depth,
        preferred_response_format=prefs.preferred_response_format,
        font_size=prefs.font_size,
        font_scale_pct=prefs.font_scale_pct,
        audio_speed=prefs.audio_speed,
        high_contrast=prefs.high_contrast,
        voice_preference=prefs.voice_preference,
        terminology_preference=prefs.terminology_preference,
        units_preference=prefs.units_preference,
        explanation_style=prefs.explanation_style,
        auto_play_audio=prefs.auto_play_audio,
        accessibility_manual_override=prefs.accessibility_manual_override,
    ).model_dump()


def _serialize_doctor(doc: DoctorProfile | None) -> dict | None:
    if not doc:
        return None
    return DoctorProfileOut(
        id=doc.id,
        user_id=doc.user_id,
        full_name=doc.full_name,
        specialty=doc.specialty,
        registration_number=doc.registration_number,
        clinic_name=doc.clinic_name,
        languages_spoken=doc.languages_spoken or ["en"],
        verification_status=doc.verification_status,
    ).model_dump()


async def _load_role_context(db: AsyncSession, user: User) -> dict:
    if user.role == "patient":
        profile = (
            await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
        ).scalar_one_or_none()
        prefs = None
        if profile:
            prefs = (
                await db.execute(
                    select(PatientPreference).where(PatientPreference.patient_id == profile.id)
                )
            ).scalar_one_or_none()
        return {
            "patient_profile": _serialize_patient(profile),
            "preferences": _serialize_preferences(prefs),
            "doctor_profile": None,
            "onboarding_completed": profile.onboarding_completed if profile else False,
        }

    doc = (
        await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == user.id))
    ).scalar_one_or_none()
    return {
        "patient_profile": None,
        "preferences": None,
        "doctor_profile": _serialize_doctor(doc),
        "onboarding_completed": True,
    }


async def _issue_session_tokens(
    db: AsyncSession,
    user: User,
    request: Request,
    response: Response,
    token_family_id: str | None = None,
) -> tuple[str, str]:
    settings = get_settings()
    raw_refresh = generate_opaque_token(32)
    csrf_token = generate_opaque_token(24)
    expires_at = _utcnow() + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)

    session_kwargs: dict = {
        "user_id": user.id,
        "refresh_token_hash": sha256_hex(raw_refresh),
        "user_agent": (request.headers.get("user-agent") or "")[:255] or None,
        "expires_at": expires_at,
    }
    if token_family_id:
        session_kwargs["token_family_id"] = token_family_id

    auth_session = AuthSession(**session_kwargs)
    db.add(auth_session)
    await db.flush()

    access_token = create_access_token(user_id=user.id, role=user.role, session_id=auth_session.id)
    set_auth_cookies(response, refresh_token=raw_refresh, csrf_token=csrf_token)
    return access_token, csrf_token


@router.post("/register", status_code=201)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register a patient or doctor account with Argon2id password and initial profile."""
    filters = []
    if payload.email:
        filters.append(User.email == payload.email)
    if payload.phone:
        filters.append(User.phone == payload.phone)

    existing = (await db.execute(select(User).where(or_(*filters)))).scalar_one_or_none()
    if existing:
        raise AppError(409, "VALIDATION_ERROR", "An account with this email or phone already exists.")

    user = User(
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    if payload.role == "patient":
        profile = PatientProfile(
            user_id=user.id,
            name=payload.name,
            age_years=payload.age_years,
            gender=payload.gender,
            onboarding_completed=False,
            onboarding_step=1,
        )
        db.add(profile)
        await db.flush()

        defaults = compute_age_accessibility_defaults(payload.age_years)
        prefs = PatientPreference(
            patient_id=profile.id,
            font_size=str(defaults["font_size"]),
            font_scale_pct=int(defaults["font_scale_pct"]),
            audio_speed=float(defaults["audio_speed"]),
        )
        db.add(prefs)
    else:
        details = payload.doctor_details
        doc = DoctorProfile(
            user_id=user.id,
            full_name=payload.name,
            specialty=details.specialty if details else None,
            registration_number=details.registration_number if details else None,
            clinic_name=details.clinic_name if details else None,
            languages_spoken=["en", "hi"],
            verification_status="verified",
        )
        db.add(doc)

    access_token, csrf_token = await _issue_session_tokens(db, user, request, response)
    await db.commit()

    context = await _load_role_context(db, user)
    return ok_envelope(
        {
            "user": _serialize_user(user),
            "access_token": access_token,
            "csrf_token": csrf_token,
            "onboarding_required": payload.role == "patient",
            **context,
        }
    )


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Authenticate by email or phone and return short-lived JWT + HttpOnly refresh cookie."""
    identifier = payload.identifier.strip()
    ident_lower = identifier.lower()

    user = (
        await db.execute(
            select(User).where(
                or_(User.email == ident_lower, User.phone == identifier),
                User.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise AppError(401, "AUTH_INVALID_CREDENTIALS", "Invalid email/phone or password.")

    access_token, csrf_token = await _issue_session_tokens(db, user, request, response)
    await db.commit()

    context = await _load_role_context(db, user)
    return ok_envelope(
        {
            "user": _serialize_user(user),
            "access_token": access_token,
            "csrf_token": csrf_token,
            **context,
        }
    )


@router.post("/refresh")
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_csrf),
) -> dict:
    """Rotate HttpOnly refresh cookie and detect token replay across a session family."""
    settings = get_settings()
    raw_refresh = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw_refresh:
        raise AppError(401, "AUTH_TOKEN_EXPIRED", "Refresh cookie missing.")

    token_hash = sha256_hex(raw_refresh)
    session_row = (
        await db.execute(select(AuthSession).where(AuthSession.refresh_token_hash == token_hash))
    ).scalar_one_or_none()

    if not session_row:
        clear_auth_cookies(response)
        raise AppError(401, "AUTH_TOKEN_EXPIRED", "Invalid refresh session.")

    if session_row.revoked_at is not None:
        # Replay detected: revoke entire session family
        await db.execute(
            update(AuthSession)
            .where(
                AuthSession.token_family_id == session_row.token_family_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=_utcnow())
        )
        await db.commit()
        clear_auth_cookies(response)
        raise AppError(401, "AUTH_SESSION_REVOKED", "Refresh session revoked due to reuse.")

    if _as_utc(session_row.expires_at) <= _utcnow():
        session_row.revoked_at = _utcnow()
        await db.commit()
        clear_auth_cookies(response)
        raise AppError(401, "AUTH_TOKEN_EXPIRED", "Refresh session has expired.")

    user = await db.get(User, session_row.user_id)
    if not user or not user.is_active or user.deleted_at is not None:
        raise AppError(401, "AUTH_INVALID_CREDENTIALS", "User account unavailable.")

    session_row.revoked_at = _utcnow()
    access_token, csrf_token = await _issue_session_tokens(
        db, user, request, response, token_family_id=session_row.token_family_id
    )
    await db.commit()

    return ok_envelope({"access_token": access_token, "csrf_token": csrf_token})


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_csrf),
) -> dict:
    """Revoke active session(s) for current cookie/token and clear auth cookies."""
    settings = get_settings()
    raw_refresh = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if raw_refresh:
        token_hash = sha256_hex(raw_refresh)
        await db.execute(
            update(AuthSession)
            .where(
                AuthSession.user_id == current_user.id,
                AuthSession.refresh_token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=_utcnow())
        )
    else:
        # Fallback if bearer-only client logs out: revoke active sessions for user
        await db.execute(
            update(AuthSession)
            .where(AuthSession.user_id == current_user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=_utcnow())
        )
    await db.commit()
    clear_auth_cookies(response)
    return ok_envelope({"logged_out": True})


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return authenticated user details and role profile/preferences."""
    context = await _load_role_context(db, current_user)
    return ok_envelope({"user": _serialize_user(current_user), **context})


@router.post("/guest", status_code=201)
async def create_guest_session(
    request: Request,
    response: Response,
    payload: GuestSessionRequest = Body(default_factory=GuestSessionRequest),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Start an isolated account-free guest session without email, phone, or password."""
    guest_suffix = uuid.uuid4().hex[:12]
    guest_email = f"guest_{guest_suffix}@guest.medsarthi.local"
    display_name = (payload.name or "").strip() or (
        "Guest Patient" if payload.role == "patient" else "Guest Doctor"
    )

    user = User(
        email=guest_email,
        phone=None,
        password_hash=hash_password(generate_opaque_token(24)),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    if payload.role == "patient":
        profile = PatientProfile(
            user_id=user.id,
            name=display_name,
            age_years=None,
            gender=None,
            onboarding_completed=False,
            onboarding_step=1,
        )
        db.add(profile)
        await db.flush()

        defaults = compute_age_accessibility_defaults(None)
        prefs = PatientPreference(
            patient_id=profile.id,
            font_size=str(defaults["font_size"]),
            font_scale_pct=int(defaults["font_scale_pct"]),
            audio_speed=float(defaults["audio_speed"]),
        )
        db.add(prefs)
    else:
        doc = DoctorProfile(
            user_id=user.id,
            full_name=display_name,
            specialty="General Medicine (Guest)",
            languages_spoken=["en", "hi"],
            verification_status="verified",
        )
        db.add(doc)

    access_token, csrf_token = await _issue_session_tokens(db, user, request, response)
    await db.commit()

    context = await _load_role_context(db, user)
    return ok_envelope(
        {
            "user": _serialize_user(user),
            "access_token": access_token,
            "csrf_token": csrf_token,
            "guest_mode": True,
            "onboarding_required": not context.get("onboarding_completed", False),
            **context,
        }
    )
