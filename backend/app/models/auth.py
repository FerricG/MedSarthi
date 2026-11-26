"""Auth, profile, preference, and doctor-patient consent models (Tables 1-6)."""

from datetime import UTC, datetime
import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(UTC)


def compute_age_accessibility_defaults(age_years: int | None) -> dict[str, object]:
    """Return initial age-based font and audio speed defaults (never drives literacy assumptions)."""
    if age_years is None:
        return {"font_size": "large", "font_scale_pct": 115, "audio_speed": 1.0}
    if age_years < 18:
        return {"font_size": "large", "font_scale_pct": 115, "audio_speed": 1.0}
    if age_years < 40:
        return {"font_size": "medium", "font_scale_pct": 100, "audio_speed": 1.0}
    if age_years < 60:
        return {"font_size": "large", "font_scale_pct": 115, "audio_speed": 0.85}
    return {"font_size": "xl", "font_scale_pct": 135, "audio_speed": 0.75}


class User(Base):
    """1. users — Patient or Doctor account identity."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('patient', 'doctor')", name="ck_users_role"),
        CheckConstraint("email IS NOT NULL OR phone IS NOT NULL", name="ck_users_identifier"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    patient_profile: Mapped["PatientProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    doctor_profile: Mapped["DoctorProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class AuthSession(Base):
    """2. auth_sessions — Rotating HttpOnly refresh token session tracking."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("idx_auth_sessions_user", "user_id", "revoked_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    token_family_id: Mapped[str] = mapped_column(String(36), nullable=False, default=_uuid)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="sessions")


class PatientProfile(Base):
    """3. patient_profiles — Patient demographics and 7-step onboarding state."""

    __tablename__ = "patient_profiles"
    __table_args__ = (
        CheckConstraint("age_years IS NULL OR (age_years >= 0 AND age_years <= 125)", name="ck_pp_age"),
        CheckConstraint(
            "gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')",
            name="ck_pp_gender",
        ),
        CheckConstraint("onboarding_step >= 1 AND onboarding_step <= 7", name="ck_pp_step"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(24), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    onboarding_step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="patient_profile")
    preferences: Mapped["PatientPreference | None"] = relationship(
        back_populates="patient", uselist=False, cascade="all, delete-orphan"
    )


class PatientPreference(Base):
    """4. patient_preferences — Persistent personalization & WCAG AAA accessibility settings."""

    __tablename__ = "patient_preferences"
    __table_args__ = (
        CheckConstraint(
            "preferred_language IN ('en', 'hi', 'hi-Latn')",
            name="ck_pref_lang",
        ),
        CheckConstraint(
            "reading_comfort_level IN ('very_simple', 'simple', 'comfortable', 'adaptive')",
            name="ck_pref_reading_comfort",
        ),
        CheckConstraint(
            "explanation_depth IN ('very_simple', 'simple', 'detailed', 'deep_dive')",
            name="ck_pref_depth",
        ),
        CheckConstraint(
            "preferred_response_format IN ('text', 'audio', 'text_audio', 'visual')",
            name="ck_pref_format",
        ),
        CheckConstraint("font_size IN ('medium', 'large', 'xl')", name="ck_pref_font_size"),
        CheckConstraint("font_scale_pct >= 90 AND font_scale_pct <= 175", name="ck_pref_font_scale"),
        CheckConstraint(
            "audio_speed IN (0.75, 0.85, 1.0, 1.15, 1.25)",
            name="ck_pref_audio_speed",
        ),
        CheckConstraint(
            "terminology_preference IN ('plain_only', 'plain_plus_medical', 'medical_with_definitions')",
            name="ck_pref_term",
        ),
        CheckConstraint(
            "units_preference IN ('metric', 'us_standard', 'both')",
            name="ck_pref_units",
        ),
        CheckConstraint(
            "explanation_style IN ('conversational', 'straightforward', 'calm_reassuring', 'structured', 'step_by_step')",
            name="ck_pref_style",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    preferred_language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    reading_comfort_level: Mapped[str] = mapped_column(String(24), nullable=False, default="simple")
    explanation_depth: Mapped[str] = mapped_column(String(24), nullable=False, default="simple")
    preferred_response_format: Mapped[str] = mapped_column(
        String(24), nullable=False, default="text_audio"
    )
    font_size: Mapped[str] = mapped_column(String(16), nullable=False, default="large")
    font_scale_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=115)
    audio_speed: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    high_contrast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    voice_preference: Mapped[str] = mapped_column(String(32), nullable=False, default="warm_female")
    terminology_preference: Mapped[str] = mapped_column(
        String(32), nullable=False, default="plain_plus_medical"
    )
    units_preference: Mapped[str] = mapped_column(String(20), nullable=False, default="metric")
    explanation_style: Mapped[str] = mapped_column(
        String(32), nullable=False, default="calm_reassuring"
    )
    auto_play_audio: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    accessibility_manual_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    patient: Mapped["PatientProfile"] = relationship(back_populates="preferences")


class DoctorProfile(Base):
    """5. doctor_profiles — Clinician identity and clinic metadata."""

    __tablename__ = "doctor_profiles"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('pending', 'verified', 'suspended')",
            name="ck_doc_verification",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(120), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    clinic_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    languages_spoken: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=lambda: ["en"])
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="verified")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="doctor_profile")


class DoctorPatientLink(Base):
    """6. doctor_patient_links — Explicit consent link preventing blanket patient exposure."""

    __tablename__ = "doctor_patient_links"
    __table_args__ = (
        UniqueConstraint("doctor_id", "patient_id", name="uq_doctor_patient_pair"),
        CheckConstraint(
            "consent_status IN ('pending', 'active', 'revoked', 'expired')",
            name="ck_dpl_status",
        ),
        CheckConstraint(
            "consent_scope IN ('consultation_only', 'linked_care')",
            name="ck_dpl_scope",
        ),
        CheckConstraint("initiated_by IN ('doctor', 'patient')", name="ck_dpl_initiator"),
        Index("idx_dpl_patient_status", "patient_id", "consent_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    doctor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    consent_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    consent_scope: Mapped[str] = mapped_column(String(32), nullable=False, default="linked_care")
    initiated_by: Mapped[str] = mapped_column(String(16), nullable=False, default="doctor")
    consent_granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
