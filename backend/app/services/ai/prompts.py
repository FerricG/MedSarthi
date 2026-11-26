"""Dedicated, versioned prompt templates for all MedSarthi clinical communication tasks."""

from __future__ import annotations

import json
from typing import Any
from app.services.ai.base import PersonalizationContext

PROMPT_TEMPLATES: dict[str, dict[str, str]] = {
    "explain_v1": {
        "name": "Medical Explanation & Simplification",
        "version": "1.0.0",
        "purpose": "Convert clinical inputs into 4-category provenance JSON tailored to patient preferences.",
    },
    "translate_v1": {
        "name": "Token-Locked Multilingual Translation",
        "version": "1.0.0",
        "purpose": "Translate across en/hi/hi-Latn in 4 modes preserving locked meds, doses, units, and negations.",
    },
    "term_v1": {
        "name": "Medical Term Explainer (10 Fields)",
        "version": "1.0.0",
        "purpose": "Explain medical terminology grounded in verified KB entries across 10 structured fields.",
    },
    "medicine_v1": {
        "name": "Medication Explainer (10 Parts + 8 Prohibitions)",
        "version": "1.0.0",
        "purpose": "Explain prescribed medications safely without diagnosing, prescribing, or changing doses.",
    },
    "explain_more_v1": {
        "name": "Progressive Explain More (8 Triggers + 3-Part Breakdown)",
        "version": "1.0.0",
        "purpose": "Expand specific facets or deliver 3-heading Explain Everything breakdown.",
    },
    "audio_summary_v1": {
        "name": "Consultation Audio Summarization",
        "version": "1.0.0",
        "purpose": "Summarize doctor-verified consultation transcripts into structured facts and 4-way provenance.",
    },
    "chat_v1": {
        "name": "Consultation-Scoped Q&A Chat",
        "version": "1.0.0",
        "purpose": "Answer patient questions grounded strictly in shared records and verified KB citations.",
    },
}

EXPLAIN_MORE_TRIGGERS: dict[str, dict[str, str]] = {
    "word_meaning": {
        "label": "What does this word mean?",
        "focus_section": "word_meaning",
        "instruction": "Define unfamiliar medical terms clearly using verified KB definitions and plain examples.",
    },
    "causes_mechanism": {
        "label": "Why did this happen?",
        "focus_section": "causes_mechanism",
        "instruction": (
            "Explain general pathophysiology and common causes in general_education with verified citations. "
            "Never assume a personal cause unless explicitly written in the doctor's input."
        ),
    },
    "organ_function": {
        "label": "What does this part of the body do?",
        "focus_section": "organ_function",
        "instruction": "Explain the affected body system/organ in plain language and attach curated diagram references.",
    },
    "test_purpose": {
        "label": "Why did the doctor order this test?",
        "focus_section": "test_purpose",
        "instruction": (
            "State the doctor's documented reason if recorded; otherwise state general diagnostic purposes in "
            "general_education and note patient-specific test intent as uncertain_or_missing."
        ),
    },
    "medicine_purpose": {
        "label": "Why did the doctor give this medicine?",
        "focus_section": "medicine_purpose",
        "instruction": (
            "NEVER invent a personal indication. Keep documented indication in doctor_provided, general class uses "
            "in general_education, and any unstated specific reason in uncertain_or_missing."
        ),
    },
    "common_symptoms": {
        "label": "What are common symptoms?",
        "focus_section": "common_symptoms",
        "instruction": (
            "List general symptoms from verified KB in general_education, clarify the patient may not experience all "
            "of them, and compare against what the doctor actually recorded."
        ),
    },
    "more_detail": {
        "label": "Explain in more detail",
        "focus_section": "more_detail",
        "instruction": "Step up explanation depth one tier while keeping every dose, unit, number, and negation identical.",
    },
    "explain_everything": {
        "label": "Explain everything",
        "focus_section": "all",
        "instruction": (
            "Provide the mandatory 3-heading comprehensive breakdown: "
            "1. What Your Doctor Provided, 2. General Medical Knowledge (with citations and non-diagnosis notice), "
            "3. What Is Unknown About You Specifically (plus questions for doctor)."
        ),
    },
}

