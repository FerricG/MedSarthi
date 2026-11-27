"""Consultation-scoped multilingual Q&A chat service with emergency & intent guardrails."""

from __future__ import annotations

import asyncio
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.ai.base import LLMTaskRequest, PersonalizationContext, normalize_depth, normalize_language
from app.services.ai.explanation_service import (
    DEFAULT_DISCLAIMER,
    _flatten_provenance_text,
    _normalize_provenance_shape,
    _safe_check_integrity,
    _safe_detect_emergency,
    _safe_scrub_pii,
    _safe_validate_provenance,
)
from app.services.ai.prompts import build_chat_qa_prompt
from app.services.ai.registry import ProviderRegistry, get_provider_registry
from app.services.knowledge.retriever import KnowledgeRetriever, knowledge_retriever
from app.services.research.research_service import trusted_research_service
from app.services.visual.decision_engine import visual_decision_engine
from app.services.visual.visual_engine import visual_intelligence_engine
from app.services.visual.visual_templates import get_template_for_query

_DEPTH_ORDER = ("very_simple", "simple", "detailed", "deep_dive")


def _safe_classify_intent(message: str) -> dict[str, Any]:
    try:
        from app.services.safety.provenance_validator import classify_user_intent

        return classify_user_intent(message)
    except Exception:
        return {
            "intent": "allowed_communication",
            "is_prohibited": False,
            "matched_rules": [],
            "matched_triggers": [],
            "policy_action": "allow",
            "safe_refusal_guidance": None,
        }


def _step_depth_down(current_depth: str) -> str:
    norm = normalize_depth(current_depth)
    idx = _DEPTH_ORDER.index(norm)
    return _DEPTH_ORDER[max(idx - 1, 0)]


def _extract_consult_dict(consultation: Any | None) -> dict[str, Any] | None:
    if consultation is None:
        return None
    if isinstance(consultation, dict):
        return dict(consultation)
    return {
        "id": str(getattr(consultation, "id", "")),
        "title": getattr(consultation, "title", ""),
        "original_doctor_input": getattr(consultation, "original_doctor_input", ""),
        "structured_data": getattr(consultation, "structured_data", {}) or {},
        "approval_status": getattr(consultation, "approval_status", "approved"),
        "sharing_status": getattr(consultation, "sharing_status", "shared_with_patient"),
    }


def _extract_doc_dict(document: Any | None) -> dict[str, Any] | None:
    if document is None:
        return None
    if isinstance(document, dict):
        return dict(document)
    return {
        "id": str(getattr(document, "id", "")),
        "document_type": getattr(document, "document_type", "other"),
        "original_filename": getattr(document, "original_filename", ""),
        "ocr_raw_text": getattr(document, "ocr_raw_text", "") or "",
        "ocr_structured_fields": getattr(document, "ocr_structured_fields", {}) or {},
        "verification_status": getattr(document, "verification_status", "unverified"),
    }


