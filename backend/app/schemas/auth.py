"""Pydantic schemas for authentication, user profiles, and patient preferences."""

from typing import Literal
from pydantic import BaseModel, Field, model_validator


class DoctorDetailsInput(BaseModel):
    specialty: str | None = Field(default=None, max_length=120)
    registration_number: str | None = Field(default=None, max_length=80)
    clinic_name: str | None = Field(default=None, max_length=160)


class RegisterRequest(BaseModel):
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["patient", "doctor"] = "patient"
    name: str = Field(min_length=1, max_length=150)
    age_years: int | None = Field(default=None, ge=0, le=125)
    gender: Literal["male", "female", "other", "prefer_not_to_say"] | None = None
    doctor_details: DoctorDetailsInput | None = None

    @model_validator(mode="after")
    def validate_identifier(self) -> "RegisterRequest":
        if not (self.email and self.email.strip()) and not (self.phone and self.phone.strip()):
            raise ValueError("Either email or phone must be provided.")
        if self.email:
            self.email = self.email.strip().lower()
        if self.phone:
            self.phone = self.phone.strip()
        self.name = self.name.strip()
        return self


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    role: Literal["patient", "doctor"]
    email: str | None = None
    phone: str | None = None
    is_active: bool = True


class PatientPreferenceOut(BaseModel):
    id: str
    patient_id: str
    preferred_language: str
    reading_comfort_level: str
    explanation_depth: str
    preferred_response_format: str
    font_size: str
    font_scale_pct: int
    audio_speed: float
    high_contrast: bool
    voice_preference: str
    terminology_preference: str
    units_preference: str
    explanation_style: str
    auto_play_audio: bool
    accessibility_manual_override: bool


class PatientProfileOut(BaseModel):
    id: str
    user_id: str
    name: str
    age_years: int | None = None
    gender: str | None = None
    onboarding_completed: bool
    onboarding_step: int


class DoctorProfileOut(BaseModel):
    id: str
    user_id: str
    full_name: str
    specialty: str | None = None
    registration_number: str | None = None
    clinic_name: str | None = None
    languages_spoken: list[str]
    verification_status: str
