"""Swappable LLM provider registry with startup/call privacy checks and primary->fallback routing."""

from __future__ import annotations

import logging
from typing import Any
import httpx
from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.services.ai.base import LLMProvider, LLMResponse, LLMTaskRequest
from app.services.ai.llm_providers import (
    DEPRECATED_GEMINI_MODELS,
    DemoClinicalLLMProvider,
    GeminiLLMProvider,
    GroqLLMProvider,
    OpenAILLMProvider,
    OpenRouterLLMProvider,
)

logger = logging.getLogger(__name__)


def check_provider_privacy(provider_name: str, settings: Settings) -> tuple[bool, str | None]:
    """Enforce zero-training & ZDR privacy rules before calling an external LLM provider."""
    name = (provider_name or "").strip().lower()
    if name == "gemini":
        if (settings.GEMINI_MODEL or "").strip() in DEPRECATED_GEMINI_MODELS:
            return (
                False,
                f"Gemini model '{settings.GEMINI_MODEL}' is deprecated/shut down; use 'gemini-3.5-flash-lite'.",
            )
        if not settings.LLM_ALLOW_UNPAID_TRAINING_TIER and not settings.SYNTHETIC_PROTOTYPE_MODE:
            return (
                False,
                "Unpaid/non-BAA Google AI Studio Gemini tier is blocked when SYNTHETIC_PROTOTYPE_MODE=false and LLM_ALLOW_UNPAID_TRAINING_TIER=false.",
            )
        if not settings.LLM_ALLOW_UNPAID_TRAINING_TIER and settings.APP_ENV != "development":
            return (
                False,
                "Gemini AI Studio free tier blocked outside development unless LLM_ALLOW_UNPAID_TRAINING_TIER=true.",
            )
        return True, None

    if name == "groq":
        if not settings.SYNTHETIC_PROTOTYPE_MODE and not settings.GROQ_ZDR_VERIFIED:
            return (
                False,
                "Groq retains prompts up to 30 days by default; set GROQ_ZDR_VERIFIED=true after enabling Zero Data Retention in Groq Console.",
            )
        return True, None

    if name in ("openai", "openrouter"):
        return True, None

    return False, f"Unknown LLM provider '{provider_name}'."


def _build_provider(name: str, settings: Settings) -> LLMProvider | None:
    normalized = (name or "").strip().lower()
    if normalized == "groq":
        return GroqLLMProvider(settings)
    if normalized == "gemini":
        return GeminiLLMProvider(settings)
    if normalized == "openai":
        return OpenAILLMProvider(settings)
    if normalized == "openrouter":
        return OpenRouterLLMProvider(settings)
    return None


class ProviderRegistry:
    """Resolves primary + optional fallback LLM provider or DemoClinicalLLMProvider."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def get_llm_chain(self) -> tuple[list[LLMProvider], list[str]]:
        """Return (active_providers, privacy_warnings).

        Returns DemoClinicalLLMProvider ONLY when no cloud API keys are configured and
        SYNTHETIC_PROTOTYPE_MODE=true.
        """
        warnings: list[str] = []
        candidates: list[str] = []
        for raw_name in (self.settings.LLM_PRIMARY_PROVIDER, self.settings.LLM_FALLBACK_PROVIDER, "openrouter"):
            name = (raw_name or "").strip().lower()
            if name and name not in candidates:
                candidates.append(name)

        configured_cloud: list[LLMProvider] = []
        saw_any_key = False
        for name in candidates:
            provider = _build_provider(name, self.settings)
            if provider is None or not provider.is_configured():
                continue
            saw_any_key = True
            allowed, reason = check_provider_privacy(name, self.settings)
            if not allowed:
                warnings.append(reason or f"Provider '{name}' blocked by privacy guard.")
                logger.warning("Privacy guard blocked LLM provider %s: %s", name, reason)
                continue
            configured_cloud.append(provider)

        if configured_cloud:
            return configured_cloud[:2], warnings

        if saw_any_key and warnings:
            # Keys exist, but all configured providers were blocked by privacy guard
            raise AppError(
                503,
                "PROVIDER_PRIVACY_BLOCKED",
                "Configured LLM providers failed privacy validation: " + "; ".join(warnings),
            )

        if self.settings.SYNTHETIC_PROTOTYPE_MODE:
            return [DemoClinicalLLMProvider()], warnings

        raise AppError(
            503,
            "PROVIDER_UNAVAILABLE",
            "No LLM API key is configured and SYNTHETIC_PROTOTYPE_MODE is disabled.",
        )

    async def generate_json(self, request: LLMTaskRequest) -> LLMResponse:
        """Dispatch LLMTaskRequest to primary provider with automatic failover to optional fallback."""
        chain, _warnings = self.get_llm_chain()
        last_exc: Exception | None = None
        for provider in chain:
            try:
                return await provider.generate_json(request)
            except (AppError, httpx.HTTPError, ValueError, TimeoutError) as exc:
                last_exc = exc
                logger.warning(
                    "LLM provider '%s' failed for task '%s': %s (%s)",
                    provider.provider_name,
                    request.task_type,
                    type(exc).__name__,
                    exc,
                )
                continue

        if isinstance(last_exc, AppError):
            raise last_exc
        raise AppError(
            503,
            "PROVIDER_UNAVAILABLE",
            "All configured LLM providers failed to respond.",
        )

    def status_summary(self) -> dict[str, Any]:
        """Return safe non-secret provider readiness summary for diagnostics."""
        try:
            chain, warnings = self.get_llm_chain()
            return {
                "primary": chain[0].provider_name,
                "fallback": chain[1].provider_name if len(chain) > 1 else None,
                "demo_mode": isinstance(chain[0], DemoClinicalLLMProvider),
                "warnings": warnings,
            }
        except AppError as exc:
            return {
                "primary": None,
                "fallback": None,
                "demo_mode": False,
                "warnings": [exc.message],
            }


def get_provider_registry(settings: Settings | None = None) -> ProviderRegistry:
    """Create a ProviderRegistry using current settings."""
    return ProviderRegistry(settings=settings or get_settings())
