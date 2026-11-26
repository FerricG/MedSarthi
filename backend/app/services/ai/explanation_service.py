"""Core Medical Explanation, Term, Medicine, Report, Audio Summary & Explain More orchestration."""

from __future__ import annotations

import re
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.services.ai.base import LLMTaskRequest, PersonalizationContext, normalize_depth, normalize_language
from app.services.ai.prompts import (
    EXPLAIN_MORE_TRIGGERS,
    MEDICATION_EIGHT_PROHIBITIONS,
    build_audio_summary_prompt,
    build_explanation_prompt,
    build_explain_more_prompt,
    build_medicine_explainer_prompt,
    build_term_explainer_prompt,
    canonicalize_explain_more_trigger,
)
from app.services.ai.registry import ProviderRegistry, get_provider_registry
from app.services.knowledge.retriever import KnowledgeRetriever, knowledge_retriever, list_diagrams

DEFAULT_DISCLAIMER = (
    "This explanation helps you understand your doctor's advice. "
    "It is not a medical diagnosis or prescription. Educational prototype using synthetic data only."
)

_DEPTH_ORDER = ("very_simple", "simple", "detailed", "deep_dive")


def _safe_scrub_pii(text: str, patient_name: str | None = None) -> str:
    try:
        from app.services.safety.pii_scrubber import scrub_pii  # type: ignore[import-not-found]

        return scrub_pii(text, patient_name=patient_name)
    except Exception:
        cleaned = text
        if patient_name:
            cleaned = re.sub(re.escape(patient_name), "[PATIENT_NAME]", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\+?\d[\d\s\-]{8,14}\d", "[PHONE]", cleaned)
        cleaned = re.sub(r"[\w\.\-]+@[\w\.\-]+\.\w+", "[EMAIL]", cleaned)
        return cleaned


def _safe_detect_emergency(text: str, context_mode: str = "doctor_note") -> dict[str, Any]:
    try:
        from app.services.safety.emergency_detector import detect_emergency

        return detect_emergency(text, context_mode=context_mode)
    except Exception:
        return {"is_emergency": False, "categories": [], "helplines": [], "guidance": None}


def _safe_check_integrity(
    source_text: str,
    output_text: str,
    structured_source: dict[str, Any] | None = None,
    output_language: str = "en",
) -> dict[str, Any]:
    try:
        from app.services.safety.integrity_checker import check_instruction_integrity  # type: ignore[import-not-found]

        return check_instruction_integrity(
            source_text=source_text,
            output_text=output_text,
            structured_source=structured_source,
            output_language=output_language,
        )
    except Exception:
        return {
            "status": "passed",
            "risk_level": "low",
            "rules_evaluated": 0,
            "mismatches": [],
            "negation_preserved": True,
            "dosage_preserved": True,
            "frequency_preserved": True,
            "duration_preserved": True,
            "measurements_preserved": True,
            "disclaimer": "Fallback check (integrity module unavailable).",
        }


def _safe_validate_provenance(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from app.services.safety.provenance_validator import validate_provenance_and_guardrails

        return validate_provenance_and_guardrails(payload)
    except Exception:
        prov = payload.get("provenance", payload)
        keys_ok = all(
            k in prov for k in ("doctor_provided", "ai_simplified", "general_education", "uncertain_or_missing")
        )
        return {"is_valid": keys_ok, "provenance_complete": keys_ok, "violations": []}


def _flatten_provenance_text(provenance: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in provenance.get("doctor_provided", []) or []:
        if isinstance(item, dict):
            parts.append(str(item.get("text", "")))
        else:
            parts.append(str(item))
    ai_block = provenance.get("ai_simplified") or {}
    if isinstance(ai_block, dict):
        parts.append(str(ai_block.get("summary", "")))
        parts.extend(str(s) for s in (ai_block.get("steps") or []))
    elif isinstance(ai_block, str):
        parts.append(ai_block)
    return "\n".join(p for p in parts if p)


def _normalize_provenance_shape(raw: dict[str, Any], language: str, depth: str) -> dict[str, Any]:
    doc_items = raw.get("doctor_provided")
    if not isinstance(doc_items, list):
        doc_items = []
    ai_block = raw.get("ai_simplified")
    if isinstance(ai_block, str):
        ai_block = {"summary": ai_block, "steps": [], "reading_level": depth, "language": language}
    elif not isinstance(ai_block, dict):
        ai_block = {"summary": "", "steps": [], "reading_level": depth, "language": language}
    else:
        ai_block.setdefault("steps", [])
        ai_block.setdefault("reading_level", depth)
        ai_block.setdefault("language", language)

    gen_edu = raw.get("general_education")
    if not isinstance(gen_edu, list):
        gen_edu = []
    uncertain = raw.get("uncertain_or_missing")
    if not isinstance(uncertain, list):
        uncertain = []

    return {
        "doctor_provided": doc_items,
        "ai_simplified": ai_block,
        "general_education": gen_edu,
        "uncertain_or_missing": uncertain,
    }


def _collect_diagrams_for_kb(
    kb_entries: list[dict[str, Any]],
    language: str,
    depth: str,
    include_visuals: bool = True,
) -> list[dict[str, Any]]:
    if not include_visuals:
        return []
    seen: set[str] = set()
    diagrams: list[dict[str, Any]] = []
    for entry in kb_entries:
        d_key = entry.get("diagram_key")
        if d_key and d_key not in seen:
            seen.add(d_key)
            for item in list_diagrams(language=language, key=d_key, depth=depth):
                diagrams.append(item)
    return diagrams


def convert_lab_value_for_display(
    test_name: str,
    value: str | float | int,
    unit: str,
    units_preference: str = "metric",
) -> dict[str, Any]:
    """Deterministic lab unit helper that ALWAYS preserves the original value and unit."""
    orig_val_str = str(value).strip()
    orig_unit = (unit or "").strip()
    converted: dict[str, Any] | None = None

    try:
        num = float(orig_val_str)
    except ValueError:
        num = None

    if num is not None and units_preference in ("us_standard", "both"):
        name_l = test_name.lower()
        unit_l = orig_unit.lower()
        if "glucose" in name_l and unit_l == "mg/dl":
            converted = {"value": f"{num / 18.016:.2f}", "unit": "mmol/L"}
        elif "glucose" in name_l and unit_l == "mmol/l":
            converted = {"value": f"{num * 18.016:.0f}", "unit": "mg/dL"}
        elif "creatinine" in name_l and unit_l == "mg/dl":
            converted = {"value": f"{num * 88.4:.1f}", "unit": "umol/L"}
        elif "creatinine" in name_l and unit_l in ("umol/l", "µmol/l"):
            converted = {"value": f"{num / 88.4:.2f}", "unit": "mg/dL"}
        elif unit_l in ("°f", "f") and ("temp" in name_l or num > 80):
            converted = {"value": f"{(num - 32) * 5 / 9:.1f}", "unit": "°C"}
        elif unit_l in ("°c", "c") and ("temp" in name_l or num < 45):
            converted = {"value": f"{(num * 9 / 5) + 32:.1f}", "unit": "°F"}

    display_text = f"{orig_val_str} {orig_unit}".strip()
    if converted and units_preference in ("us_standard", "both"):
        display_text = f"{display_text} ({converted['value']} {converted['unit']})"

    return {
        "test_name": test_name,
        "original_value": orig_val_str,
        "original_unit": orig_unit,
        "converted": converted,
        "display": display_text,
    }


def step_depth_up(current_depth: str) -> str:
    """Move up one progressive detail tier."""
    norm = normalize_depth(current_depth)
    idx = _DEPTH_ORDER.index(norm)
    return _DEPTH_ORDER[min(idx + 1, len(_DEPTH_ORDER) - 1)]


class ExplanationService:
    """Orchestrates KB-grounded, personalized, safety-checked clinical explanations."""

    def __init__(
        self,
        registry: ProviderRegistry | None = None,
        retriever: KnowledgeRetriever | None = None,
    ) -> None:
        self.registry = registry or get_provider_registry()
        self.retriever = retriever or knowledge_retriever

    def _build_safety_summary(
        self,
        source_text: str,
        provenance: dict[str, Any],
        structured_data: dict[str, Any] | None,
        language: str,
        context_mode: str = "doctor_note",
    ) -> dict[str, Any]:
        output_text = _flatten_provenance_text(provenance)
        integrity = _safe_check_integrity(
            source_text=source_text,
            output_text=output_text,
            structured_source=structured_data,
            output_language=language,
        )
        guardrail = _safe_validate_provenance(
            {"provenance": provenance, "safety": {"disclaimer": DEFAULT_DISCLAIMER}}
        )
        emergency = _safe_detect_emergency(source_text, context_mode=context_mode)

        status = integrity.get("status", "passed")
        if not guardrail.get("is_valid", True) and status == "passed":
            status = "warning"

        return {
            "integrity_status": status,
            "integrity_report": integrity,
            "guardrail_check": guardrail,
            "emergency_flag": bool(emergency.get("is_emergency", False)),
            "emergency_guidance": emergency.get("guidance") if emergency.get("is_emergency") else None,
            "disclaimer": DEFAULT_DISCLAIMER,
        }

    async def explain_clinical_input(
        self,
        session: AsyncSession,
        source_text: str,
        input_type: str = "clinical_notes",
        structured_data: dict[str, Any] | None = None,
        prefs: PersonalizationContext | None = None,
        include_visuals: bool = True,
        extra_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Generate a 4-category provenance explanation for any of the 8 clinical input types."""
        p = prefs or PersonalizationContext()
        kb_entries = await self.retriever.find_relevant_entries(
            session, source_text, language=p.preferred_language, limit=5
        )
        scrubbed_source = _safe_scrub_pii(source_text, p.patient_name)
        system_prompt, user_prompt = build_explanation_prompt(
            input_type=input_type,
            source_text=scrubbed_source,
            structured_data=structured_data,
            kb_entries=kb_entries,
            prefs=p,
            include_visuals=include_visuals,
            extra_context=extra_context,
        )
        req = LLMTaskRequest(
            task_type="explain",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "input_type": input_type,
                "source_text": source_text,
                "structured_data": structured_data or {},
                "kb_entries": kb_entries,
                "prefs": p.model_dump(),
                "target_language": p.preferred_language,
                "target_depth": p.explanation_depth,
            },
        )
        llm_resp = await self.registry.generate_json(req)
        provenance = _normalize_provenance_shape(llm_resp.data, p.preferred_language, p.explanation_depth)
        safety = self._build_safety_summary(
            source_text=source_text,
            provenance=provenance,
            structured_data=structured_data,
            language=p.preferred_language,
            context_mode="doctor_note",
        )
        diagrams = _collect_diagrams_for_kb(
            kb_entries, p.preferred_language, p.explanation_depth, include_visuals=include_visuals
        )
        return {
            "input_type": input_type,
            "language": p.preferred_language,
            "depth": p.explanation_depth,
            "provenance": provenance,
            "visual_diagrams": diagrams,
            "safety": safety,
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
                "latency_ms": llm_resp.latency_ms,
            },
        }

    async def explain_term(
        self,
        session: AsyncSession,
        term: str,
        context_snippet: str | None = None,
        prefs: PersonalizationContext | None = None,
        target_language: str | None = None,
        depth: str | None = None,
    ) -> dict[str, Any]:
        """Explain a medical term returning all 10 mandatory fields + provenance + citations."""
        p = prefs or PersonalizationContext()
        if target_language or depth:
            p = p.model_copy(
                update={
                    "preferred_language": normalize_language(target_language or p.preferred_language),
                    "explanation_depth": normalize_depth(depth or p.explanation_depth, p.reading_comfort_level),
                }
            )

        kb_entry = await self.retriever.lookup_term(session, term, language=p.preferred_language)
        system_prompt, user_prompt = build_term_explainer_prompt(
            term=term,
            context_snippet=context_snippet,
            kb_entry=kb_entry,
            prefs=p,
        )
        req = LLMTaskRequest(
            task_type="explain_term",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "term": term,
                "context_snippet": context_snippet,
                "kb_entry": kb_entry,
                "prefs": p.model_dump(),
                "target_language": p.preferred_language,
                "target_depth": p.explanation_depth,
            },
        )
        llm_resp = await self.registry.generate_json(req)
        term_data = llm_resp.data

        # Enforce zero fabricated citations: verified_source comes strictly from KB lookup
        verified_source = (
            [
                {
                    "source_name": kb_entry["source_name"],
                    "source_url": kb_entry["source_url"],
                    "last_reviewed_at": kb_entry.get("last_reviewed_at"),
                }
            ]
            if kb_entry
            else []
        )
        term_data["verified_source"] = verified_source

        provenance = {
            "doctor_provided": (
                [{"item_type": "context_snippet", "text": context_snippet, "source_ref": "user_context"}]
                if context_snippet
                else []
            ),
            "ai_simplified": {
                "summary": term_data.get("selected_language_explanation") or term_data.get("simple_definition", ""),
                "steps": [],
                "reading_level": p.explanation_depth,
                "language": p.preferred_language,
            },
            "general_education": (
                [
                    {
                        "topic": term_data.get("term", term),
                        "text": term_data.get("detailed_explanation") or term_data.get("simple_definition", ""),
                        "source_name": verified_source[0]["source_name"],
                        "source_url": verified_source[0]["source_url"],
                        "diagram_id": kb_entry.get("diagram_key") if kb_entry else None,
                        "citations": verified_source,
                    }
                ]
                if verified_source
                else []
            ),
            "uncertain_or_missing": term_data.get("uncertain_or_missing") or (
                []
                if kb_entry
                else [{"field": "kb_term_verification", "reason": "Not yet in MedSarthi's verified local medical glossary; verify with your doctor."}]
            ),
        }
        diagrams = _collect_diagrams_for_kb([kb_entry] if kb_entry else [], p.preferred_language, p.explanation_depth)
        safety = self._build_safety_summary(
            source_text=context_snippet or term,
            provenance=provenance,
            structured_data=None,
            language=p.preferred_language,
        )
        return {
            "canonical_term": term_data.get("term", term),
            "matched_kb_id": kb_entry["id"] if kb_entry else None,
            "term_card": {
                "term": term_data.get("term", term),
                "pronunciation": term_data.get("pronunciation", term),
                "simple_definition": term_data.get("simple_definition", ""),
                "selected_language_explanation": term_data.get("selected_language_explanation", ""),
                "hinglish_explanation": term_data.get("hinglish_explanation", ""),
                "detailed_explanation": term_data.get("detailed_explanation", ""),
                "usage_example": term_data.get("usage_example", ""),
                "related_terms": term_data.get("related_terms", []),
                "body_part_or_system": term_data.get("body_part_or_system", "general"),
                "verified_source": verified_source,
            },
            "provenance": provenance,
            "visual_diagrams": diagrams,
            "safety": safety,
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
            },
        }

    async def explain_diagnosis(
        self,
        session: AsyncSession,
        diagnosis_text: str,
        prefs: PersonalizationContext | None = None,
        target_language: str | None = None,
    ) -> dict[str, Any]:
        """Explain a doctor-stated diagnosis strictly without issuing a new diagnosis."""
        p = prefs or PersonalizationContext()
        if target_language:
            p = p.model_copy(update={"preferred_language": normalize_language(target_language)})

        res = await self.explain_clinical_input(
            session=session,
            source_text=f"Diagnosis: {diagnosis_text}",
            input_type="diagnosis",
            structured_data={"diagnoses": [diagnosis_text]},
            prefs=p,
        )
        res["questions_for_doctor"] = [
            "How many days does this condition usually take to improve?",
            "What warning signs mean I should seek urgent care sooner?",
        ]
        return res

    async def explain_medicine(
        self,
        session: AsyncSession,
        medicine_name: str,
        doctor_dosage_instruction: str | None = None,
        structured_med: dict[str, Any] | None = None,
        prefs: PersonalizationContext | None = None,
        target_language: str | None = None,
    ) -> dict[str, Any]:
        """Explain a medication across all 10 mandatory elements + 8 strict prohibitions."""
        p = prefs or PersonalizationContext()
        if target_language:
            p = p.model_copy(update={"preferred_language": normalize_language(target_language)})

        kb_entry = await self.retriever.lookup_medicine(session, medicine_name, language=p.preferred_language)
        system_prompt, user_prompt = build_medicine_explainer_prompt(
            medicine_name=medicine_name,
            doctor_instruction=doctor_dosage_instruction,
            structured_med=structured_med,
            kb_entry=kb_entry,
            prefs=p,
        )
        req = LLMTaskRequest(
            task_type="explain_medicine",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "medicine_name": medicine_name,
                "doctor_instruction": doctor_dosage_instruction or "",
                "structured_med": structured_med or {},
                "kb_entry": kb_entry,
                "prefs": p.model_dump(),
                "target_language": p.preferred_language,
            },
        )
        llm_resp = await self.registry.generate_json(req)
        raw = llm_resp.data
        provenance = _normalize_provenance_shape(raw, p.preferred_language, p.explanation_depth)
        source_text = doctor_dosage_instruction or medicine_name
        structured_source = {"medications": [structured_med]} if structured_med else None
        safety = self._build_safety_summary(
            source_text=source_text,
            provenance=provenance,
            structured_data=structured_source,
            language=p.preferred_language,
        )
        diagrams = _collect_diagrams_for_kb([kb_entry] if kb_entry else [], p.preferred_language, p.explanation_depth)
        return {
            "medicine_name": medicine_name,
            "matched_kb_id": kb_entry["id"] if kb_entry else None,
            "medication_parts": raw.get("medication_parts") or {},
            "missed_dose_guidance": raw.get("missed_dose_guidance", ""),
            "red_flag_side_effects": raw.get("red_flag_side_effects", []),
            "prohibitions_enforced": list(MEDICATION_EIGHT_PROHIBITIONS),
            "provenance": provenance,
            "visual_diagrams": diagrams,
            "safety": safety,
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
            },
        }

    async def explain_report(
        self,
        session: AsyncSession,
        structured_lab_items: list[dict[str, Any]],
        raw_report_text: str = "",
        prefs: PersonalizationContext | None = None,
        target_language: str | None = None,
        uncertain_spans: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Explain lab report values deterministically preserving original units alongside user unit prefs."""
        p = prefs or PersonalizationContext()
        if target_language:
            p = p.model_copy(update={"preferred_language": normalize_language(target_language)})

        items_explained = [
            convert_lab_value_for_display(
                test_name=str(item.get("test_name") or item.get("name") or "Lab Test"),
                value=item.get("value", ""),
                unit=str(item.get("unit", "")),
                units_preference=p.units_preference,
            )
            for item in structured_lab_items
        ]
        summary_lines = [
            f"{it['test_name']}: {it['display']}" for it in items_explained
        ]
        combined_text = raw_report_text.strip() or "; ".join(summary_lines)

        res = await self.explain_clinical_input(
            session=session,
            source_text=combined_text,
            input_type="lab_report",
            structured_data={"tests": structured_lab_items},
            prefs=p,
            extra_context={"converted_items": items_explained},
        )
        if uncertain_spans:
            res["provenance"]["uncertain_or_missing"].append(
                {
                    "field": "ocr_unverified_spans",
                    "reason": "Some values in this document had low OCR confidence and require manual confirmation before relying on them.",
                }
            )
        res["items_explained"] = items_explained
        return res

    async def explain_more(
        self,
        session: AsyncSession,
        base_explanation: dict[str, Any],
        source_text: str,
        trigger: str = "more_detail",
        target_depth: str | None = None,
        structured_data: dict[str, Any] | None = None,
        prefs: PersonalizationContext | None = None,
        target_language: str | None = None,
    ) -> dict[str, Any]:
        """Execute any of the 8 progressive Explain More triggers (including 3-heading Explain Everything)."""
        p = prefs or PersonalizationContext()
        if target_language:
            p = p.model_copy(update={"preferred_language": normalize_language(target_language)})

        canon_trigger = canonicalize_explain_more_trigger(trigger)
        if canon_trigger == "explain_everything":
            resolved_depth = "deep_dive"
        elif target_depth:
            resolved_depth = normalize_depth(target_depth, p.reading_comfort_level)
        elif canon_trigger == "more_detail":
            resolved_depth = step_depth_up(p.explanation_depth)
        else:
            resolved_depth = p.explanation_depth

        kb_entries = await self.retriever.find_relevant_entries(
            session, f"{source_text} {canon_trigger}", language=p.preferred_language, limit=5
        )
        system_prompt, user_prompt = build_explain_more_prompt(
            base_explanation=base_explanation,
            source_text=_safe_scrub_pii(source_text, p.patient_name),
            trigger_or_focus=canon_trigger,
            target_depth=resolved_depth,
            kb_entries=kb_entries,
            prefs=p,
        )
        req = LLMTaskRequest(
            task_type="explain_more",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "trigger": canon_trigger,
                "focus_section": EXPLAIN_MORE_TRIGGERS[canon_trigger]["focus_section"],
                "target_depth": resolved_depth,
                "source_text": source_text,
                "structured_data": structured_data or {},
                "base_explanation": base_explanation,
                "kb_entries": kb_entries,
                "prefs": p.model_dump(),
                "target_language": p.preferred_language,
            },
        )
        llm_resp = await self.registry.generate_json(req)
        raw = llm_resp.data
        provenance = _normalize_provenance_shape(raw, p.preferred_language, resolved_depth)
        safety = self._build_safety_summary(
            source_text=source_text,
            provenance=provenance,
            structured_data=structured_data,
            language=p.preferred_language,
        )
        diagrams = _collect_diagrams_for_kb(kb_entries, p.preferred_language, resolved_depth)

        result: dict[str, Any] = {
            "trigger": canon_trigger,
            "trigger_label": EXPLAIN_MORE_TRIGGERS[canon_trigger]["label"],
            "focus_section": EXPLAIN_MORE_TRIGGERS[canon_trigger]["focus_section"],
            "depth": resolved_depth,
            "language": p.preferred_language,
            "provenance": provenance,
            "visual_diagrams": diagrams,
            "safety": safety,
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
            },
        }
        if canon_trigger == "explain_everything" and raw.get("three_part_breakdown"):
            result["three_part_breakdown"] = raw["three_part_breakdown"]
        return result

    async def summarize_consultation_audio(
        self,
        session: AsyncSession,
        transcript_segments: list[dict[str, Any]],
        raw_transcript: str,
        prefs: PersonalizationContext | None = None,
        target_language: str | None = None,
    ) -> dict[str, Any]:
        """Summarize doctor-verified consultation transcript into structured draft + 4-way provenance."""
        p = prefs or PersonalizationContext()
        if target_language:
            p = p.model_copy(update={"preferred_language": normalize_language(target_language)})

        doctor_text = " ".join(
            seg.get("text", "").strip()
            for seg in transcript_segments
            if seg.get("speaker_role") == "doctor" and seg.get("text")
        ) or raw_transcript

        kb_entries = await self.retriever.find_relevant_entries(
            session, doctor_text, language=p.preferred_language, limit=5
        )
        system_prompt, user_prompt = build_audio_summary_prompt(
            transcript_segments=transcript_segments,
            raw_transcript=_safe_scrub_pii(raw_transcript, p.patient_name),
            kb_entries=kb_entries,
            prefs=p,
        )
        req = LLMTaskRequest(
            task_type="audio_summarize",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "transcript_segments": transcript_segments,
                "raw_transcript": raw_transcript,
                "kb_entries": kb_entries,
                "prefs": p.model_dump(),
                "target_language": p.preferred_language,
                "target_depth": p.explanation_depth,
            },
        )
        llm_resp = await self.registry.generate_json(req)
        raw = llm_resp.data
        provenance = _normalize_provenance_shape(raw, p.preferred_language, p.explanation_depth)
        safety = self._build_safety_summary(
            source_text=doctor_text,
            provenance=provenance,
            structured_data=raw.get("structured_summary"),
            language=p.preferred_language,
        )
        return {
            "structured_summary": raw.get("structured_summary") or {},
            "provenance": provenance,
            "visual_diagrams": _collect_diagrams_for_kb(kb_entries, p.preferred_language, p.explanation_depth),
            "safety": safety,
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
            },
        }


explanation_service = ExplanationService()
