"""Medical explanation, term/diagnosis/medicine/report, Explain More, and translation routes."""

from __future__ import annotations

from typing import Any
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user, get_db
from app.core.exceptions import AppError
from app.models.auth import User
from app.models.clinical import MedicalDocument
from app.routes._helpers import (
    build_personalization_context,
    check_consultation_access,
    check_document_access,
    extract_visuals_and_terms,
    format_emergency_guidance,
    format_integrity_and_safety,
    get_patient_profile_for_user,
    serialize_kb_term,
)
from app.schemas.clinical import (
    ExplainDiagnosisRequest,
    ExplainMedicineRequest,
    ExplainMoreRequest,
    ExplainReportRequest,
    ExplainRequest,
    ExplainTermRequest,
    TranslateRequest,
)
from app.schemas.common import ok_envelope
from app.services.ai.base import normalize_depth, normalize_language
from app.services.ai.explanation_service import (
    DEFAULT_DISCLAIMER,
    _flatten_provenance_text,
    explanation_service,
)
from app.services.ai.translation_service import translation_service
from app.services.knowledge.retriever import knowledge_retriever
from app.services.safety import (
    check_instruction_integrity,
    detect_emergency,
    validate_provenance_and_guardrails,
)

router = APIRouter(tags=["explain"])


def _enforce_document_ocr_gate(doc: MedicalDocument) -> str | None:
    """Block unverified low-confidence / unreadable OCR docs from guessing; return optional warning if confirmed."""
    if doc.verification_status == "rejected_unreadable":
        raise AppError(
            409,
            "OCR_VERIFICATION_REQUIRED",
            "This document was marked unreadable and cannot be automatically explained.",
        )
    has_low_conf = (
        doc.processing_status == "needs_verification"
        or (doc.ocr_confidence_score is not None and doc.ocr_confidence_score < 0.75)
        or bool(doc.uncertain_spans)
    )
    if doc.verification_status == "unverified" and has_low_conf:
        raise AppError(
            409,
            "OCR_VERIFICATION_REQUIRED",
            "Low-confidence OCR spans (<0.75) or unreadable tokens must be confirmed before explaining.",
            details={"uncertain_spans": doc.uncertain_spans or []},
        )
    if doc.verification_status == "patient_confirmed" and (doc.uncertain_spans or []):
        return (
            "You confirmed the extracted text from a low-confidence scan. "
            "Please verify numbers and medication names with your doctor."
        )
    return None


async def _resolve_user_prefs(
    db: AsyncSession,
    current_user: User,
    patient_id: str | None = None,
    override_language: str | None = None,
    override_depth: str | None = None,
):
    resolved_pid = patient_id
    if not resolved_pid and current_user.role == "patient":
        profile = await get_patient_profile_for_user(db, current_user, required=False)
        resolved_pid = profile.id if profile else None
    return await build_personalization_context(
        db,
        patient_id=resolved_pid,
        override_language=override_language,
        override_depth=override_depth,
    )


