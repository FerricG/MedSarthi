"""Pydantic schemas for demo auth, explanations, translation, chat, documents, audio, doctor, and KB routes."""

from datetime import date
from typing import Any, Literal
from pydantic import BaseModel, Field
from app.schemas.patients import ComfortLevel, DepthLevel, GenderValue, SupportedLang


class DemoLoginRequest(BaseModel):
    role: Literal["patient", "doctor"]


# ---------------------------------------------------------------------------
# Explain & Translate
# ---------------------------------------------------------------------------


class ExplainRequest(BaseModel):
    source_type: Literal["consultation", "text", "diagnosis", "prescription", "lab_report"] | None = "text"
    consultation_id: str | None = None
    document_id: str | None = None
    raw_text: str | None = None
    target_language: SupportedLang | None = None
    explanation_depth: DepthLevel | None = None
    include_visuals: bool = True


class ExplainMoreRequest(BaseModel):
    consultation_id: str | None = None
    document_id: str | None = None
    source_text: str | None = None
    trigger: str = Field(default="more_detail", min_length=1, max_length=120)
    target_depth: DepthLevel | None = None
    focus_term_or_topic: str | None = None
    target_language: SupportedLang | None = None


class ExplainTermRequest(BaseModel):
    term: str = Field(min_length=1, max_length=200)
    context_snippet: str | None = Field(default=None, max_length=2000)
    target_language: SupportedLang | None = None
    depth: DepthLevel | None = None


class ExplainDiagnosisRequest(BaseModel):
    diagnosis_text: str = Field(min_length=1, max_length=2000)
    consultation_id: str | None = None
    target_language: SupportedLang | None = None


class ExplainMedicineRequest(BaseModel):
    medicine_name: str = Field(min_length=1, max_length=200)
    doctor_dosage_instruction: str | None = Field(default=None, max_length=1000)
    consultation_id: str | None = None
    target_language: SupportedLang | None = None


class ExplainReportRequest(BaseModel):
    document_id: str | None = None
    structured_lab_items: list[dict[str, Any]] | None = None
    raw_report_text: str | None = None
    target_language: SupportedLang | None = None


class TranslateRequest(BaseModel):
    text: str | None = None
    consultation_id: str | None = None
    explanation_payload: dict[str, Any] | None = None
    source_language: SupportedLang = "en"
    target_language: SupportedLang
    mode: Literal[
        "direct",
        "patient_friendly",
        "conversational",
        "medical_term_plus_meaning",
    ] = "patient_friendly"
    preserve_english_terms: bool = True


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatSendRequest(BaseModel):
    conversation_id: str | None = None
    message_text: str = Field(min_length=1, max_length=4000)
    input_modality: Literal["text", "voice"] = "text"
    source_audio_id: str | None = None
    stt_confirmed: bool = True
    context_consultation_id: str | None = None
    context_document_id: str | None = None
    target_language: SupportedLang | None = None
    depth_override: DepthLevel | None = None


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class DocumentVerifyRequest(BaseModel):
    corrected_ocr_text: str | None = None
    corrected_structured_fields: dict[str, Any] | None = None
    verification_decision: Literal["confirm", "reject_unreadable"]


class DocumentExplainRequest(BaseModel):
    target_language: SupportedLang | None = None
    explanation_depth: DepthLevel | None = None


# ---------------------------------------------------------------------------
# Audio & Speech
# ---------------------------------------------------------------------------


class AudioTranscribeRequest(BaseModel):
    audio_id: str = Field(min_length=1, max_length=64)
    language_hint: SupportedLang | None = None
    synthetic_demo_transcript: str | None = None


class AudioTranscriptUpdateRequest(BaseModel):
    speaker_reassignments: list[dict[str, Any]] | None = None
    text_edits: list[dict[str, Any]] | None = None
    speaker_map_verified: bool = True


class AudioSummarizeRequest(BaseModel):
    audio_id: str = Field(min_length=1, max_length=64)
    consultation_id: str | None = None
    target_language: SupportedLang | None = None
    auto_purge_audio_after_summary: bool = True


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    language: SupportedLang = "en"
    voice_preference: str = Field(default="warm_female", max_length=64)
    audio_speed: float = 1.0
    explanation_id: str | None = None
    message_id: str | None = None


# ---------------------------------------------------------------------------
# Doctor Workspace
# ---------------------------------------------------------------------------


class DoctorPatientCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    age_years: int | None = Field(default=None, ge=0, le=125)
    gender: GenderValue | None = None
    preferred_language: SupportedLang = "en"
    reading_comfort_level: ComfortLevel = "simple"
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)


class DoctorConsultationCreateRequest(BaseModel):
    patient_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    visit_date: date | None = None
    source_type: Literal[
        "doctor_entered",
        "doctor_audio",
        "doctor_document",
        "patient_upload",
    ] = "doctor_entered"
    original_doctor_input: str = Field(min_length=1)
    transcript_audio_id: str | None = None
    structured_data: dict[str, Any] = Field(default_factory=dict)


class DoctorConsultationGenerateRequest(BaseModel):
    target_language: SupportedLang | None = None
    explanation_depth: DepthLevel | None = None
    include_visuals: bool = True


class DoctorConsultationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    original_doctor_input: str | None = None
    structured_data: dict[str, Any] | None = None
    edited_explanation: dict[str, Any] | None = None
    amendment_reason: str | None = Field(default=None, max_length=500)


class DoctorConsultationApproveRequest(BaseModel):
    approve: bool = True
    review_note: str | None = Field(default=None, max_length=500)


class DoctorConsultationShareRequest(BaseModel):
    sharing_target: Literal["shared_with_patient", "revoked"] = "shared_with_patient"
