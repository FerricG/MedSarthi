"""Token-locked multilingual translation service across 4 modes (en / hi / hi-Latn)."""

from __future__ import annotations

import re
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.ai.base import LLMTaskRequest, PersonalizationContext, normalize_language
from app.services.ai.explanation_service import (
    DEFAULT_DISCLAIMER,
    _safe_check_integrity,
    _safe_scrub_pii,
)
from app.services.ai.prompts import build_translation_prompt
from app.services.ai.registry import ProviderRegistry, get_provider_registry
from app.services.knowledge.retriever import KnowledgeRetriever, knowledge_retriever

VALID_TRANSLATION_MODES = (
    "direct",
    "patient_friendly",
    "conversational",
    "medical_term_plus_meaning",
)

# Protected drug names (including LASA pairs) that must NEVER be translated literally.
_PROTECTED_MEDICINE_NAMES = (
    "Paracetamol",
    "Acetaminophen",
    "Crocin",
    "Dolo-650",
    "Dolo",
    "Calpol",
    "Amlodipine",
    "Amlong",
    "Amlokind",
    "Norvasc",
    "Metformin",
    "Glycomet",
    "Glucophage",
    "Metronidazole",
    "Azithromycin",
    "Azithral",
    "Azee",
    "Zithromax",
    "Erythromycin",
    "Amoxicillin",
    "Amoxil",
    "Novamox",
    "Cefixime",
    "Cefuroxime",
    "Taxim-O",
    "Zifi",
    "Mahacef",
    "Glipizide",
    "Glyburide",
    "Prednisone",
    "Prednisolone",
    "Hydroxyzine",
    "Hydralazine",
    "Atorvastatin",
)

_LOCK_PATTERNS: list[re.Pattern[str]] = [
    # Measurements, dosages, vitals, lab values with units (e.g. 500 mg, 142/88 mmHg, 6.8 %, 102 F, 102°F)
    re.compile(
        r"\b\d+(?:/\d+)?(?:\.\d+)?\s*(?:mg/dL|mmol/L|umol/L|µmol/L|mmHg|mg|mcg|mL|IU|g|drops|puffs?|tsp|°\s?[FC]|[FC](?=\b)|%)\b",
        re.IGNORECASE,
    ),
    # ISO or slash dates
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
    # Dosing slot vectors like 1-0-1
    re.compile(r"\b\d-\d-\d(?:-\d)?\b"),
    # Exact medicine names
    re.compile(
        r"\b(?:" + "|".join(re.escape(m) for m in sorted(_PROTECTED_MEDICINE_NAMES, key=len, reverse=True)) + r")\b",
        re.IGNORECASE,
    ),
]


def lock_clinical_tokens(text: str) -> tuple[str, dict[str, str]]:
    """Pass 1: Replace critical clinical meds, dosages, units, vitals, and dates with [[LOCK_n]]."""
    if not text:
        return "", {}

    # Collect non-overlapping spans across all lock patterns
    matches: list[tuple[int, int, str]] = []
    for pat in _LOCK_PATTERNS:
        for m in pat.finditer(text):
            matches.append((m.start(), m.end(), m.group(0)))

    # Prefer earliest start, then longest match
    matches.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    filtered: list[tuple[int, int, str]] = []
    last_end = -1
    for start, end, val in matches:
        if start >= last_end:
            filtered.append((start, end, val))
            last_end = end

    locked_map: dict[str, str] = {}
    out_parts: list[str] = []
    cursor = 0
    for idx, (start, end, val) in enumerate(filtered):
        out_parts.append(text[cursor:start])
        token = f"[[LOCK_{idx}]]"
        canonical_med = next((name for name in _PROTECTED_MEDICINE_NAMES if name.lower() == val.lower()), None)
        locked_map[token] = canonical_med if canonical_med else val
        out_parts.append(token)
        cursor = end
    out_parts.append(text[cursor:])
    return "".join(out_parts), locked_map


def restore_clinical_tokens(text: str, locked_map: dict[str, str]) -> tuple[str, list[str]]:
    """Pass 3a: Restore [[LOCK_n]] tokens verbatim and report any missing tokens."""
    restored = text.replace("\u202f", " ").replace("\u00a0", " ")
    missing: list[str] = []
    for token, original_val in locked_map.items():
        if token in restored:
            restored = restored.replace(token, original_val)
        elif original_val.lower() not in restored.lower():
            missing.append(original_val)
    return restored, missing


