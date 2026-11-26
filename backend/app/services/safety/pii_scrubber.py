"""Outbound PII pseudonymizer for MedSarthi.

Strips patient names, phone numbers, email addresses, government/hospital IDs,
and explicit DOB/address fields before external LLM or cloud API calls while
preserving clinical numbers, dates, units, and emergency helpline numbers.
"""

from __future__ import annotations

import re
from typing import Any

# Common clinical/English words that must never be stripped even if a name token collides.
_NON_NAME_STOPWORDS = frozenset(
    {
        "patient",
        "doctor",
        "male",
        "female",
        "tablet",
        "capsule",
        "syrup",
        "fever",
        "pain",
        "blood",
        "sugar",
        "pressure",
        "normal",
        "daily",
        "morning",
        "night",
        "evening",
        "after",
        "before",
        "food",
        "water",
        "days",
        "weeks",
        "months",
        "hours",
        "take",
        "stop",
        "avoid",
        "case",
        "synthetic",
        "demo",
        "test",
        "report",
        "lab",
        "clinic",
        "hospital",
        "health",
        "care",
    }
)

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# Preserve India emergency helplines & clinical numbers; target 10+ digit / formatted phone strings.
_LABELED_PHONE_RE = re.compile(
    r"(\b(?:phone|mobile|mob|tel|telephone|contact|whatsapp|ph)\s*(?:no\.?|number|#)?\s*[:=-]?\s*)"
    r"(\+?\d[\d\s().-]{6,18}\d)",
    re.IGNORECASE,
)
_INTL_OR_INDIAN_MOBILE_RE = re.compile(
    r"(?<!\d)"
    r"(?:"
    r"(?:\+91[\s.-]?|0)?[6-9]\d{4}[\s.-]?\d{5}"
    r"|(?:\+\d{1,3}[\s.-]?)?\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{4}"
    r"|\+\d{1,3}[\s.-]\d{3,5}[\s.-]\d{4,6}"
    r"|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b"
    r")"
    r"(?!\d)"
)

# Labeled hospital/government/insurance IDs
_LABELED_ID_RE = re.compile(
    r"(\b(?:MRN|UHID|OPD\s*(?:No\.?|ID)|IPD\s*(?:No\.?|ID)|Patient\s*ID|Hospital\s*ID|"
    r"Reg(?:istration)?\s*(?:No\.?|Number|ID)|Policy\s*(?:No\.?|Number|ID)|"
    r"ABHA\s*(?:ID|No\.?)?|Aadhaar\s*(?:No\.?)?|SSN|Passport\s*(?:No\.?)?|Case\s*ID)"
    r"\s*[:#=-]?\s*)"
    r"([A-Z0-9][A-Z0-9-]{3,24}\b)",
    re.IGNORECASE,
)
_ABHA_RE = re.compile(r"(?<!\d)\d{2}-\d{4}-\d{4}-\d{4}(?!\d)")
_AADHAAR_RE = re.compile(r"(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)|(?<!\d)\d{12}(?!\d)")
_PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")

_LABELED_DOB_RE = re.compile(
    r"(\b(?:DOB|D\.O\.B\.|Date\s+of\s+Birth|Birth\s*Date)\s*[:=-]?\s*)"
    r"([^\n,;()]{4,24})",
    re.IGNORECASE,
)
_LABELED_ADDRESS_RE = re.compile(
    r"(\b(?:Address|Residential\s+Address|Home\s+Address)\s*[:=-]?\s*)([^\n]+)",
    re.IGNORECASE,
)
_LABELED_PATIENT_NAME_RE = re.compile(
    r"(\bPatient\s*(?:Name)?\s*[:=-]\s*)([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3})"
)


def _scrub_patient_name(text: str, patient_name: str) -> str:
    """Replace full patient name and distinct multi-char name tokens safely."""
    cleaned = " ".join(patient_name.strip().split())
    if not cleaned:
        return text

    honorific_pattern = (
        r"(?:\b(?:Mr|Mrs|Ms|Miss|Shri|Smt|Kumari|Master|Mx)\.?\s+)?"
        + re.escape(cleaned)
        + r"(?:'s)?\b"
    )
    text = re.sub(honorific_pattern, "[PATIENT_NAME]", text, flags=re.IGNORECASE)

    parts = [p.strip(".,'\"") for p in cleaned.split()]
    if len(parts) >= 2:
        for part in parts:
            if len(part) >= 3 and part.lower() not in _NON_NAME_STOPWORDS:
                part_pattern = rf"\b{re.escape(part)}(?:'s)?\b"
                text = re.sub(part_pattern, "[PATIENT_NAME]", text, flags=re.IGNORECASE)

    text = re.sub(r"(?:\[PATIENT_NAME\]\s*){2,}", "[PATIENT_NAME] ", text)
    return text


def scrub_pii(text: str, patient_name: str | None = None) -> str:
    """Strip PII (patient name, phones, emails, IDs, DOB, addresses) before external LLM calls.

    Preserves clinical numbers (BP, dosages, lab results, visit dates) and emergency helplines.
    """
    if not text:
        return ""

    result = text

    # Scrub emails & structured IDs BEFORE patient_name so emails containing the name aren't broken
    result = _EMAIL_RE.sub("[EMAIL]", result)
    result = _ABHA_RE.sub("[ID_NUMBER]", result)
    result = _AADHAAR_RE.sub("[ID_NUMBER]", result)
    result = _PAN_RE.sub("[ID_NUMBER]", result)
    result = _LABELED_ID_RE.sub(r"\1[ID_NUMBER]", result)

    if patient_name:
        result = _scrub_patient_name(result, patient_name)

    result = _LABELED_PATIENT_NAME_RE.sub(r"\1[PATIENT_NAME]", result)

    def _replace_labeled_phone(match: re.Match[str]) -> str:
        prefix, num = match.group(1), match.group(2)
        if "1800-891-4416" in num or num.strip() in {"112", "108", "104", "14416"}:
            return match.group(0)
        return f"{prefix}[PHONE]"

    def _replace_phone(match: re.Match[str]) -> str:
        val = match.group(0)
        if "1800-891-4416" in val:
            return val
        return "[PHONE]"

    result = _LABELED_PHONE_RE.sub(_replace_labeled_phone, result)
    result = _INTL_OR_INDIAN_MOBILE_RE.sub(_replace_phone, result)

    result = _LABELED_DOB_RE.sub(r"\1[DOB]", result)
    result = _LABELED_ADDRESS_RE.sub(r"\1[ADDRESS]", result)

    return result


def scrub_structured_pii(payload: Any, patient_name: str | None = None) -> Any:
    """Recursively scrub PII from strings inside nested dicts or lists."""
    if isinstance(payload, str):
        return scrub_pii(payload, patient_name=patient_name)
    if isinstance(payload, list):
        return [scrub_structured_pii(item, patient_name=patient_name) for item in payload]
    if isinstance(payload, dict):
        return {k: scrub_structured_pii(v, patient_name=patient_name) for k, v in payload.items()}
    return payload