_TRIGGER_ALIAS_MAP: dict[str, str] = {
    "what does this word mean?": "word_meaning",
    "what does this word mean": "word_meaning",
    "word_meaning": "word_meaning",
    "why did this happen?": "causes_mechanism",
    "why did this happen": "causes_mechanism",
    "why does this happen?": "causes_mechanism",
    "why does this happen": "causes_mechanism",
    "causes_mechanism": "causes_mechanism",
    "what does this part of the body do?": "organ_function",
    "what does this part of the body do": "organ_function",
    "organ_function": "organ_function",
    "why did the doctor order this test?": "test_purpose",
    "why did the doctor order this test": "test_purpose",
    "test_purpose": "test_purpose",
    "why did the doctor give this medicine?": "medicine_purpose",
    "why did the doctor give this medicine": "medicine_purpose",
    "medicine_purpose": "medicine_purpose",
    "what are common symptoms?": "common_symptoms",
    "what are common symptoms": "common_symptoms",
    "common_symptoms": "common_symptoms",
    "explain in more detail": "more_detail",
    "more_detail": "more_detail",
    "explain everything": "explain_everything",
    "explain_everything": "explain_everything",
    "all": "explain_everything",
}

MEDICATION_EIGHT_PROHIBITIONS: tuple[str, ...] = (
    "NEVER prescribe or recommend a new medicine.",
    "NEVER suggest starting an unprescribed or over-the-counter (OTC) drug.",
    "NEVER increase, decrease, or modify a prescribed dosage.",
    "NEVER alter prescribed dosing frequency.",
    "NEVER extend or shorten prescribed duration.",
    "NEVER advise stopping a prescribed medicine on the patient's own.",
    "NEVER suggest substituting another brand or chemical alternative.",
    "NEVER infer or state as fact why the doctor prescribed a medicine when the doctor's record is silent.",
)

_DEPTH_GUIDELINES: dict[str, str] = {
    "very_simple": "60-110 words, very short everyday sentences (<=12 words each), concrete action steps, minimal jargon.",
    "simple": "110-180 words, clear everyday language, basic mechanism, practical safety instructions.",
    "detailed": "180-300 words, structured explanation of anatomy/mechanism, test rationale, precautions, and citations.",
    "deep_dive": "300-500 words, thorough educational breakdown of mechanism, timeline, clinician considerations, and unknowns.",
}

_STYLE_GUIDELINES: dict[str, str] = {
    "conversational": "Warm, supportive second-person phrasing ('you', 'your doctor').",
    "straightforward": "Concise, direct, neutral factual statements without conversational filler.",
    "calm_reassuring": "Steady, non-alarming tone; NEVER use false reassurance like 'don't worry' or 'nothing serious'.",
    "structured": "Clearly grouped sections and concise labeled bullets.",
    "step_by_step": "Numbered sequential action checklist for what to do next.",
}

_LANGUAGE_GUIDELINES: dict[str, str] = {
    "en": "Respond in clear English.",
    "hi": "Respond in natural, respectful Hindi using Devanagari script (हिंदी), keeping medicine names and numbers exact.",
    "hi-Latn": "Respond in natural, everyday Romanized Hinglish (mixed Hindi-English in Latin script), keeping medicine names and numbers exact.",
}

_TERMINOLOGY_GUIDELINES: dict[str, str] = {
    "plain_only": "Use plain everyday words for conditions/tests, while keeping exact prescribed drug names untouched.",
    "plain_plus_medical": "Use plain words followed by the medical term in parentheses, e.g., 'high blood pressure (Hypertension)'.",
    "medical_with_definitions": "Retain clinical terms and attach brief inline definitions.",
}