@router.post("/explain")
async def explain_clinical(
    payload: ExplainRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a 4-category provenance explanation for a consultation, document, or raw clinical text."""
    patient_id: str | None = None
    structured_data: dict[str, Any] | None = None
    ocr_warning: str | None = None
    source_text = (payload.raw_text or "").strip()
    is_patient_raw_query = False

    if payload.consultation_id:
        consult = await check_consultation_access(
            db, current_user, payload.consultation_id, require_shared_for_patient=True
        )
        patient_id = consult.patient_id
        source_text = consult.original_doctor_input
        structured_data = consult.structured_data or {}
    elif payload.document_id:
        doc = await check_document_access(db, current_user, payload.document_id)
        ocr_warning = _enforce_document_ocr_gate(doc)
        patient_id = doc.patient_id
        source_text = (doc.ocr_raw_text or source_text).strip()
        structured_data = doc.ocr_structured_fields or {}
    else:
        is_patient_raw_query = True

    if not source_text:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Provide consultation_id, document_id, or non-empty raw_text.",
        )

    prefs = await _resolve_user_prefs(
        db,
        current_user,
        patient_id=patient_id,
        override_language=payload.target_language,
        override_depth=payload.explanation_depth,
    )

    if is_patient_raw_query:
        emerg = detect_emergency(source_text, context_mode="patient_query")
        if emerg.get("is_emergency"):
            guided = format_emergency_guidance(emerg, language=prefs.preferred_language)
            provenance = {
                "doctor_provided": [{"item_type": "user_input", "text": source_text, "source_ref": "raw_text"}],
                "ai_simplified": {
                    "summary": guided["banner_message"],
                    "steps": [
                        "Call 112 or 108 immediately or go to the nearest hospital emergency department."
                    ],
                    "reading_level": "very_simple",
                    "language": prefs.preferred_language,
                },
                "general_education": [],
                "uncertain_or_missing": [],
            }
            integrity, safety = format_integrity_and_safety(
                {
                    "integrity_status": "passed",
                    "integrity_report": {
                        "status": "passed",
                        "rules_evaluated": 13,
                        "mismatches": [],
                        "disclaimer": DEFAULT_DISCLAIMER,
                    },
                    "emergency_flag": True,
                    "emergency_guidance": guided,
                    "disclaimer": DEFAULT_DISCLAIMER,
                }
            )
            return ok_envelope(
                {
                    "explanation_id": f"exp_{uuid.uuid4().hex[:12]}",
                    "provenance": provenance,
                    "safety": safety,
                    "integrity": integrity,
                    "visual_diagrams": [],
                    "highlighted_terms": [],
                    "emergency_flag": True,
                    "emergency_guidance": guided,
                }
            )

    res = await explanation_service.explain_clinical_input(
        session=db,
        source_text=source_text,
        input_type=payload.source_type or "clinical_notes",
        structured_data=structured_data,
        prefs=prefs,
        include_visuals=payload.include_visuals,
    )
    validate_provenance_and_guardrails(
        {"provenance": res["provenance"], "safety": {"disclaimer": DEFAULT_DISCLAIMER}}
    )
    integrity, safety = format_integrity_and_safety(res["safety"])
    _, highlighted_terms = await extract_visuals_and_terms(
        db, source_text, language=prefs.preferred_language, depth=prefs.explanation_depth
    )

    return ok_envelope(
        {
            "explanation_id": f"exp_{uuid.uuid4().hex[:12]}",
            "provenance": res["provenance"],
            "safety": safety,
            "integrity": integrity,
            "visual_diagrams": res["visual_diagrams"],
            "highlighted_terms": highlighted_terms,
            "ocr_warning": ocr_warning,
        }
    )


@router.post("/explain/term")
async def explain_term_route(
    payload: ExplainTermRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explain a medical term with 10 structured fields and verified KB source citations."""
    prefs = await _resolve_user_prefs(
        db,
        current_user,
        override_language=payload.target_language,
        override_depth=payload.depth,
    )
    res = await explanation_service.explain_term(
        session=db,
        term=payload.term,
        context_snippet=payload.context_snippet,
        prefs=prefs,
        target_language=payload.target_language,
        depth=payload.depth,
    )
    kb_row = await knowledge_retriever.lookup_term(
        db, payload.term, language=prefs.preferred_language
    )
    integrity, safety = format_integrity_and_safety(res["safety"])
    return ok_envelope(
        {
            "term": res["canonical_term"],
            "canonical_term": res["canonical_term"],
            "kb_entry": serialize_kb_term(kb_row) if kb_row else None,
            "term_card": res["term_card"],
            "provenance": res["provenance"],
            "visual_diagrams": res["visual_diagrams"],
            "safety": safety,
            "integrity": integrity,
        }
    )


@router.post("/explain/diagnosis")
async def explain_diagnosis_route(
    payload: ExplainDiagnosisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explain a doctor-stated diagnosis strictly without issuing a new diagnosis."""
    patient_id: str | None = None
    if payload.consultation_id:
        consult = await check_consultation_access(
            db, current_user, payload.consultation_id, require_shared_for_patient=True
        )
        patient_id = consult.patient_id

    prefs = await _resolve_user_prefs(
        db,
        current_user,
        patient_id=patient_id,
        override_language=payload.target_language,
    )
    emerg = detect_emergency(payload.diagnosis_text, context_mode="patient_query")
    res = await explanation_service.explain_diagnosis(
        session=db,
        diagnosis_text=payload.diagnosis_text,
        prefs=prefs,
        target_language=payload.target_language,
    )
    integrity, safety = format_integrity_and_safety(res["safety"])
    return ok_envelope(
        {
            "provenance": res["provenance"],
            "visual_diagrams": res["visual_diagrams"],
            "questions_for_doctor": res.get("questions_for_doctor", []),
            "integrity": integrity,
            "safety": safety,
            "emergency_guidance": (
                format_emergency_guidance(emerg, prefs.preferred_language)
                if emerg.get("is_emergency")
                else None
            ),
        }
    )


@router.post("/explain/medicine")
async def explain_medicine_route(
    payload: ExplainMedicineRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explain a medication across 10 mandatory parts while enforcing the 8 strict prohibitions."""
    patient_id: str | None = None
    structured_med: dict[str, Any] | None = None
    locked_instruction = payload.doctor_dosage_instruction

    if payload.consultation_id:
        consult = await check_consultation_access(
            db, current_user, payload.consultation_id, require_shared_for_patient=True
        )
        patient_id = consult.patient_id
        for m in (consult.structured_data or {}).get("medications") or []:
            if not isinstance(m, dict):
                continue
            m_name = str(m.get("name") or m.get("medicine_name") or "").strip()
            if m_name and m_name.lower() == payload.medicine_name.strip().lower():
                structured_med = m
                if not locked_instruction:
                    dose = m.get("dose") or f"{m.get('dosage_value', '')} {m.get('dosage_unit', '')}".strip()
                    freq = m.get("frequency") or m.get("frequency_text") or ""
                    warns = "; ".join(m.get("warnings") or m.get("negations_and_warnings") or [])
                    locked_instruction = " ".join(p for p in [m_name, str(dose), str(freq), warns] if p).strip()
                break

    prefs = await _resolve_user_prefs(
        db,
        current_user,
        patient_id=patient_id,
        override_language=payload.target_language,
    )
    res = await explanation_service.explain_medicine(
        session=db,
        medicine_name=payload.medicine_name,
        doctor_dosage_instruction=locked_instruction,
        structured_med=structured_med,
        prefs=prefs,
        target_language=payload.target_language,
    )
    kb_entry = await knowledge_retriever.lookup_medicine(
        db, payload.medicine_name, language=prefs.preferred_language
    )
    meta = (kb_entry or {}).get("metadata_json") or {}
    parts = res.get("medication_parts") or {}
    citations = (
        [{"source_name": kb_entry["source_name"], "source_url": kb_entry["source_url"]}]
        if kb_entry
        else []
    )
    integrity, safety = format_integrity_and_safety(res["safety"])
    diagrams = res.get("visual_diagrams") or []

    return ok_envelope(
        {
            "medicine_name": res["medicine_name"],
            "locked_doctor_instruction": locked_instruction,
            "drug_class": parts.get("drug_category"),
            "brand_examples": list(meta.get("brand_examples") or []),
            "what_it_is": parts.get("what_it_is"),
            "common_purposes": parts.get("common_uses"),
            "how_it_works": parts.get("general_mechanism"),
            "why_prescribed_for_you": parts.get("prescribed_reason"),
            "common_side_effects": list(parts.get("common_side_effects") or []),
            "serious_warnings": list(parts.get("warnings") or res.get("red_flag_side_effects") or []),
            "precautions": list(parts.get("precautions") or []),
            "food_and_interactions": meta.get("food_and_interactions"),
            "adherence_guidance": parts.get("adherence_importance"),
            "questions_for_doctor": list(parts.get("questions_for_doctor") or []),
            "prohibitions": res.get("prohibitions_enforced", []),
            "prohibitions_enforced": res.get("prohibitions_enforced", []),
            "missed_dose_guidance": res.get("missed_dose_guidance"),
            "red_flag_side_effects": res.get("red_flag_side_effects", []),
            "medication_parts": parts,
            "provenance": res["provenance"],
            "integrity": integrity,
            "safety": safety,
            "citations": citations,
            "diagram": diagrams[0] if diagrams else None,
            "visual_diagrams": diagrams,
        }
    )


@router.post("/explain/report")
async def explain_report_route(
    payload: ExplainReportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explain structured lab values or a verified uploaded medical document."""
    patient_id: str | None = None
    lab_items = list(payload.structured_lab_items or [])
    raw_report_text = (payload.raw_report_text or "").strip()
    uncertain_spans: list[dict[str, Any]] | None = None
    ocr_warning: str | None = None

    if payload.document_id:
        doc = await check_document_access(db, current_user, payload.document_id)
        ocr_warning = _enforce_document_ocr_gate(doc)
        patient_id = doc.patient_id
        if not raw_report_text:
            raw_report_text = doc.ocr_raw_text or ""
        if not lab_items and isinstance(doc.ocr_structured_fields, dict):
            lab_items = list(
                doc.ocr_structured_fields.get("tests")
                or doc.ocr_structured_fields.get("lab_rows")
                or []
            )
        uncertain_spans = doc.uncertain_spans or None

    if not lab_items and not raw_report_text:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Provide document_id, structured_lab_items, or raw_report_text.",
        )

    prefs = await _resolve_user_prefs(
        db,
        current_user,
        patient_id=patient_id,
        override_language=payload.target_language,
    )
    res = await explanation_service.explain_report(
        session=db,
        structured_lab_items=lab_items,
        raw_report_text=raw_report_text,
        prefs=prefs,
        target_language=payload.target_language,
        uncertain_spans=uncertain_spans,
    )
    integrity, safety = format_integrity_and_safety(res["safety"])
    return ok_envelope(
        {
            "document_id": payload.document_id,
            "provenance": res["provenance"],
            "integrity": integrity,
            "safety": safety,
            "visual_diagrams": res["visual_diagrams"],
            "items_explained": res.get("items_explained", []),
            "ocr_warning": ocr_warning,
        }
    )


@router.post("/explain/more")
async def explain_more_route(
    payload: ExplainMoreRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle all 8 progressive Explain More triggers (including 3-heading explain_everything)."""
    patient_id: str | None = None
    base_explanation: dict[str, Any] = {}
    structured_data: dict[str, Any] | None = None
    source_text = (payload.source_text or "").strip()

    if payload.consultation_id:
        consult = await check_consultation_access(
            db, current_user, payload.consultation_id, require_shared_for_patient=True
        )
        patient_id = consult.patient_id
        source_text = source_text or consult.original_doctor_input
        base_explanation = consult.generated_explanation or {}
        structured_data = consult.structured_data or {}
    elif payload.document_id:
        doc = await check_document_access(db, current_user, payload.document_id)
        _enforce_document_ocr_gate(doc)
        patient_id = doc.patient_id
        source_text = source_text or (doc.ocr_raw_text or "")
        structured_data = doc.ocr_structured_fields or {}

    if not source_text and payload.focus_term_or_topic:
        source_text = payload.focus_term_or_topic.strip()
    if not source_text:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Provide consultation_id, document_id, or source_text for Explain More.",
        )

    prefs = await _resolve_user_prefs(
        db,
        current_user,
        patient_id=patient_id,
        override_language=payload.target_language,
        override_depth=payload.target_depth,
    )
    res = await explanation_service.explain_more(
        session=db,
        base_explanation=base_explanation,
        source_text=source_text,
        trigger=payload.trigger,
        target_depth=payload.target_depth,
        structured_data=structured_data,
        prefs=prefs,
        target_language=payload.target_language,
    )
    integrity, safety = format_integrity_and_safety(res["safety"])
    return ok_envelope(
        {
            "trigger": res["trigger"],
            "trigger_label": res["trigger_label"],
            "focus_section": res["focus_section"],
            "depth": res["depth"],
            "language": res["language"],
            "provenance": res["provenance"],
            "three_part_breakdown": res.get("three_part_breakdown"),
            "safety": safety,
            "integrity": integrity,
            "visual_diagrams": res["visual_diagrams"],
        }
    )


@router.post("/translate")
async def translate_clinical(
    payload: TranslateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Translate clinical text or 4-way provenance payload with token-locking & integrity checks."""
    patient_id: str | None = None
    consult = None
    if payload.consultation_id:
        consult = await check_consultation_access(
            db, current_user, payload.consultation_id, require_shared_for_patient=True
        )
        patient_id = consult.patient_id

    prefs = await _resolve_user_prefs(
        db,
        current_user,
        patient_id=patient_id,
        override_language=payload.target_language,
    )
    provenance_input = payload.explanation_payload or (
        consult.generated_explanation if consult and not payload.text else None
    )

    if provenance_input:
        tr = await translation_service.translate_provenance_payload(
            session=db,
            provenance=provenance_input,
            target_language=payload.target_language,
            source_language=payload.source_language,
            mode=payload.mode,
            preserve_english_terms=payload.preserve_english_terms,
            prefs=prefs,
        )
        translated_prov = tr["structured_translation"]
        source_for_check = (
            consult.original_doctor_input
            if consult
            else _flatten_provenance_text(provenance_input)
        )
        output_for_check = _flatten_provenance_text(translated_prov)
        integrity_report = check_instruction_integrity(
            source_text=source_for_check,
            output_text=output_for_check,
            structured_source=consult.structured_data if consult else None,
            output_language=normalize_language(payload.target_language),
        )
        guardrail = validate_provenance_and_guardrails(
            {"provenance": translated_prov, "safety": {"disclaimer": DEFAULT_DISCLAIMER}}
        )
        status = integrity_report["status"]
        if not guardrail["is_valid"] and status == "passed":
            status = "warning"
        integrity, safety = format_integrity_and_safety(
            {
                "integrity_status": status,
                "integrity_report": integrity_report,
                "guardrail_check": guardrail,
                "disclaimer": DEFAULT_DISCLAIMER,
            }
        )
        return ok_envelope(
            {
                "translated_text": tr["translated_text"],
                "translated_provenance": translated_prov,
                "provenance": translated_prov,
                "source_language": tr["source_language"],
                "target_language": tr["target_language"],
                "mode": tr["mode"],
                "preserved_terms": tr["preserved_terms"],
                "safety": safety,
                "integrity": integrity,
            }
        )

    raw_text = (payload.text or (consult.original_doctor_input if consult else "")).strip()
    if not raw_text:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Provide text, explanation_payload, or consultation_id to translate.",
        )

    tr_text = await translation_service.translate_text(
        session=db,
        text=raw_text,
        target_language=payload.target_language,
        source_language=payload.source_language,
        mode=payload.mode,
        preserve_english_terms=payload.preserve_english_terms,
        prefs=prefs,
    )
    integrity, safety = format_integrity_and_safety(tr_text["safety"])
    return ok_envelope(
        {
            "translated_text": tr_text["translated_text"],
            "source_language": tr_text["source_language"],
            "target_language": tr_text["target_language"],
            "mode": tr_text["mode"],
            "preserved_terms": tr_text["preserved_terms"],
            "safety": safety,
            "integrity": integrity,
        }
    )