class ChatService:
    """Consultation-scoped Q&A service enforcing voice gate, emergency first, intent policy, and provenance."""

    def __init__(
        self,
        registry: ProviderRegistry | None = None,
        retriever: KnowledgeRetriever | None = None,
    ) -> None:
        self.registry = registry or get_provider_registry()
        self.retriever = retriever or knowledge_retriever

    async def answer_patient_question(
        self,
        session: AsyncSession,
        message_text: str,
        prefs: PersonalizationContext | None = None,
        consultation: Any | None = None,
        document: Any | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        input_modality: str = "text",
        stt_confirmed: bool = True,
        target_language: str | None = None,
        research_mode: str = "normal",
        generate_visual: bool | None = None,
    ) -> dict[str, Any]:
        """Process a patient Q&A turn strictly scoped to shared clinical records & verified KB."""
        p = prefs or PersonalizationContext()
        if target_language:
            p = p.model_copy(update={"preferred_language": normalize_language(target_language)})

        # Step 1: Voice STT Confirmation Gate
        if input_modality == "voice" and not stt_confirmed:
            return {
                "requires_stt_confirmation": True,
                "transcript_to_confirm": message_text,
                "provenance": {
                    "doctor_provided": [],
                    "ai_simplified": {
                        "summary": "Please confirm that this voice transcript matches what you said before I answer.",
                        "steps": [],
                        "reading_level": p.explanation_depth,
                        "language": p.preferred_language,
                    },
                    "general_education": [],
                    "uncertain_or_missing": [
                        {"field": "voice_transcript_confirmation", "reason": "Awaiting patient confirmation of transcribed voice query."}
                    ],
                },
                "context_refs": [],
                "citations": [],
                "emergency_flag": False,
                "emergency_guidance": None,
                "safety": {"integrity_status": "passed", "disclaimer": DEFAULT_DISCLAIMER},
                "suggested_followups": [],
            }

        # Step 2: Pre-LLM Emergency Red-Flag Detector (immediate escalation)
        emergency = _safe_detect_emergency(message_text, context_mode="patient_query")
        if emergency.get("is_emergency"):
            guidance_map = emergency.get("guidance") or {}
            guidance_text = (
                guidance_map.get(p.preferred_language)
                or guidance_map.get("en")
                or "Call 112 or 108 immediately or go to the nearest hospital emergency room."
            )
            return {
                "requires_stt_confirmation": False,
                "provenance": {
                    "doctor_provided": [],
                    "ai_simplified": {
                        "summary": guidance_text,
                        "steps": [
                            "Call 112 or 108 immediately or visit the nearest hospital emergency department.",
                        ],
                        "reading_level": "very_simple",
                        "language": p.preferred_language,
                    },
                    "general_education": [],
                    "uncertain_or_missing": [],
                },
                "context_refs": [],
                "citations": [],
                "emergency_flag": True,
                "emergency_guidance": emergency,
                "safety": {
                    "integrity_status": "passed",
                    "emergency_flag": True,
                    "disclaimer": DEFAULT_DISCLAIMER,
                },
                "suggested_followups": [],
            }

        # Step 3: Scope Consultation / Document Context (never leak private drafts)
        consult_ctx = _extract_consult_dict(consultation)
        if consult_ctx and consult_ctx.get("sharing_status") == "private_draft":
            consult_ctx = None
        doc_ctx = _extract_doc_dict(document)

        # Step 4: Intent Policy Router
        intent_info = _safe_classify_intent(message_text)
        if intent_info.get("intent") == "prompt_injection":
            refusal_map = intent_info.get("safe_refusal_guidance") or {}
            refusal_text = (
                refusal_map.get(p.preferred_language)
                or refusal_map.get("en")
                or "MedSarthi follows strict clinical safety boundaries and cannot override safety rules."
            )
            return {
                "requires_stt_confirmation": False,
                "provenance": {
                    "doctor_provided": [],
                    "ai_simplified": {
                        "summary": refusal_text,
                        "steps": [],
                        "reading_level": p.explanation_depth,
                        "language": p.preferred_language,
                    },
                    "general_education": [],
                    "uncertain_or_missing": [
                        {"field": "safety_boundary", "reason": "Request contained an unsafe instruction override attempt."}
                    ],
                },
                "context_refs": [],
                "citations": [],
                "emergency_flag": False,
                "emergency_guidance": None,
                "intent_classification": intent_info,
                "safety": {"integrity_status": "passed", "disclaimer": DEFAULT_DISCLAIMER},
                "suggested_followups": [],
            }

        # Handle iterative "Explain simpler" request
        effective_depth = p.explanation_depth
        if any(kw in message_text.lower() for kw in ("simpler", "explain simpler", "more simply", "aasaan", "सरल")):
            effective_depth = _step_depth_down(p.explanation_depth)
            p = p.model_copy(update={"explanation_depth": effective_depth})

        # Step 5: KB Retrieval across question + consultation + document
        combined_query = " ".join(
            part
            for part in (
                message_text,
                consult_ctx.get("original_doctor_input", "") if consult_ctx else "",
                doc_ctx.get("ocr_raw_text", "") if doc_ctx else "",
            )
            if part
        )
        kb_entries = await self.retriever.find_relevant_entries(
            session, combined_query, language=p.preferred_language, limit=5
        )

        # Track strict context references
        context_refs: list[dict[str, str]] = []
        if consult_ctx:
            context_refs.append(
                {
                    "ref_type": "consultation",
                    "ref_id": consult_ctx["id"],
                    "excerpt": (consult_ctx.get("original_doctor_input") or "")[:200],
                }
            )
        if doc_ctx:
            context_refs.append(
                {
                    "ref_type": "document",
                    "ref_id": doc_ctx["id"],
                    "excerpt": (doc_ctx.get("ocr_raw_text") or "")[:200],
                }
            )
        for entry in kb_entries:
            context_refs.append(
                {
                    "ref_type": "kb_entry",
                    "ref_id": entry["id"],
                    "excerpt": f"{entry['canonical_name']} ({entry['source_name']})",
                }
            )

        # Step 5b: Trusted Web Research (if requested)
        research_meta: dict[str, Any] | None = None
        research_context: list[dict[str, Any]] | None = None
        if research_mode in ("web_research", "deep_research"):
            try:
                research_res = await trusted_research_service.execute_research(
                    query=message_text,
                    mode=research_mode,
                    language=p.preferred_language,
                )
                research_meta = research_res
                research_context = research_res.get("citations", [])
            except Exception as res_err:
                research_meta = {"error": str(res_err), "citations": []}
                research_context = []

        # Determine whether visual explanation would enhance the answer
        q_lower = message_text.lower()
        visual_keywords = (
            "diagram", "visual", "draw", "picture", "anatomy", "chart", "graph",
            "heart", "lung", "brain", "kidney", "eye", "cell", "dna", "circulat",
            "mechanism", "flowchart", "physics", "optic", "ray", "circuit",
            "wave", "differentiat", "integrat", "structure", "pathway", "blood pressure"
        )
        suggest_visual = bool(generate_visual) or any(kw in q_lower for kw in visual_keywords)

        # Scrub PII before building prompt
        scrubbed_question = _safe_scrub_pii(message_text, p.patient_name)
        scrubbed_consult = None
        if consult_ctx:
            scrubbed_consult = {
                **consult_ctx,
                "original_doctor_input": _safe_scrub_pii(
                    consult_ctx.get("original_doctor_input", ""), p.patient_name
                ),
            }

        system_prompt, user_prompt = build_chat_qa_prompt(
            user_question=scrubbed_question,
            conversation_history=conversation_history or [],
            consultation_context=scrubbed_consult,
            document_context=doc_ctx,
            kb_entries=kb_entries,
            intent_classification=intent_info,
            prefs=p,
            research_context=research_context,
            suggest_visual=suggest_visual,
        )
        req = LLMTaskRequest(
            task_type="chat",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            payload={
                "user_question": message_text,
                "conversation_history": conversation_history or [],
                "consultation_context": consult_ctx or {},
                "document_context": doc_ctx or {},
                "kb_entries": kb_entries,
                "intent_classification": intent_info,
                "prefs": p.model_dump(),
                "target_language": p.preferred_language,
                "target_depth": effective_depth,
                "research_mode": research_mode,
                "suggest_visual": suggest_visual,
            },
        )
        llm_resp = await self.registry.generate_json(req)
        provenance = _normalize_provenance_shape(llm_resp.data, p.preferred_language, effective_depth)

        # Step 6: Visual Intelligence Decision Engine
        visual_artifact: dict[str, Any] | None = None
        llm_visual_spec = llm_resp.data.get("visual_spec")
        is_visual_needed, decision_reason = visual_decision_engine.should_generate_visual(
            query=message_text,
            explicit_user_flag=generate_visual,
            llm_spec=llm_visual_spec,
        )

        visual_spec: dict[str, Any] | None = None
        if is_visual_needed:
            if llm_visual_spec and isinstance(llm_visual_spec, dict) and llm_visual_spec.get("script"):
                visual_spec = llm_visual_spec
            else:
                visual_spec = get_template_for_query(message_text)

        if is_visual_needed and visual_spec and isinstance(visual_spec, dict) and visual_spec.get("script"):
            try:
                visual_artifact = await visual_intelligence_engine.render_visual(visual_spec)
            except Exception as v_err:
                visual_artifact = {
                    "success": False,
                    "title": visual_spec.get("title", "Visual Explanation"),
                    "error_message": str(v_err),
                    "visual_url": None,
                }

        # Step 7: Deterministic Integrity & Guardrail Check
        source_text = (
            consult_ctx.get("original_doctor_input", "") if consult_ctx else ""
        ) or (doc_ctx.get("ocr_raw_text", "") if doc_ctx else "")
        structured_src = consult_ctx.get("structured_data") if consult_ctx else None

        output_text = _flatten_provenance_text(provenance)
        integrity = (
            _safe_check_integrity(
                source_text=source_text,
                output_text=output_text,
                structured_source=structured_src,
                output_language=p.preferred_language,
            )
            if source_text.strip()
            else {"status": "passed", "risk_level": "low", "mismatches": []}
        )
        guardrail = _safe_validate_provenance(
            {"provenance": provenance, "safety": {"disclaimer": DEFAULT_DISCLAIMER}}
        )

        # Genuine Citations: prioritize actual research results, then relevant KB entries
        citations: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        if research_context:
            for s in research_context:
                url = s.get("source_url") or s.get("url") or ""
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    citations.append({
                        "source_name": s.get("title") or s.get("source_name") or s.get("domain", "Trusted Research Source"),
                        "source_url": url,
                        "domain": s.get("domain", "Web Research"),
                        "trusted": s.get("trusted", True),
                    })

        # Include KB entries only if relevant to the question or answer
        combined_text = (message_text + " " + output_text).lower()
        for entry in kb_entries:
            canon = (entry.get("canonical_name") or "").lower()
            slug = (entry.get("slug") or "").lower()
            if canon in combined_text or slug in combined_text or not research_context:
                url = entry.get("source_url") or ""
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    citations.append({
                        "source_name": entry.get("source_name") or entry.get("canonical_name"),
                        "source_url": url,
                        "domain": "Clinical KB",
                        "trusted": True,
                    })

        suggested_followups = llm_resp.data.get("suggested_followups") or [
            "Explain it more simply",
            "Why did this happen?",
            "Listen to this answer",
        ]

        if visual_artifact:
            provenance["visual_artifact"] = visual_artifact
        if research_meta:
            provenance["research_meta"] = research_meta

        return {
            "requires_stt_confirmation": False,
            "provenance": provenance,
            "context_refs": context_refs,
            "citations": citations,
            "visual_artifact": visual_artifact,
            "research_meta": research_meta,
            "emergency_flag": False,
            "emergency_guidance": None,
            "intent_classification": intent_info,
            "safety": {
                "integrity_status": integrity.get("status", "passed"),
                "integrity_report": integrity,
                "guardrail_check": guardrail,
                "disclaimer": DEFAULT_DISCLAIMER,
            },
            "suggested_followups": suggested_followups,
            "provider_meta": {
                "provider_name": llm_resp.provider_name,
                "model_name": llm_resp.model_name,
                "is_demo_fallback": llm_resp.is_demo_fallback,
            },
        }


chat_service = ChatService()