def canonicalize_explain_more_trigger(trigger: str | None) -> str:
    """Normalize any Explain More UI label or focus_section into one of the 8 canonical keys."""
    if not trigger:
        return "more_detail"
    key = trigger.strip().lower()
    return _TRIGGER_ALIAS_MAP.get(key, key if key in EXPLAIN_MORE_TRIGGERS else "more_detail")


def _personalization_block(prefs: PersonalizationContext) -> str:
    lang_rule = _LANGUAGE_GUIDELINES.get(prefs.preferred_language, _LANGUAGE_GUIDELINES["en"])
    depth_rule = _DEPTH_GUIDELINES.get(prefs.explanation_depth, _DEPTH_GUIDELINES["simple"])
    style_rule = _STYLE_GUIDELINES.get(prefs.explanation_style, _STYLE_GUIDELINES["calm_reassuring"])
    term_rule = _TERMINOLOGY_GUIDELINES.get(
        prefs.terminology_preference, _TERMINOLOGY_GUIDELINES["plain_plus_medical"]
    )
    return (
        f"Language: {prefs.preferred_language} — {lang_rule}\n"
        f"Reading Comfort Level: {prefs.reading_comfort_level}\n"
        f"Explanation Depth: {prefs.explanation_depth} — {depth_rule}\n"
        f"Explanation Style: {prefs.explanation_style} — {style_rule}\n"
        f"Terminology Preference: {prefs.terminology_preference} — {term_rule}\n"
        f"Units Preference: {prefs.units_preference} (ALWAYS keep the original unit/number verbatim alongside any converted value).\n"
        f"Patient Name (use at most once if helpful, never tie literacy to age): {prefs.patient_name or 'Patient'}"
    )


def _kb_context_block(kb_entries: list[dict[str, Any]]) -> str:
    if not kb_entries:
        return "No matching verified KB entries retrieved. Do NOT invent citation URLs."
    compact = [
        {
            "canonical_name": e.get("canonical_name"),
            "entry_type": e.get("entry_type"),
            "simple_en": e.get("simple_en"),
            "detailed_en": e.get("detailed_en"),
            "localized_simple": e.get("localized_simple"),
            "source_name": e.get("source_name"),
            "source_url": e.get("source_url"),
            "metadata": e.get("metadata_json"),
        }
        for e in kb_entries[:5]
    ]
    return json.dumps(compact, ensure_ascii=False)


