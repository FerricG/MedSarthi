"""Clinical consultations, documents, audio, and conversation models (Tables 7-11)."""

from datetime import UTC, date, datetime
import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Consultation(Base):
    """7. consultations — Immutable doctor source + structured data + provenance explanation + gates."""

    __tablename__ = "consultations"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('doctor_entered', 'doctor_audio', 'doctor_document', 'patient_upload')",
            name="ck_consult_source_type",
        ),
        CheckConstraint(
            "explanation_depth IN ('very_simple', 'simple', 'detailed', 'deep_dive')",
            name="ck_consult_depth",
        ),
        CheckConstraint(
            "approval_status IN ('draft', 'pending_review', 'safety_flagged', 'approved', 'needs_doctor_edit', 'rejected')",
            name="ck_consult_approval",
        ),
        CheckConstraint(
            "sharing_status IN ('private_draft', 'shared_with_patient', 'revoked')",
            name="ck_consult_sharing",
        ),
        CheckConstraint(
            "integrity_status IN ('unchecked', 'passed', 'warning', 'blocked')",
            name="ck_consult_integrity",
        ),
        Index("idx_consultations_patient_visit", "patient_id", "visit_date", "sharing_status"),
        Index("idx_consultations_doctor_status", "doctor_id", "approval_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    doctor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("doctor_profiles.id", ondelete="SET NULL"), nullable=True
    )
    parent_consultation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True
    )
    source_type: Mapped[str] = mapped_column(String(24), nullable=False, default="doctor_entered")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    visit_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    original_doctor_input: Mapped[str] = mapped_column(Text, nullable=False)
    original_input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    original_input_locked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    transcript_audio_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey(
            "audio_records.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_consultations_transcript_audio",
        ),
        nullable=True,
    )

    structured_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    generated_explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    explanation_language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    explanation_depth: Mapped[str] = mapped_column(String(24), nullable=False, default="simple")

    approval_status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    approved_by_doctor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("doctor_profiles.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sharing_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="private_draft"
    )
    shared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    integrity_status: Mapped[str] = mapped_column(String(16), nullable=False, default="unchecked")
    integrity_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MedicalDocument(Base):
    """8. medical_documents — Prescriptions, lab reports, and OCR verification metadata."""

    __tablename__ = "medical_documents"
    __table_args__ = (
        CheckConstraint(
            "document_type IN ('prescription', 'lab_report', 'discharge_summary', 'clinical_note', 'other')",
            name="ck_doc_type",
        ),
        CheckConstraint(
            "ocr_confidence_score IS NULL OR (ocr_confidence_score >= 0.0 AND ocr_confidence_score <= 1.0)",
            name="ck_doc_ocr_conf",
        ),
        CheckConstraint(
            "processing_status IN ('uploaded', 'queued', 'extracting', 'extracted', 'needs_verification', 'explaining', 'completed', 'failed')",
            name="ck_doc_proc_status",
        ),
        CheckConstraint(
            "verification_status IN ('unverified', 'patient_confirmed', 'doctor_verified', 'rejected_unreadable')",
            name="ck_doc_verif_status",
        ),
        Index("idx_med_docs_patient_status", "patient_id", "processing_status", "deleted_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    consultation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    document_type: Mapped[str] = mapped_column(String(24), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    sha256_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    ocr_raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_structured_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ocr_confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    uncertain_spans: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)

    processing_status: Mapped[str] = mapped_column(String(24), nullable=False, default="uploaded")
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="unverified"
    )
    verified_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AudioRecord(Base):
    """9. audio_records — Voice queries, consultation audio, TTS outputs, and TTL purge tracking."""

    __tablename__ = "audio_records"
    __table_args__ = (
        CheckConstraint(
            "audio_purpose IN ('doctor_consultation', 'patient_voice_query', 'tts_output')",
            name="ck_audio_purpose",
        ),
        CheckConstraint(
            "audio_purpose = 'tts_output' OR consent_recorded = 1",
            name="ck_audio_consent_required",
        ),
        CheckConstraint(
            "stt_confidence_score IS NULL OR (stt_confidence_score >= 0.0 AND stt_confidence_score <= 1.0)",
            name="ck_audio_stt_conf",
        ),
        CheckConstraint(
            "processing_status IN ('uploaded', 'queued', 'transcribing', 'transcribed', 'confirmed', 'ready', 'failed', 'purged')",
            name="ck_audio_proc_status",
        ),
        Index("idx_audio_retention", "retention_expires_at", "purged_at"),
        Index("idx_audio_patient", "patient_id", "audio_purpose", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    consultation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    audio_purpose: Mapped[str] = mapped_column(String(24), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, default="audio/mpeg")
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    consent_recorded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    stt_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stt_language_detected: Mapped[str | None] = mapped_column(String(16), nullable=True)
    stt_confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    transcript_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    tts_cues: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    processing_status: Mapped[str] = mapped_column(String(24), nullable=False, default="uploaded")
    retention_policy: Mapped[str] = mapped_column(String(32), nullable=False, default="ephemeral_24h")
    retention_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Conversation(Base):
    """10. conversations — Patient-scoped Q&A threads anchored to optional consultation/document."""

    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_conv_status"),
        Index("idx_conversations_patient_updated", "patient_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    consultation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True
    )
    document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("medical_documents.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="Health Question")
    primary_language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMessage(Base):
    """11. conversation_messages — Individual Q&A turns with provenance blocks & safety flags."""

    __tablename__ = "conversation_messages"
    __table_args__ = (
        CheckConstraint(
            "sender_role IN ('patient', 'doctor', 'assistant', 'system')",
            name="ck_msg_sender_role",
        ),
        CheckConstraint("input_modality IN ('text', 'voice')", name="ck_msg_modality"),
        CheckConstraint(
            "integrity_status IN ('unchecked', 'passed', 'warning', 'blocked')",
            name="ck_msg_integrity",
        ),
        Index("idx_conv_messages_thread_time", "conversation_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_role: Mapped[str] = mapped_column(String(16), nullable=False)
    sender_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    input_modality: Mapped[str] = mapped_column(String(12), nullable=False, default="text")
    source_audio_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("audio_records.id", ondelete="SET NULL"), nullable=True
    )
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    stt_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    stt_confirmed_by_user: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    provenance_blocks: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    context_refs: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    emergency_flag_triggered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    integrity_status: Mapped[str] = mapped_column(String(16), nullable=False, default="passed")
    tts_audio_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("audio_records.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
