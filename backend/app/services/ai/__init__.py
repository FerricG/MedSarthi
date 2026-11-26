"""AI providers, prompt templates, explanation, translation, and consultation Q&A services."""

from app.services.ai.base import (
    LLMProvider,
    LLMResponse,
    LLMTaskRequest,
    PersonalizationContext,
    normalize_depth,
    normalize_language,
)
from app.services.ai.chat_service import ChatService, chat_service
from app.services.ai.explanation_service import (
    ExplanationService,
    convert_lab_value_for_display,
    explanation_service,
)
from app.services.ai.llm_providers import (
    DemoClinicalLLMProvider,
    GeminiLLMProvider,
    GroqLLMProvider,
    OpenAILLMProvider,
)
from app.services.ai.prompts import (
    EXPLAIN_MORE_TRIGGERS,
    MEDICATION_EIGHT_PROHIBITIONS,
    PROMPT_TEMPLATES,
    canonicalize_explain_more_trigger,
)
from app.services.ai.registry import ProviderRegistry, check_provider_privacy, get_provider_registry
from app.services.ai.translation_service import (
    TranslationService,
    lock_clinical_tokens,
    restore_clinical_tokens,
    translation_service,
)

__all__ = [
    "ChatService",
    "DemoClinicalLLMProvider",
    "EXPLAIN_MORE_TRIGGERS",
    "ExplanationService",
    "GeminiLLMProvider",
    "GroqLLMProvider",
    "LLMProvider",
    "LLMResponse",
    "LLMTaskRequest",
    "MEDICATION_EIGHT_PROHIBITIONS",
    "OpenAILLMProvider",
    "PROMPT_TEMPLATES",
    "PersonalizationContext",
    "ProviderRegistry",
    "TranslationService",
    "canonicalize_explain_more_trigger",
    "chat_service",
    "check_provider_privacy",
    "convert_lab_value_for_display",
    "explanation_service",
    "get_provider_registry",
    "lock_clinical_tokens",
    "normalize_depth",
    "normalize_language",
    "restore_clinical_tokens",
    "translation_service",
]