def build_explanation_prompt(
    input_type: str,
    source_text: str,
    structured_data: dict[str, Any] | None,
    kb_entries: list[dict[str, Any]],
    prefs: PersonalizationContext,
    include_visuals: bool = True,
    extra_context: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Template (a): Medical Explanation & Simplification prompt."""
    system_prompt = (
        "You are MedSarthi's clinical communication assistant (NOT a diagnostic or prescribing tool).\n"
        "STRICT RULES:\n"
        "1. NEVER diagnose a condition, prescribe/suggest a medicine, or change dosages, units, frequencies, durations, routes, lab values, or negations.\n"
        "2. Separate every output strictly into 4 JSON keys:\n"
        "   - doctor_provided: list of {item_type, text, source_ref} strictly from the doctor's/document's input.\n"
        "   - ai_simplified: {summary, steps[], reading_level, language} tailored to the patient settings.\n"
        "   - general_education: list of {topic, text, source_name, source_url, diagram_id?} using ONLY the supplied verified KB entries.\n"
        "   - uncertain_or_missing: list of {field, reason} for anything omitted, ambiguous, or unverified.\n"
        "3. Never use false reassurance ('don't worry', 'nothing serious', 'completely harmless').\n"
        "4. Return valid JSON ONLY matching those exact keys."
    )
    user_prompt = (
        f"[Prompt: explain_v1 | InputType: {input_type} | IncludeVisuals: {include_visuals}]\n"
        f"PERSONALIZATION:\n{_personalization_block(prefs)}\n\n"
        f"SOURCE TEXT (IMMUTABLE):\n{source_text}\n\n"
        f"STRUCTURED DATA:\n{json.dumps(structured_data or {}, ensure_ascii=False)}\n\n"
        f"VERIFIED KB ENTRIES:\n{_kb_context_block(kb_entries)}\n\n"
        f"EXTRA CONTEXT:\n{json.dumps(extra_context or {}, ensure_ascii=False)}"
    )
    return system_prompt, user_prompt


def build_translation_prompt(
    source_text: str,
    source_lang: str,
    target_lang: str,
    mode: str,
    locked_tokens: dict[str, str],
    kb_glosses: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    """Template (b): Token-locked Multilingual Translation across all 4 modes."""
    mode_rules = {
        "direct": "Translate literally and faithfully, keeping exact sentence structure and clinical meaning.",
        "patient_friendly": "Translate into warm, plain everyday language for patients while retaining all facts, numbers, and warnings.",
        "conversational": "Translate into natural spoken register suitable for audio playback without losing clinical accuracy.",
        "medical_term_plus_meaning": (
            "Preserve exact English medical terms (e.g., Hypertension, Acute Nasopharyngitis) followed by a clear "
            "explanation in the target language in parentheses."
        ),
    }
    system_prompt = (
        "You are MedSarthi's clinical translator. Translate the text accurately.\n"
        "NON-NEGOTIABLE INVARIANTS:\n"
        "1. Preserve every placeholder token like [[LOCK_0]], [[LOCK_1]] EXACTLY character-for-character.\n"
        "2. NEVER flip, weaken, or omit negations (not, never, avoid, do not, no, नहीं, मत, बंद न करें).\n"
        "3. NEVER alter numbers, dosages, units, frequencies, durations, or dates.\n"
        f"4. Mode ({mode}): {mode_rules.get(mode, mode_rules['patient_friendly'])}\n"
        f"5. Target language ({target_lang}): {_LANGUAGE_GUIDELINES.get(target_lang, f'Translate into {target_lang}.')}\n"
        'Return JSON: {"translated_text": "...", "preserved_terms": [{"medical_term": "...", "localized_gloss": "..."}]}'
    )
    user_prompt = (
        f"[Prompt: translate_v1 | {source_lang} -> {target_lang} | Mode: {mode}]\n"
        f"LOCKED TEXT:\n{source_text}\n\n"
        f"LOCKED TOKENS MAP:\n{json.dumps(locked_tokens, ensure_ascii=False)}\n\n"
        f"KB GLOSSARY:\n{json.dumps(kb_glosses or [], ensure_ascii=False)}"
    )
    return system_prompt, user_prompt


def build_term_explainer_prompt(
    term: str,
    context_snippet: str | None,
    kb_entry: dict[str, Any] | None,
    prefs: PersonalizationContext,
) -> tuple[str, str]:
    """Template (c): Medical Term Explainer returning all 10 mandatory fields."""
    system_prompt = (
        "You are MedSarthi's medical terminology educator.\n"
        "Return a valid JSON object containing ALL 10 mandatory fields:\n"
        "1. term\n2. pronunciation\n3. simple_definition\n4. selected_language_explanation\n"
        "5. hinglish_explanation\n6. detailed_explanation\n7. usage_example\n"
        "8. related_terms (list of strings)\n9. body_part_or_system\n"
        "10. verified_source (list of {source_name, source_url}; MUST be empty [] if not in VERIFIED KB)\n"
        "Also include `uncertain_or_missing` (list) disclosing if the term is absent from the verified KB."
    )
    user_prompt = (
        f"[Prompt: term_v1]\n"
        f"TERM: {term}\n"
        f"CONTEXT SNIPPET: {context_snippet or 'None provided'}\n"
        f"PERSONALIZATION:\n{_personalization_block(prefs)}\n\n"
        f"VERIFIED KB ENTRY:\n{json.dumps(kb_entry, ensure_ascii=False) if kb_entry else 'NOT_IN_VERIFIED_KB'}"
    )
    return system_prompt, user_prompt


def build_medicine_explainer_prompt(
    medicine_name: str,
    doctor_instruction: str | None,
    structured_med: dict[str, Any] | None,
    kb_entry: dict[str, Any] | None,
    prefs: PersonalizationContext,
) -> tuple[str, str]:
    """Template (d): Medication Explainer enforcing 10 parts + 8 strict prohibitions."""
    prohibitions = "\n".join(f"- {rule}" for rule in MEDICATION_EIGHT_PROHIBITIONS)
    system_prompt = (
        "You are MedSarthi's medication education assistant.\n"
        "EIGHT STRICT PROHIBITIONS:\n"
        f"{prohibitions}\n\n"
        "Return valid JSON containing:\n"
        "- medication_parts: {\n"
        "    what_it_is, drug_category, common_uses, general_mechanism, prescribed_reason,\n"
        "    common_side_effects[], warnings[], precautions[], adherence_importance, questions_for_doctor[]\n"
        "  }\n"
        "- missed_dose_guidance, red_flag_side_effects[]\n"
        "- doctor_provided[], ai_simplified{summary, steps}, general_education[], uncertain_or_missing[]\n"
        "If doctor_instruction does not specify why the medicine was prescribed, `prescribed_reason` MUST state "
        "that the specific reason was not written on the note and add an entry in `uncertain_or_missing`."
    )
    user_prompt = (
        f"[Prompt: medicine_v1]\n"
        f"MEDICINE NAME: {medicine_name}\n"
        f"DOCTOR INSTRUCTION: {doctor_instruction or 'Not provided'}\n"
        f"STRUCTURED MED: {json.dumps(structured_med or {}, ensure_ascii=False)}\n"
        f"PERSONALIZATION:\n{_personalization_block(prefs)}\n\n"
        f"VERIFIED KB ENTRY:\n{json.dumps(kb_entry, ensure_ascii=False) if kb_entry else 'NOT_IN_VERIFIED_KB'}"
    )
    return system_prompt, user_prompt


def build_explain_more_prompt(
    base_explanation: dict[str, Any],
    source_text: str,
    trigger_or_focus: str,
    target_depth: str,
    kb_entries: list[dict[str, Any]],
    prefs: PersonalizationContext,
) -> tuple[str, str]:
    """Template (e): Progressive Explain More across all 8 triggers + 3-heading Explain Everything."""
    canon = canonicalize_explain_more_trigger(trigger_or_focus)
    meta = EXPLAIN_MORE_TRIGGERS[canon]
    extra_rule = ""
    if canon == "explain_everything":
        extra_rule = (
            "\nMANDATORY 3-HEADING FIELD `three_part_breakdown`:\n"
            "{\n"
            '  "what_doctor_provided": {"heading": "1. What Your Doctor Provided", "items": [...]},\n'
            '  "general_medical_knowledge": {"heading": "2. General Medical Knowledge", "summary": "...", "points": [...], "citations": [...], "non_diagnosis_notice": "This is general medical education, not a personal diagnosis."},\n'
            '  "what_is_unknown_about_you": {"heading": "3. What Is Unknown About You Specifically", "items": [...], "questions_for_doctor": [...]}\n'
            "}\n"
        )

    system_prompt = (
        "You are MedSarthi's progressive explanation assistant.\n"
        f"ACTIVE TRIGGER: {canon} ({meta['label']})\n"
        f"INSTRUCTION: {meta['instruction']}\n"
        f"TARGET DEPTH: {target_depth} — {_DEPTH_GUIDELINES.get(target_depth, '')}\n"
        "Preserve all dosages, units, frequencies, durations, and negations verbatim.\n"
        "Return 4-category provenance JSON (`doctor_provided`, `ai_simplified`, `general_education`, `uncertain_or_missing`)."
        f"{extra_rule}"
    )
    user_prompt = (
        f"[Prompt: explain_more_v1 | Trigger: {canon} | TargetDepth: {target_depth}]\n"
        f"PERSONALIZATION:\n{_personalization_block(prefs)}\n\n"
        f"ORIGINAL SOURCE TEXT:\n{source_text}\n\n"
        f"PRIOR EXPLANATION:\n{json.dumps(base_explanation, ensure_ascii=False)}\n\n"
        f"VERIFIED KB ENTRIES:\n{_kb_context_block(kb_entries)}"
    )
    return system_prompt, user_prompt


def build_audio_summary_prompt(
    transcript_segments: list[dict[str, Any]],
    raw_transcript: str,
    kb_entries: list[dict[str, Any]],
    prefs: PersonalizationContext,
) -> tuple[str, str]:
    """Template (f): Consultation Audio Summarization prioritizing doctor-verified segments."""
    system_prompt = (
        "You are MedSarthi's consultation audio summarizer.\n"
        "Prioritize statements tagged `speaker_role == 'doctor'` when extracting clinical facts.\n"
        "Never guess uncertain or unverified words.\n"
        "Return JSON with:\n"
        "- structured_summary: {diagnoses[], symptoms[], observations[], medications[], warnings[], negations[], follow_up}\n"
        "- doctor_provided[], ai_simplified{summary, steps}, general_education[], uncertain_or_missing[]"
    )
    user_prompt = (
        f"[Prompt: audio_summary_v1]\n"
        f"PERSONALIZATION:\n{_personalization_block(prefs)}\n\n"
        f"SPEAKER-LABELED SEGMENTS:\n{json.dumps(transcript_segments, ensure_ascii=False)}\n\n"
        f"RAW TRANSCRIPT:\n{raw_transcript}\n\n"
        f"VERIFIED KB ENTRIES:\n{_kb_context_block(kb_entries)}"
    )
    return system_prompt, user_prompt


def build_chat_qa_prompt(
    user_question: str,
    conversation_history: list[dict[str, Any]],
    consultation_context: dict[str, Any] | None,
    document_context: dict[str, Any] | None,
    kb_entries: list[dict[str, Any]],
    intent_classification: dict[str, Any],
    prefs: PersonalizationContext,
) -> tuple[str, str]:
    """Template (g): Consultation-Scoped Q&A Chat prompt."""
    system_prompt = (
        "You are MedSarthi's consultation-scoped patient Q&A helper (NOT an open diagnostic chatbot).\n"
        "RULES:\n"
        "1. Answer ONLY using the shared consultation/document context and verified KB citations provided below.\n"
        "2. If asked whether the patient has another condition not in the doctor's note (e.g., pneumonia vs URI), "
        "explicitly state what the doctor's note DOES and DOES NOT say, explain the general difference using verified KB, "
        "and advise consulting the doctor for any evaluation.\n"
        "3. If intent is diagnosis_seeking, prescription_request, dose_change_request, or stop_or_substitute_request, "
        "calmly refuse autonomous action, keep original instructions unchanged, and refer to the prescribing doctor.\n"
        "4. If user asks to 'explain simpler', simplify the prior answer while keeping every clinical fact intact.\n"
        "5. Return 4-category provenance JSON (`doctor_provided`, `ai_simplified`, `general_education`, `uncertain_or_missing`) "
        "plus `suggested_followups` (list of strings)."
    )
    user_prompt = (
        f"[Prompt: chat_v1 | Intent: {intent_classification.get('intent', 'allowed_communication')}]\n"
        f"PERSONALIZATION:\n{_personalization_block(prefs)}\n\n"
        f"USER QUESTION:\n{user_question}\n\n"
        f"RECENT HISTORY:\n{json.dumps(conversation_history[-6:], ensure_ascii=False)}\n\n"
        f"CONSULTATION CONTEXT:\n{json.dumps(consultation_context or {}, ensure_ascii=False)}\n\n"
        f"DOCUMENT CONTEXT:\n{json.dumps(document_context or {}, ensure_ascii=False)}\n\n"
        f"VERIFIED KB ENTRIES:\n{_kb_context_block(kb_entries)}"
    )
    return system_prompt, user_prompt
