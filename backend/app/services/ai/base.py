"""Core interfaces, personalization context DTOs, and provenance schemas for AI services."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal
from pydantic import BaseModel, Field

LanguageCode = Literal["en", "hi", "hi-Latn"]
DepthLevel = Literal["very_simple", "simple", "detailed", "deep_dive"]
ReadingComfortLevel = Literal["very_simple", "simple", "comfortable", "adaptive"]
TerminologyPreference = Literal["plain_only", "plain_plus_medical", "medical_with_definitions"]
UnitsPreference = Literal["metric", "us_standard", "both"]
ExplanationStyle = Literal[
    "conversational",
    "straightforward",
    "calm_reassuring",
    "structured",
    "step_by_step",
]
TranslationMode = Literal[
    "direct",
    "patient_friendly",
    "conversational",
    "medical_term_plus_meaning",
]


def normalize_language(lang: str | None) -> str:
    """Normalize language aliases into canonical en / hi / hi-Latn (or passthrough)."""
    if not lang:
        return "en"
    cleaned = lang.strip()
    if cleaned in ("en", "hi", "hi-Latn"):
        return cleaned
    lower = cleaned.lower()
    if lower in ("english", "en-in", "en_in", "en-us"):
        return "en"
    if lower in ("hindi", "hi-in", "hi_in"):
        return "hi"
    if lower in ("hinglish", "hi-latn", "hi_latn", "roman-hindi"):
        return "hi-Latn"
    return cleaned


def normalize_depth(depth: str | None, comfort: str | None = None) -> str:
    """Resolve effective explanation depth while respecting reading comfort level."""
    valid_depths = {"very_simple", "simple", "detailed", "deep_dive"}
    if depth in valid_depths:
        return depth  # type: ignore[return-value]
    if comfort == "very_simple":
        return "very_simple"
    if comfort == "comfortable":
        return "detailed"
    return "simple"


class PersonalizationContext(BaseModel):
    """Patient personalization context passed into prompt builders (presentation-only)."""

    patient_name: str | None = None
    age_years: int | None = None
    gender: str | None = None
    preferred_language: str = "en"
    reading_comfort_level: str = "simple"
    explanation_depth: str = "simple"
    preferred_response_format: str = "text_audio"
    terminology_preference: str = "plain_plus_medical"
    units_preference: str = "metric"
    explanation_style: str = "calm_reassuring"
    audio_speed: float = 1.0
    voice_preference: str = "warm_female"

    @classmethod
    def from_models(
        cls,
        profile: Any | None = None,
        prefs: Any | None = None,
        override_language: str | None = None,
        override_depth: str | None = None,
    ) -> "PersonalizationContext":
        """Build PersonalizationContext safely from ORM models or dicts."""
        def _get(obj: Any, attr: str, default: Any = None) -> Any:
            if obj is None:
                return default
            if isinstance(obj, dict):
                return obj.get(attr, default)
            return getattr(obj, attr, default)

        comfort = _get(prefs, "reading_comfort_level", "simple")
        depth = normalize_depth(override_depth or _get(prefs, "explanation_depth"), comfort)
        lang = normalize_language(override_language or _get(prefs, "preferred_language", "en"))

        return cls(
            patient_name=_get(profile, "name"),
            age_years=_get(profile, "age_years"),
            gender=_get(profile, "gender"),
            preferred_language=lang,
            reading_comfort_level=comfort,
            explanation_depth=depth,
            preferred_response_format=_get(prefs, "preferred_response_format", "text_audio"),
            terminology_preference=_get(prefs, "terminology_preference", "plain_plus_medical"),
            units_preference=_get(prefs, "units_preference", "metric"),
            explanation_style=_get(prefs, "explanation_style", "calm_reassuring"),
            audio_speed=float(_get(prefs, "audio_speed", 1.0) or 1.0),
            voice_preference=_get(prefs, "voice_preference", "warm_female"),
        )


class LLMTaskRequest(BaseModel):
    """Structured prompt + payload bundle dispatched to an LLMProvider."""

    task_type: Literal[
        "explain",
        "explain_more",
        "explain_term",
        "explain_medicine",
        "explain_report",
        "explain_diagnosis",
        "translate",
        "chat",
        "audio_summarize",
    ]
    system_prompt: str
    user_prompt: str
    payload: dict[str, Any] = Field(default_factory=dict)
    temperature: float = 0.1
    max_tokens: int = 1600
    response_schema: dict[str, Any] | None = None


class LLMResponse(BaseModel):
    """Normalized JSON response envelope returned by all LLMProviders."""

    data: dict[str, Any]
    raw_text: str = ""
    provider_name: str
    model_name: str
    is_demo_fallback: bool = False
    latency_ms: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    privacy_notice: str = ""


class LLMProvider(ABC):
    """Abstract swappable provider interface for clinical communication LLM tasks."""

    provider_name: str
    model_name: str
    supports_zero_training: bool = False

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if credentials/prerequisites for this provider are present."""

    @abstractmethod
    async def generate_json(self, request: LLMTaskRequest) -> LLMResponse:
        """Execute a structured JSON generation call and return normalized LLMResponse."""
