"""Pydantic request/response schemas for patient profiles, preferences, and consent links."""

from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator

SupportedLang = Literal["en", "hi", "hi-Latn"]
ComfortLevel = Literal["very_simple", "simple", "comfortable", "adaptive"]
DepthLevel = Literal["very_simple", "simple", "detailed", "deep_dive"]
ResponseFormat = Literal["text", "audio", "text_audio", "visual"]
FontSizeTier = Literal["medium", "large", "xl"]
TerminologyPref = Literal["plain_only", "plain_plus_medical", "medical_with_definitions"]
UnitsPref = Literal["metric", "us_standard", "both"]
StylePref = Literal[
    "conversational",
    "straightforward",
    "calm_reassuring",
    "structured",
    "step_by_step",
]
GenderValue = Literal["male", "female", "other", "prefer_not_to_say"]

ALLOWED_AUDIO_SPEEDS = (0.75, 0.85, 1.0, 1.15, 1.25)


def _validate_audio_speed(val: float | None) -> float | None:
    if val is None:
        return None
    fval = float(val)
    if fval not in ALLOWED_AUDIO_SPEEDS:
        raise ValueError(f"audio_speed must be one of {ALLOWED_AUDIO_SPEEDS}.")
    return fval


class PatientPreferencePatch(BaseModel):
    """Partial preference update (also accepted inside onboarding POST)."""

    preferred_language: SupportedLang | None = None
    reading_comfort_level: ComfortLevel | None = None
    explanation_depth: DepthLevel | None = None
    preferred_response_format: ResponseFormat | None = None
    font_size: FontSizeTier | None = None
    font_scale_pct: int | None = Field(default=None, ge=90, le=175)
    audio_speed: float | None = None
    high_contrast: bool | None = None
    voice_preference: str | None = Field(default=None, max_length=32)
    terminology_preference: TerminologyPref | None = None
    units_preference: UnitsPref | None = None
    explanation_style: StylePref | None = None
    auto_play_audio: bool | None = None
    accessibility_manual_override: bool | None = None
    reset_accessibility_to_recommended: bool = False

    @field_validator("audio_speed")
    @classmethod
    def check_speed(cls, v: float | None) -> float | None:
        return _validate_audio_speed(v)


class PatientOnboardingRequest(BaseModel):
    """Create or complete patient profile + preferences onboarding."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    age_years: int | None = Field(default=None, ge=0, le=125)
    gender: GenderValue | None = None
    onboarding_step: int | None = Field(default=None, ge=1, le=7)
    onboarding_completed: bool | None = None
    preferences: PatientPreferencePatch | None = None


class PatientProfileUpdateRequest(BaseModel):
    """Update patient demographics or onboarding progress."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    age_years: int | None = Field(default=None, ge=0, le=125)
    gender: GenderValue | None = None
    onboarding_step: int | None = Field(default=None, ge=1, le=7)
    onboarding_completed: bool | None = None


class DoctorLinkCreateRequest(BaseModel):
    """Create a doctor-patient consent link request."""

    patient_identifier: str | None = Field(default=None, max_length=255)
    doctor_id: str | None = Field(default=None, max_length=36)
    consent_scope: Literal["consultation_only", "linked_care"] = "linked_care"


class DoctorLinkAcceptRequest(BaseModel):
    """Explicit patient consent confirmation payload."""

    confirm_consent: bool = True


class DoctorLinkRevokeRequest(BaseModel):
    """Optional consent revocation metadata."""

    reason: str | None = Field(default=None, max_length=300)


class DoctorPatientLinkOut(BaseModel):
    """Serialized doctor-patient consent link matching frontend DoctorPatientLinkItem."""

    id: str
    link_id: str
    patient_id: str
    doctor_id: str | None = None
    name: str
    display_name: str
    age_years: int | None = None
    preferred_language: str = "en"
    reading_comfort_level: str = "simple"
    consent_status: str
    consent_scope: str
    initiated_by: str | None = None
    consent_granted_at: str | None = None


class MedicationListItemOut(BaseModel):
    """Derived medication card matching frontend MedicationListItem."""

    id: str
    consultation_id: str | None = None
    consultation_title: str | None = None
    visit_date: str | None = None
    doctor_name: str | None = None
    medicine_name: str
    dose: str
    frequency: str
    duration: str | None = None
    route: str | None = None
    warnings: list[str] = Field(default_factory=list)
    locked_instruction: str
    kb_slug: str | None = None
