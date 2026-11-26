"""Exports all 12 lean SQLAlchemy models for MedSarthi."""

from app.models.auth import (
    AuthSession,
    DoctorPatientLink,
    DoctorProfile,
    PatientPreference,
    PatientProfile,
    User,
    compute_age_accessibility_defaults,
)
from app.models.clinical import (
    AudioRecord,
    Consultation,
    Conversation,
    ConversationMessage,
    MedicalDocument,
)
from app.models.knowledge import KBEntry

__all__ = [
    "User",
    "AuthSession",
    "PatientProfile",
    "PatientPreference",
    "DoctorProfile",
    "DoctorPatientLink",
    "Consultation",
    "MedicalDocument",
    "AudioRecord",
    "Conversation",
    "ConversationMessage",
    "KBEntry",
    "compute_age_accessibility_defaults",
]