class TranslationService:
    """Three-pass token-locked translation service with deterministic Integrity Checker verification."""

    def __init__(
        self,
        registry: ProviderRegistry | None = None,
        retriever: KnowledgeRetriever | None = None,
    ) -> None:
        self.registry = registry or get_provider_registry()
        self.retriever = retriever or knowledge_retriever

    async def translate_text(
        self,
        session: AsyncSession,
        text: str,
        target_language: str = "hi",
        source_language: str = "en",
        mode: str = "patient_friendly",
        preserve_english_terms: bool = True,
        prefs: PersonalizationContext | None = None,
    ) -> dict[str, Any]:
        """Translate clinical text across 4 modes while locking meds/doses/units and running Integrity Check."""
        if not text or not text.strip():
            return {
                "translated_text": "",
                "source_language": normalize_language(source_language),
                "target_language": normalize_language(target_language),
                "mode": mode,
                "preserved_terms": [],
                "missing_locked_tokens": [],
                "safety": {
                    "integrity_status": "passed",
                    "disclaimer": DEFAULT_DISCLAIMER,
                },
            }

        tgt_lang = normalize_language(target_language)
        src_lang = normalize_language(source_language)
        resolved_mode = mode if mode in VALID_TRANSLATION_MODES else "patient_friendly"

        # Pass 1: Lock sensitive meds, dosages, vitals, dates
        locked_text, locked_map = lock_clinical_tokens(text)
        patient_name = prefs.patient_name if prefs else None
        scrubbed_locked = _safe_scrub_pii(locked_text, patient_name)

        # Fetch KB glosses for medical_term_plus_meaning or preserve_english_terms
        kb_glosses: list[dict[str, Any]] = []
        if resolved_mode == "medical_term_plus_meaning" or preserve_english_terms:
            kb_hits = await self.retriever.find_relevant_entries(
                session, text, language=tgt_lang, limit=5
            )
            kb_glosses = [
                {
                    "canonical_name": hit["canonical_name"],
                    "localized_simple": hit["localized_simple"],
                    "simple_en": hit["simple_en"],
                    "source_name": hit["source_name"],
                    "source_url": hit["source_url"],
                }
                for hit in kb_hits
            ]

        # Pass 2: Execute mode-aware translation
        system_prompt, user_prompt = build_translation_prompt(
            source_text=scrubbed_locked,
            source_lang=src_lang,
            target_lang=tgt_lang,
            mode=resolved_mode,
            locked_tokens=locked_map,
            kb_glosses=kb_glosses,
        )
        req = LLMTaskRequest(
            task_type="translate",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "source_text": text,
                "locked_text": scrubbed_locked,
                "locked_tokens": locked_map,
                "source_language": src_lang,
                "target_language": tgt_lang,
                "mode": resolved_mode,
                "preserve_english_terms": preserve_english_terms,
                "kb_glosses": kb_glosses,
                "prefs": (prefs.model_dump() if prefs else {}),
            },
        )
        llm_resp = await self.registry.generate_json(req)
        raw_translated = str(llm_resp.data.get("translated_text") or "")

        # Pass 3: Restore locked tokens & run deterministic Integrity Checker
        translated_text, missing_tokens = restore_clinical_tokens(raw_translated, locked_map)
        if missing_tokens:
            # Fail-safe append missing locked tokens visibly so critical facts are never dropped silently
            translated_text = f"{translated_text} ({', '.join(missing_tokens)})".strip()

        preserved_terms = llm_resp.data.get("preserved_terms") or []
        if not isinstance(preserved_terms, list):
            preserved_terms = []
        for val in locked_map.values():
            if not any(
                isinstance(pt, dict) and pt.get("medical_term") == val for pt in preserved_terms
            ):
                preserved_terms.append({"medical_term": val, "localized_gloss": val})

        integrity = _safe_check_integrity(
            source_text=text,
            output_text=translated_text,
            structured_source=None,
            output_language=tgt_lang,
        )
        status = integrity.get("status", "passed")
        if missing_tokens and status == "passed":
            status = "warning"

        return {
            "translated_text": translated_text,
            "source_language": src_lang,
            "target_language": tgt_lang,
            "mode": resolved_mode,
            "preserved_terms": preserved_terms,
            "missing_locked_tokens": missing_tokens,
            "safety": {
                "integrity_status": status,
                "integrity_report": integrity,
                "disclaimer": DEFAULT_DISCLAIMER,
            },
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
            },
        }

    async def translate_provenance_payload(
        self,
        session: AsyncSession,
        provenance: dict[str, Any],
        target_language: str = "hi",
        source_language: str = "en",
        mode: str = "patient_friendly",
        preserve_english_terms: bool = True,
        prefs: PersonalizationContext | None = None,
    ) -> dict[str, Any]:
        """Translate a 4-category provenance dictionary while preserving structure & citations."""
        ai_block = provenance.get("ai_simplified") or {}
        summary = ai_block.get("summary", "") if isinstance(ai_block, dict) else str(ai_block)
        steps = ai_block.get("steps", []) if isinstance(ai_block, dict) else []

        summary_res = await self.translate_text(
            session=session,
            text=summary,
            target_language=target_language,
            source_language=source_language,
            mode=mode,
            preserve_english_terms=preserve_english_terms,
            prefs=prefs,
        )
        translated_steps: list[str] = []
        all_preserved_terms = list(summary_res.get("preserved_terms") or [])
        for step in steps:
            step_res = await self.translate_text(
                session=session,
                text=str(step),
                target_language=target_language,
                source_language=source_language,
                mode=mode,
                preserve_english_terms=preserve_english_terms,
                prefs=prefs,
            )
            translated_steps.append(step_res["translated_text"])
            for pt in step_res.get("preserved_terms") or []:
                if pt not in all_preserved_terms:
                    all_preserved_terms.append(pt)

        full_translated_text = summary_res["translated_text"]
        if translated_steps:
            full_translated_text = f"{full_translated_text}\n" + "\n".join(translated_steps)
        full_translated_text = full_translated_text.replace("\u202f", " ").replace("\u00a0", " ")

        translated_prov = {
            "doctor_provided": provenance.get("doctor_provided", []),
            "ai_simplified": {
                "summary": summary_res["translated_text"],
                "steps": translated_steps,
                "reading_level": ai_block.get("reading_level", "simple") if isinstance(ai_block, dict) else "simple",
                "language": normalize_language(target_language),
            },
            "general_education": provenance.get("general_education", []),
            "uncertain_or_missing": provenance.get("uncertain_or_missing", []),
        }
        return {
            "translated_text": full_translated_text,
            "structured_translation": translated_prov,
            "source_language": summary_res["source_language"],
            "target_language": summary_res["target_language"],
            "mode": summary_res["mode"],
            "preserved_terms": all_preserved_terms,
            "safety": summary_res["safety"],
        }


translation_service = TranslationService()
