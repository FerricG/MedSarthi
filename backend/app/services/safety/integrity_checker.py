"""Deterministic, zero-LLM 13-rule Medical Instruction Integrity Checker.

Compares source clinical text (plus optional structured source fields) against
simplified or translated patient-facing output across all 13 critical domains
in English, Hindi (Devanagari), and Hinglish (hi-Latn).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
import re
from typing import Any

DISCLAIMER_TEXT = (
    "Automated consistency check comparing critical fields against the source note; "
    "this does not prove clinical correctness or replace professional review."
)

# ---------------------------------------------------------------------------
# 1. Unicode, Numeral & Word-Number Canonicalization
# ---------------------------------------------------------------------------

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

_FRACTION_WORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bone\s+and\s+(?:a\s+)?half\b", re.I), "1.5"),
    (re.compile(r"\btwo\s+and\s+(?:a\s+)?half\b", re.I), "2.5"),
    (re.compile(r"डेढ़", re.I), "1.5"),
    (re.compile(r"\bdedh\b", re.I), "1.5"),
    (re.compile(r"ढाई", re.I), "2.5"),
    (re.compile(r"\bdhai\b", re.I), "2.5"),
    (re.compile(r"\bhalf\b", re.I), "0.5"),
    (re.compile(r"आधा|आधी", re.I), "0.5"),
    (re.compile(r"\b(?:aadha|aadhi|adha|adhi)\b", re.I), "0.5"),
    (re.compile(r"\bquarter\b", re.I), "0.25"),
    (re.compile(r"चौथाई", re.I), "0.25"),
    (re.compile(r"\bchauthai\b", re.I), "0.25"),
]

_WORD_NUMBERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?<!no\s)\bone\b", re.I), "1"),
    (re.compile(r"\btwo\b", re.I), "2"),
    (re.compile(r"\bthree\b", re.I), "3"),
    (re.compile(r"\bfour\b", re.I), "4"),
    (re.compile(r"\bfive\b", re.I), "5"),
    (re.compile(r"\bsix\b", re.I), "6"),
    (re.compile(r"\bseven\b", re.I), "7"),
    (re.compile(r"\beight\b", re.I), "8"),
    (re.compile(r"\bnine\b", re.I), "9"),
    (re.compile(r"\bten\b", re.I), "10"),
    (re.compile(r"\btwelve\b", re.I), "12"),
    (re.compile(r"\bfourteen\b", re.I), "14"),
    (re.compile(r"\bfifteen\b", re.I), "15"),
    (re.compile(r"\btwenty\b", re.I), "20"),
    (re.compile(r"\bthirty\b", re.I), "30"),
    # Hindi Devanagari word numbers
    (re.compile(r"एक"), "1"),
    (re.compile(r"दो"), "2"),
    (re.compile(r"तीन"), "3"),
    (re.compile(r"चार"), "4"),
    (re.compile(r"पांच|पाँच"), "5"),
    (re.compile(r"छह|छः"), "6"),
    (re.compile(r"सात"), "7"),
    (re.compile(r"आठ"), "8"),
    (re.compile(r"नौ"), "9"),
    (re.compile(r"दस"), "10"),
    (re.compile(r"बारह"), "12"),
    (re.compile(r"चौदह"), "14"),
    (re.compile(r"पंद्रह"), "15"),
    (re.compile(r"तीस"), "30"),
    # Hinglish number words (protecting English verb "do"!)
    (re.compile(r"\bek\b", re.I), "1"),
    (
        re.compile(
            r"\bdo\b(?=\s*(?:-|to\s+)?(?:goli|goliyan|tablet|tablets|capsule|capsules|"
            r"baar|bar|times?|din|hafte|hafta|mahine|boond|drops?|puff|puffs|"
            r"chamach|chammach|tsp|ml|mg|mcg|g|iu|ghante|hours?|weeks?|days?|months?)\b)",
            re.I,
        ),
        "2",
    ),
    (re.compile(r"(?<=\bmein\s)\bdo\b(?=\s+baar\b)|(?<=\bme\s)\bdo\b(?=\s+baar\b)", re.I), "2"),
    (re.compile(r"\bteen\b", re.I), "3"),
    (re.compile(r"\b(?:chaar|char)\b", re.I), "4"),
    (re.compile(r"\b(?:paanch|panch)\b", re.I), "5"),
    (re.compile(r"\b(?:chhah|chhe)\b", re.I), "6"),
    (re.compile(r"\bsaat\b", re.I), "7"),
    (re.compile(r"\baath\b", re.I), "8"),
    (re.compile(r"\bnau\b", re.I), "9"),
    (re.compile(r"\bdas\b", re.I), "10"),
    (re.compile(r"\bpandrah\b", re.I), "15"),
    (re.compile(r"\btees\b", re.I), "30"),
]


def _normalize_text(text: str) -> str:
    """Normalize Devanagari digits, punctuation, unicode fractions, and word numbers."""
    if not text:
        return ""
    s = text.translate(_DEVANAGARI_DIGITS)
    s = s.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = s.replace("½", " 0.5 ").replace("¼", " 0.25 ").replace("¾", " 0.75 ")

    # Convert mixed fractions like "1 1/2" before simple fractions, avoiding dates & BP
    s = re.sub(
        r"(?<![\d/])(\d+)\s+([13])/([24])(?![\d/])",
        lambda m: str(Decimal(m.group(1)) + Decimal(m.group(2)) / Decimal(m.group(3))),
        s,
    )
    s = re.sub(
        r"(?<![\d/])([13])/([24])(?![\d/])",
        lambda m: str(Decimal(m.group(1)) / Decimal(m.group(2))),
        s,
    )

    for pat, repl in _FRACTION_WORDS:
        s = pat.sub(repl, s)
    for pat, repl in _WORD_NUMBERS:
        s = pat.sub(repl, s)

    # Normalize Hindi hyphenated reduplication like "1-1 goli" or "ek-ek goli" -> "1 goli"
    s = re.sub(r"\b(\d+(?:\.\d+)?)\s*-\s*\1\b", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _to_decimal(val: str | int | float) -> Decimal | None:
    try:
        cleaned = str(val).replace(",", "").strip()
        d = Decimal(cleaned).normalize()
        # Avoid scientific notation like 1E+2 -> keep plain representation
        if d == d.to_integral():
            return Decimal(int(d))
        return d
    except (InvalidOperation, ValueError):
        return None


def _fmt_dec(d: Decimal) -> str:
    s = format(d, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


# ---------------------------------------------------------------------------
# 2. Rule 1 Data: Medicine Lexicon & LASA Anti-Fuzzy Guard
# ---------------------------------------------------------------------------

LASA_PAIRS: tuple[tuple[str, str], ...] = (
    ("metformin", "metronidazole"),
    ("glipizide", "glyburide"),
    ("prednisone", "prednisolone"),
    ("cefixime", "cefuroxime"),
    ("hydroxyzine", "hydralazine"),
    ("amlodipine", "atorvastatin"),
    ("azithromycin", "erythromycin"),
    ("clonazepam", "clobazam"),
    ("dopamine", "dobutamine"),
    ("epinephrine", "ephedrine"),
    ("chlorpromazine", "chlorpropamide"),
)

# Exact salt + approved brand/Hindi dictionary (NEVER fuzzy-matched)
CANONICAL_MEDICINE_ALIASES: dict[str, list[str]] = {
    "paracetamol": ["paracetamol", "acetaminophen", "crocin", "dolo", "calpol", "pacimol", "पैरासिटामोल"],
    "azithromycin": ["azithromycin", "azithral", "azee", "zithromax", "एज़िथ्रोमाइसिन", "एजिथ्रोमाइसिन"],
    "erythromycin": ["erythromycin", "erythrocin", "एरिथ्रोमाइसिन"],
    "metformin": ["metformin", "glucophage", "glycomet", "मेटफॉर्मिन"],
    "metronidazole": ["metronidazole", "flagyl", "metrogyl", "मेट्रोनिडाज़ोल", "मेट्रोनिडाजोल"],
    "glipizide": ["glipizide", "glucotrol", "ग्लिपिजाइड"],
    "glyburide": ["glyburide", "glibenclamide", "daonil", "ग्लाइब्यूराइड"],
    "prednisone": ["prednisone", "प्रेडनिसोन"],
    "prednisolone": ["prednisolone", "wysolone", "omnacortil", "प्रेडनिसोलोन"],
    "cefixime": ["cefixime", "taxim-o", "zifi", "cefix", "सेफिक्सिम"],
    "cefuroxime": ["cefuroxime", "ceftum", "zinacef", "सेफ्यूरोक्सिम"],
    "hydroxyzine": ["hydroxyzine", "atarax", "हाइड्रोक्सीज़ाइन"],
    "hydralazine": ["hydralazine", "apresoline", "हाइड्रालाज़ीन"],
    "amlodipine": ["amlodipine", "amlong", "stamlo", "norvasc", "एम्लोडिपाइन", "एम्लोडिपिन"],
    "atorvastatin": ["atorvastatin", "atorva", "lipitor", "टोरवास्टेटिन", "एटोरवास्टेटिन"],
    "amoxicillin": ["amoxicillin", "amoxil", "mox", "novamox", "अमोक्सिसिलिन"],
    "amoxicillin-clavulanate": ["amoxicillin-clavulanate", "amoxiclav", "augmentin", "clavam"],
    "ibuprofen": ["ibuprofen", "brufen", "advil", "आइबुप्रोफेन"],
    "aspirin": ["aspirin", "ecosprin", "disprin", "एस्पिरिन"],
    "pantoprazole": ["pantoprazole", "pan", "pantocid", "पैंटोप्राज़ोल", "पैंटोप्राजोल"],
    "omeprazole": ["omeprazole", "omez", "prilosec", "ओमेप्राज़ोल"],
    "rabeprazole": ["rabeprazole", "rablet", "razo", "रैबेप्राज़ोल"],
    "levothyroxine": ["levothyroxine", "eltroxin", "thyronorm", "लेवोथायरोक्सिन"],
    "digoxin": ["digoxin", "lanoxin", "डिगॉक्सिन"],
    "warfarin": ["warfarin", "coumadin", "warfrin", "वारफारिन"],
    "insulin": ["insulin", "lantus", "humalog", "novorapid", "इंसुलिन"],
    "ofloxacin": ["ofloxacin", "zenflox", "oflox", "ओफ्लॉक्सासिन"],
    "ciprofloxacin": ["ciprofloxacin", "ciplox", "cifran", "सिप्रोफ्लॉक्सासिन"],
    "levofloxacin": ["levofloxacin", "levoflox", "tavanic", "लेवोफ्लॉक्सासिन"],
    "cetirizine": ["cetirizine", "cetzine", "okacet", "सिटिरीज़िन"],
    "levocetirizine": ["levocetirizine", "levocet", "xyzal"],
    "montelukast": ["montelukast", "montair", "singulair"],
    "salbutamol": ["salbutamol", "albuterol", "asthalin", "सालबुटामोल"],
    "budesonide": ["budesonide", "budecort", "pulmicort"],
    "rosuvastatin": ["rosuvastatin", "rosuvas", "crestor"],
    "losartan": ["losartan", "losacar", "cozaar"],
    "telmisartan": ["telmisartan", "telma", "micardis"],
    "clopidogrel": ["clopidogrel", "plavix", "clopilet"],
    "propranolol": ["propranolol", "inderal", "ciplar"],
    "furosemide": ["furosemide", "lasix"],
    "spironolactone": ["spironolactone", "aldactone"],
    "diclofenac": ["diclofenac", "voveran", "voltaren"],
    "ondansetron": ["ondansetron", "emeset", "zofran"],
    "domperidone": ["domperidone", "domstal"],
    "doxycycline": ["doxycycline", "doxt", "डॉक्सीसाइक्लिन"],
    "penicillin": ["penicillin", "पेनिसिलिन"],
    "sulfa": ["sulfa", "sulfamethoxazole", "सल्फा"],
    "cholecalciferol": ["cholecalciferol", "vitamin d3", "d3"],
    "ors": ["ors", "oral rehydration salts", "ओआरएस"],
}

_ALIAS_TO_CANONICAL: dict[str, str] = {}
for _canon, _aliases in CANONICAL_MEDICINE_ALIASES.items():
    for _al in _aliases:
        _ALIAS_TO_CANONICAL[_al.lower()] = _canon

_MED_FORM_PREFIX_RE = re.compile(
    r"\b(?:Tab\.?|Tablet|Cap\.?|Capsule|Syp\.?|Syrup|Inj\.?|Injection|Susp\.?|Suspension|"
    r"Drops?|Oint\.?|Ointment|Gel|Cream|Inhaler)\s+([A-Z][a-zA-Z0-9-]{2,})\b"
)
_MED_FORM_STRIP_RE = re.compile(
    r"^(?:tab\.?|tablet|cap\.?|capsule|syp\.?|syrup|inj\.?|injection|susp\.?|suspension|"
    r"drops?|oint\.?|ointment|gel|cream|inhaler|गोली|कैप्सूल|सिरप)\s+",
    re.I,
)
_NON_MED_WORDS = frozenset(
    {
        "for", "with", "without", "after", "before", "every", "once", "twice", "thrice",
        "daily", "morning", "evening", "night", "bedtime", "take", "stop", "avoid",
        "continue", "only", "when", "needed", "max", "maximum", "dose", "eye", "ear",
        "nasal", "oral", "skin", "water", "food", "breakfast", "dinner", "lunch",
        "fever", "pain", "cough", "cold", "days", "weeks", "months", "hours", "and", "or",
        "the", "your", "doctor", "patient", "tablets", "tablet", "capsules", "capsule",
        "drops", "puffs", "in", "on", "at", "to", "of", "by", "from", "all", "no", "not",
        "medication", "medicine", "medicines", "drug", "drugs", "antibiotic", "painkiller",
        "blood", "pressure", "sugar", "temperature", "creatinine", "hba1c", "platelets",
        "sos", "prn", "od", "bd", "bid", "tds", "tid", "qid", "hs", "ac", "pc",
        "high", "low", "mild", "severe", "acute", "chronic",
    }
)


def _canonicalize_medicine_name(raw: str) -> str:
    """Strip dosage-form prefix and resolve exact dictionary alias (no fuzzy matching)."""
    cleaned = _MED_FORM_STRIP_RE.sub("", raw.strip()).strip(" .,:;()[]").lower()
    if cleaned in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[cleaned]
    return cleaned


def _extract_medicines(text: str, structured_meds: list[dict[str, Any]] | None = None) -> set[str]:
    """Extract canonical medicine names deterministically without fuzzy matching."""
    found: set[str] = set()
    lower = text.lower()

    # 1. Exact alias dictionary lookup with word boundaries
    for alias, canon in _ALIAS_TO_CANONICAL.items():
        if re.search(rf"(?<![\w\u0900-\u0963\u0966-\u097F]){re.escape(alias)}(?![\w\u0900-\u0963\u0966-\u097F])", lower):
            found.add(canon)

    # 2. Form-prefixed medicines (e.g. "Tab. Xylocaine 100 mg")
    for m in _MED_FORM_PREFIX_RE.finditer(text):
        cand = _canonicalize_medicine_name(m.group(1))
        if len(cand) >= 3 and cand not in _NON_MED_WORDS:
            found.add(cand)

    # 3. Dose-anchored capitalized/suffix medicines (e.g. "Xylocaine 100 mg")
    for m in re.finditer(
        r"\b([A-Za-z][a-zA-Z-]{3,})\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ug|µg|g|gm|iu)\b",
        text,
        re.I,
    ):
        word = m.group(1)
        low = word.lower()
        if low in _NON_MED_WORDS:
            continue
        if word[0].isupper() or low in _ALIAS_TO_CANONICAL:
            found.add(_canonicalize_medicine_name(word))

    # 4. Structured source medications
    if structured_meds:
        for item in structured_meds:
            if isinstance(item, dict):
                raw_name = item.get("name") or item.get("medicine_name") or item.get("drug") or ""
                if isinstance(raw_name, str) and raw_name.strip():
                    canon = _canonicalize_medicine_name(raw_name)
                    if canon:
                        found.add(canon)
            elif isinstance(item, str) and item.strip():
                found.add(_canonicalize_medicine_name(item))

    return found


# ---------------------------------------------------------------------------
# 3. Rule 2 & Rule 3: Dosage, Units, and Slot Vectors
# ---------------------------------------------------------------------------

_UNIT_CANONICAL: dict[str, str] = {
    "mg": "mg", "milligram": "mg", "milligrams": "mg", "मिग्रा": "mg", "मिलीग्राम": "mg",
    "mcg": "mcg", "ug": "mcg", "µg": "mcg", "μg": "mcg", "microgram": "mcg", "micrograms": "mcg", "माइक्रोग्राम": "mcg",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g", "ग्राम": "g",
    "ml": "ml", "milliliter": "ml", "milliliters": "ml", "millilitre": "ml", "millilitres": "ml", "मिली": "ml", "मिलीलीटर": "ml",
    "iu": "iu", "unit": "iu", "units": "iu",
    "drop": "drops", "drops": "drops", "बूंद": "drops", "बूंदें": "drops", "boond": "drops", "boondein": "drops",
    "puff": "puff", "puffs": "puff", "पफ": "puff",
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "चम्मच": "tsp", "chamach": "tsp", "chammach": "tsp",
    "tab": "tablet", "tabs": "tablet", "tablet": "tablet", "tablets": "tablet",
    "cap": "tablet", "caps": "tablet", "capsule": "tablet", "capsules": "tablet",
    "goli": "tablet", "goliyan": "tablet", "गोली": "tablet", "गोलियां": "tablet", "कैप्सूल": "tablet",
}

_STRENGTH_UNITS = frozenset({"mg", "mcg", "g", "ml", "iu", "drops", "puff", "tsp"})

_DOSE_UNIT_RE = re.compile(
    r"(?<!\d)(?<!/)(\d+(?:\.\d+)?)\s*[-–]?\s*"
    r"(mg|milligrams?|mcg|ug|µg|μg|micrograms?|gm?s?|grams?|ml|millilit(?:er|re)s?|iu|units?|"
    r"drops?|puffs?|tsp|teaspoons?|tablets?|tabs?|capsules?|caps?|goli(?:yan)?|"
    r"boond(?:ein)?|cham+ach|"
    r"मिग्रा|मिलीग्राम|माइक्रोग्राम|ग्राम|मिलीलीटर|मिली|बूंदें|बूंद|पफ|चम्मच|गोली|गोलियां|कैप्सूल)"
    r"(?![\w\u0900-\u0963\u0966-\u097F/])",
    re.I,
)

# Bare unitless numbers directly following a known/form-prefixed drug name (e.g., "Levothyroxine 50")
_UNITLESS_DRUG_NUM_RE = re.compile(
    r"\b([A-Za-z][a-zA-Z-]{3,})\s+(\d+(?:\.\d+)?)\b"
    r"(?!\s*(?:-|/|mg|milligrams?|mcg|ug|µg|μg|micrograms?|gm?s?|grams?|ml|millilit(?:er|re)s?|iu|units?|"
    r"drops?|puffs?|tsp|teaspoons?|%|tablets?|tabs?|capsules?|caps?|goli(?:yan)?|"
    r"boond(?:ein)?|cham+ach|days?|weeks?|months?|hours?|din|hafte|hafta|mahine|baar|bar|se\b|"
    r"f\b|c\b|°|mmhg|lakh|lakhs|lac|"
    r"मिग्रा|मिलीग्राम|माइक्रोग्राम|ग्राम|मिलीलीटर|मिली|बूंदें|बूंद|पफ|चम्मच|गोली|गोलियां|कैप्सूल|दिन|हफ्ते|महीने|बार))",
    re.I,
)

_SLOT_VECTOR_RE = re.compile(r"(?<![\d/-])(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?(?![\d/-])")


@dataclass(frozen=True)
class DoseEntry:
    value: Decimal
    unit: str  # canonical unit or "MISSING_UNIT"
    raw: str
    is_strength: bool
    is_max_limit: bool = False


def _extract_doses(norm_text: str, structured_meds: list[dict[str, Any]] | None = None) -> list[DoseEntry]:
    """Extract clinical doses (value + unit) and bare unitless drug numbers."""
    entries: list[DoseEntry] = []

    for m in _DOSE_UNIT_RE.finditer(norm_text):
        # Ignore "mg/dL" lab values so we don't duplicate Rule 9
        after = norm_text[m.end() : m.end() + 4].lower()
        if after.startswith("/dl") or after.startswith("/l"):
            continue
        dec = _to_decimal(m.group(1))
        if dec is None:
            continue
        raw_unit = m.group(2).lower()
        canon_unit = _UNIT_CANONICAL.get(raw_unit, raw_unit)
        prefix = norm_text[max(0, m.start() - 35) : m.start()].lower()
        is_max = bool(re.search(r"\b(?:max|maximum|exceed|more\s+than|zyada|se\s+zyada)\b|अधिकतम|ज्यादा", prefix))
        entries.append(
            DoseEntry(
                value=dec,
                unit=canon_unit,
                raw=m.group(0).strip(),
                is_strength=canon_unit in _STRENGTH_UNITS,
                is_max_limit=is_max,
            )
        )

    # Check topical percentage doses like "Hydrocortisone 1%" (excluding SpO2/HbA1c/etc.)
    for m in re.finditer(r"\b([A-Za-z][a-zA-Z-]{3,})\s+(\d+(?:\.\d+)?)\s*%", norm_text, re.I):
        drug_cand = m.group(1).lower()
        if drug_cand in {"spo2", "hba1c", "a1c", "oxygen", "saturation"}:
            continue
        if _canonicalize_medicine_name(drug_cand) in CANONICAL_MEDICINE_ALIASES or drug_cand not in _NON_MED_WORDS:
            dec = _to_decimal(m.group(2))
            if dec is not None:
                entries.append(DoseEntry(value=dec, unit="%", raw=m.group(0).strip(), is_strength=True))

    # Bare unitless numbers right after a drug name (detects missing unit!)
    for m in _UNITLESS_DRUG_NUM_RE.finditer(norm_text):
        drug_cand = _canonicalize_medicine_name(m.group(1))
        if drug_cand in CANONICAL_MEDICINE_ALIASES:
            dec = _to_decimal(m.group(2))
            if dec is not None:
                entries.append(DoseEntry(value=dec, unit="MISSING_UNIT", raw=m.group(0).strip(), is_strength=True))

    if structured_meds:
        for item in structured_meds:
            if not isinstance(item, dict):
                continue
            if item.get("dosage_value") is not None and item.get("dosage_unit"):
                dec = _to_decimal(item["dosage_value"])
                unit = _UNIT_CANONICAL.get(str(item["dosage_unit"]).strip().lower(), str(item["dosage_unit"]).strip().lower())
                if dec is not None:
                    cand = DoseEntry(value=dec, unit=unit, raw=f"{_fmt_dec(dec)} {unit}", is_strength=unit in _STRENGTH_UNITS)
                    if not any(e.value == cand.value and e.unit == cand.unit for e in entries):
                        entries.append(cand)
            elif isinstance(item.get("dose"), str):
                for e in _extract_doses(_normalize_text(item["dose"])):
                    if not any(x.value == e.value and x.unit == e.unit for x in entries):
                        entries.append(e)

    return entries


def _extract_slot_vectors(norm_text: str) -> list[tuple[Decimal, ...]]:
    """Extract prescription schedule vectors like 1-0-1, 1-1-0, 2-0-2, 1-1-1-1."""
    vectors: list[tuple[Decimal, ...]] = []
    for m in _SLOT_VECTOR_RE.finditer(norm_text):
        # Skip ISO dates like 2026-11-24 (4-digit first component) or DD-MM-YYYY (4-digit last component)
        g = [x for x in m.groups() if x is not None]
        if any(len(x.split(".")[0]) >= 3 for x in g):
            continue
        decs = tuple(_to_decimal(x) for x in g)
        if any(d is None or d > Decimal("10") for d in decs):
            continue
        vectors.append(decs)  # type: ignore[arg-type]
    return vectors


# ---------------------------------------------------------------------------
# 4. Rule 4: Frequency & Schedule Canonicalization
# ---------------------------------------------------------------------------

@dataclass
class FrequencyProfile:
    per_day: set[int] = field(default_factory=set)
    slots: set[str] = field(default_factory=set)  # {"AM", "NOON", "PM"}
    slot_patterns: list[tuple[int, ...]] = field(default_factory=list)  # active slot patterns like (1,0,1)
    meal_relations: set[str] = field(default_factory=set)  # {"BEFORE_MEAL", "AFTER_MEAL"}
    interval_hours: set[int] = field(default_factory=set)
    is_prn: bool = False
    is_bedtime: bool = False


_FREQ_PATTERNS: list[tuple[re.Pattern[str], int, tuple[str, ...]]] = [
    (
        re.compile(
            r"\b(?:OD|qd|q24h|once\s+(?:daily|a\s+day)|1\s+time\s+(?:daily|a\s+day)|"
            r"every\s+24\s+hours|din\s+mei?n\s+1\s+baar|(?:har\s+)?roz\s+(?:\S+\s+){0,3}?1\s+baar|"
            r"rozana\s+1\s+baar)\b|"
            r"(?:दिन\s+में|प्रतिदिन|रोज़ाना|रोजाना|रोज़?)\s+(?:\S+\s+){0,4}?1\s+बार",
            re.I,
        ),
        1,
        (),
    ),
    (
        re.compile(
            r"\b(?:every\s+morning|roz\s+subah|har\s+subah)\b(?!\s+(?:and|aur)\s+(?:evening|night|afternoon|shaam|raat|dopahar))|"
            r"हर\s+सुबह(?!\s+और\s+(?:शाम|रात|दोपहर))",
            re.I,
        ),
        1,
        ("AM",),
    ),
    (
        re.compile(
            r"\b(?:BD|BID|b\.d\.|b\.i\.d\.|q12h|twice\s+(?:daily|a\s+day)|2\s+times\s+(?:daily|a\s+day)|"
            r"every\s+12\s+hours|din\s+mei?n\s+2\s+baar)\b|"
            r"दिन\s+में\s+2\s+बार",
            re.I,
        ),
        2,
        (),
    ),
    (
        re.compile(
            r"\b(?:subah\s+(?:aur\s+)?shaam|subah\s+(?:aur\s+)?raat|morning\s+and\s+(?:evening|night)|"
            r"(?:in\s+the\s+)?morning\s+and\s+(?:(?:\d+(?:\.\d+)?\s+)?(?:tablet|capsule|goli)?\s*)?(?:at\s+)?(?:evening|night))\b|"
            r"सुबह\s+(?:और\s+)?(?:शाम|रात)",
            re.I,
        ),
        2,
        ("AM", "PM"),
    ),
    (
        re.compile(
            r"\b(?:subah\s+(?:aur\s+)?dopahar|morning\s+and\s+afternoon|"
            r"(?:in\s+the\s+)?morning\s+and\s+(?:(?:\d+(?:\.\d+)?\s+)?(?:tablet|capsule|goli)?\s*)?(?:in\s+the\s+)?afternoon)\b|"
            r"सुबह\s+(?:और\s+)?दोपहर",
            re.I,
        ),
        2,
        ("AM", "NOON"),
    ),
    (
        re.compile(
            r"\b(?:TDS|TID|t\.d\.s\.|t\.i\.d\.|q8h|thrice\s+(?:daily|a\s+day)|3\s+times\s+(?:daily|a\s+day)|"
            r"every\s+8\s+hours|din\s+mei?n\s+3\s+baar|subah\s+dopahar\s+shaam)\b|"
            r"दिन\s+में\s+3\s+बार|सुबह\s+दोपहर\s+शाम",
            re.I,
        ),
        3,
        ("AM", "NOON", "PM"),
    ),
    (
        re.compile(
            r"\b(?:QID|q\.i\.d\.|q6h|4\s+times\s+(?:daily|a\s+day)|every\s+6\s+hours|din\s+mei?n\s+4\s+baar)\b|"
            r"दिन\s+में\s+4\s+बार",
            re.I,
        ),
        4,
        (),
    ),
]

_BEFORE_MEAL_RE = re.compile(
    r"\b(?:AC|a\.c\.|before\s+(?:meals?|food|breakfast|eating)|(?:on\s+an\s+)?empty\s+stomach|"
    r"khali\s+pet|khane\s+se\s+pehle|nashte\s+se\s+pehle)\b|"
    r"खाली\s+पेट|खाने\s+से\s+पहले|भोजन\s+से\s+पहले",
    re.I,
)
_AFTER_MEAL_RE = re.compile(
    r"\b(?:PC|p\.c\.|after\s+(?:meals?|food|breakfast|lunch|dinner|eating)|with\s+(?:meals?|food)|"
    r"khane\s+ke\s+baad|khana\s+khane\s+ke\s+baad|nashte\s+ke\s+baad)\b|"
    r"खाना\s+खाने\s+के\s+बाद|खाने\s+के\s+बाद|भोजन\s+के\s+बाद|नाश्ते\s+के\s+बाद",
    re.I,
)
_PRN_RE = re.compile(
    r"\b(?:SOS|PRN|as\s+needed|when\s+needed|only\s+(?:if|when)\s+needed|zaroorat\s+(?:padne\s+)?par)\b|"
    r"ज़रूरत\s+पड़ने\s+पर|जरूरत\s+पड़ने\s+पर|आवश्यकता\s+पड़ने\s+पर",
    re.I,
)
_BEDTIME_RE = re.compile(
    r"\b(?:HS|h\.s\.|(?:at\s+)?bedtime|before\s+sleep(?:ing)?|sote\s+samay|raat\s+ko\s+sote\s+waqt)\b|"
    r"सोते\s+समय",
    re.I,
)
_INTERVAL_HOURS_RE = re.compile(
    r"\bq(\d{1,2})h\b|\bevery\s+(\d{1,2})\s+hours?\b|हर\s+(\d{1,2})\s+घंटे",
    re.I,
)


def _extract_frequency(norm_text: str, structured_meds: list[dict[str, Any]] | None = None) -> FrequencyProfile:
    prof = FrequencyProfile()
    combined = norm_text
    if structured_meds:
        extra_parts = []
        for item in structured_meds:
            if isinstance(item, dict):
                for key in ("frequency", "frequency_text", "special_instructions"):
                    if isinstance(item.get(key), str):
                        extra_parts.append(item[key])
        if extra_parts:
            combined = f"{norm_text} {' '.join(_normalize_text(p) for p in extra_parts)}"

    for pat, per_day, slots in _FREQ_PATTERNS:
        if pat.search(combined):
            prof.per_day.add(per_day)
            prof.slots.update(slots)

    # Slot vectors e.g. 1-0-1 -> AM + PM, per_day = 2; 1-1-0 -> AM + NOON, per_day = 2
    for vec in _extract_slot_vectors(combined):
        active_indices = tuple(1 if d > 0 else 0 for d in vec)
        active_count = sum(active_indices)
        if active_count > 0:
            prof.per_day.add(active_count)
            prof.slot_patterns.append(active_indices)
            if len(vec) >= 3:
                if vec[0] > 0:
                    prof.slots.add("AM")
                if vec[1] > 0:
                    prof.slots.add("NOON")
                if vec[2] > 0:
                    prof.slots.add("PM")

    for m in _INTERVAL_HOURS_RE.finditer(combined):
        hrs_str = m.group(1) or m.group(2) or m.group(3)
        if hrs_str:
            hrs = int(hrs_str)
            prof.interval_hours.add(hrs)
            if hrs in {24, 12, 8, 6}:
                prof.per_day.add(24 // hrs)

    if _BEFORE_MEAL_RE.search(combined):
        prof.meal_relations.add("BEFORE_MEAL")
    if _AFTER_MEAL_RE.search(combined):
        prof.meal_relations.add("AFTER_MEAL")
    if _PRN_RE.search(combined):
        prof.is_prn = True
    if _BEDTIME_RE.search(combined):
        prof.is_bedtime = True
        prof.slots.add("PM")

    return prof


# ---------------------------------------------------------------------------
# 5. Rule 5: Duration & Chronic Retention
# ---------------------------------------------------------------------------

_DURATION_RE = re.compile(
    r"(?:(?:for|x|in|after)\s+)?(\d+(?:\.\d+)?)\s*"
    r"(days?|d|weeks?|wks?|wk|months?|mos?|mo|दिन|हफ्ते|हफ़्ते|सप्ताह|महीने|महीना|din|hafte|hafta|mahine|maheene)"
    r"(?![\w\u0900-\u0963\u0966-\u097F])",
    re.I,
)
_DO_NOT_STOP_RE = re.compile(
    r"\b(?:do\s+not\s+stop(?:\s+(?:abruptly|suddenly))?|don'?t\s+stop(?:\s+(?:abruptly|suddenly))?|"
    r"never\s+stop|continue\s+without\s+stopping|without\s+(?:skipping\s+or\s+)?stopping(?:\s+suddenly)?|"
    r"lifelong|band\s+(?:na|mat)\s+karein|achanak\s+band\s+na\s+karein|jaari\s+rakhein)\b|"
    r"बंद\s+(?:न|मत)\s*करें|अचानक\s+बंद\s+(?:न|मत)\s*करें|नियमित\s+जारी\s+रखें",
    re.I,
)


@dataclass(frozen=True)
class DurationItem:
    unit: str  # "days" | "months"
    count: Decimal
    raw: str


def _extract_durations(norm_text: str, structured_meds: list[dict[str, Any]] | None = None) -> tuple[list[DurationItem], bool]:
    combined = norm_text
    if structured_meds:
        for item in structured_meds:
            if isinstance(item, dict):
                for k in ("duration", "duration_text", "warnings"):
                    val = item.get(k)
                    if isinstance(val, str):
                        combined += " " + _normalize_text(val)
                    elif isinstance(val, list):
                        combined += " " + " ".join(_normalize_text(str(x)) for x in val)

    items: list[DurationItem] = []
    for m in _DURATION_RE.finditer(combined):
        raw_unit = m.group(2).lower()
        # Avoid false match on "d" in "100 mg/dL" or "Vitamin D"
        if raw_unit == "d":
            # Only treat bare "d" as days when preceded by "x " or "for " or digits without slash
            prefix = combined[max(0, m.start() - 5) : m.start()].lower()
            if not re.search(r"(?:x|for)\s*$", prefix) and not re.search(r"^\d+d$", m.group(0).lower()):
                continue
        val = _to_decimal(m.group(1))
        if val is None:
            continue
        if raw_unit in {"w", "wk", "wks", "week", "weeks", "हफ्ते", "हफ़्ते", "सप्ताह", "hafte", "hafta"}:
            items.append(DurationItem(unit="days", count=val * Decimal(7), raw=m.group(0).strip()))
        elif raw_unit in {"mo", "mos", "month", "months", "महीने", "महीना", "mahine", "maheene"}:
            items.append(DurationItem(unit="months", count=val, raw=m.group(0).strip()))
        else:
            items.append(DurationItem(unit="days", count=val, raw=m.group(0).strip()))

    do_not_stop = bool(_DO_NOT_STOP_RE.search(combined))
    return items, do_not_stop


# ---------------------------------------------------------------------------
# 6. Rule 6: Route of Administration
# ---------------------------------------------------------------------------

_ROUTE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("ophthalmic", re.compile(r"\b(?:ophthalmic|eye\s+drops?|in\s+(?:the\s+)?(?:right|left|both)?\s*eyes?|into\s+(?:the\s+)?eyes?)\b|आंख\s*में|आँख\s*में|आंखों\s*में|\baankh(?:on)?\s+mei?n\b", re.I)),
    ("otic", re.compile(r"\b(?:otic|ear\s+drops?|in\s+(?:the\s+)?(?:right|left|both)?\s*ears?|into\s+(?:the\s+)?ears?)\b|कान\s*में|कानों\s*में|\bkaan(?:on)?\s+mei?n\b", re.I)),
    ("nasal", re.compile(r"\b(?:intranasal(?:ly)?|route\s*[:=-]?\s*nasal|nasal\s+(?:spray|sprays|drops?|solution|mist|rinse|wash|gel|ointment|route|administration)|(?:in|into)\s+(?:the\s+|each\s+|both\s+)?(?:nose|nostrils?)|via\s+(?:the\s+)?nose)\b|नाक\s*में|\bnaak\s+mei?n\b", re.I)),
    ("sublingual", re.compile(r"\b(?:sublingual|under\s+(?:the\s+)?tongue)\b|जीभ\s+के\s+नीचे|\bjeebh\s+ke\s+neeche\b", re.I)),
    ("inhaled", re.compile(r"\b(?:inhaler|inhaled|nebulizer|nebulization|inhale|inhaler\s+se)\b|सांस\s+से|इन्हेलर", re.I)),
    ("topical", re.compile(r"\b(?:topical(?:ly)?|apply\s+(?:on|to)\s+skin|external\s+use|ointment|cream|gel|lotion|twacha\s+par|skin\s+par)\b|त्वचा\s+पर", re.I)),
    ("iv", re.compile(r"\b(?:intravenous|IV|into\s+vein)\b|नस\s+में", re.I)),
    ("im", re.compile(r"\b(?:intramuscular|IM|into\s+muscle)\b|मांसपेशी\s+में", re.I)),
    ("sc", re.compile(r"\b(?:subcutaneous|SubQ|under\s+(?:the\s+)?skin)\b|\bSC\b", re.I)),
    ("rectal", re.compile(r"\b(?:rectal(?:ly)?|suppository|enema)\b", re.I)),
    ("vaginal", re.compile(r"\b(?:vaginal(?:ly)?|pessary)\b", re.I)),
    ("oral", re.compile(r"\b(?:oral(?:ly)?|by\s+mouth|swallow(?:ed)?|mun?h\s+se|nigalke)\b|\bPO\b|मुंह\s+से|निगल", re.I)),
]


_CANONICAL_ROUTES: frozenset[str] = frozenset(name for name, _ in _ROUTE_PATTERNS)


def _extract_routes(text: str, structured_meds: list[dict[str, Any]] | None = None) -> set[str]:
    routes: set[str] = set()
    combined = text
    if structured_meds:
        for item in structured_meds:
            if isinstance(item, dict) and isinstance(item.get("route"), str):
                raw_rt = item["route"].strip().lower()
                if raw_rt in _CANONICAL_ROUTES:
                    routes.add(raw_rt)
                else:
                    combined += " " + raw_rt

    for route_name, pat in _ROUTE_PATTERNS:
        if pat.search(combined):
            routes.add(route_name)
    return routes


# ---------------------------------------------------------------------------
# 7. Rule 7: Calendar Dates & Relative Timelines
# ---------------------------------------------------------------------------

_MONTH_MAP: dict[str, int] = {
    "jan": 1, "january": 1, "जनवरी": 1,
    "feb": 2, "february": 2, "फरवरी": 2,
    "mar": 3, "march": 3, "मार्च": 3,
    "apr": 4, "april": 4, "अप्रैल": 4,
    "may": 5, "मई": 5,
    "jun": 6, "june": 6, "जून": 6,
    "jul": 7, "july": 7, "जुलाई": 7,
    "aug": 8, "august": 8, "अगस्त": 8,
    "sep": 9, "sept": 9, "september": 9, "सितंबर": 9,
    "oct": 10, "october": 10, "अक्टूबर": 10,
    "nov": 11, "november": 11, "नवंबर": 11,
    "dec": 12, "december": 12, "दिसंबर": 12,
}

_ISO_DATE_RE = re.compile(r"\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b")
_DMY_SLASH_RE = re.compile(r"\b(0?[1-9]|[12]\d|3[01])/(0?[1-9]|1[0-2])/(20\d{2})\b")
_MDY_INVALID_DMY_RE = re.compile(r"\b(0?[1-9]|1[0-2])/(1[3-9]|2\d|3[01])/(20\d{2})\b")
_NAMED_DATE_1_RE = re.compile(
    r"\b(0?[1-9]|[12]\d|3[01])\s+(" + "|".join(re.escape(k) for k in _MONTH_MAP) + r")(?:\s*,?\s*(20\d{2}))?\b",
    re.I,
)
_NAMED_DATE_2_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in _MONTH_MAP) + r")\s+(0?[1-9]|[12]\d|3[01])(?:\s*,?\s*(20\d{2}))?\b",
    re.I,
)
_RELATIVE_DATE_RE = re.compile(
    r"(?:(?:after|in|within)\s+(\d+)\s+(days?|weeks?|months?)|"
    r"(\d+)\s*(दिन|हफ्ते|हफ़्ते|महीने|din|hafte|mahine)\s*(?:बाद|baad|में|mein))",
    re.I,
)


@dataclass(frozen=True)
class CalendarDate:
    year: int | None
    month: int
    day: int
    raw: str


def _extract_dates(norm_text: str) -> tuple[list[CalendarDate], list[DurationItem]]:
    dates: list[CalendarDate] = []
    for m in _ISO_DATE_RE.finditer(norm_text):
        dates.append(CalendarDate(int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(0)))

    for m in _DMY_SLASH_RE.finditer(norm_text):
        dates.append(CalendarDate(int(m.group(3)), int(m.group(2)), int(m.group(1)), m.group(0)))

    # Catch US MM/DD/YYYY dates where DD > 12 (e.g. 11/24/2026)
    for m in _MDY_INVALID_DMY_RE.finditer(norm_text):
        cand = CalendarDate(int(m.group(3)), int(m.group(1)), int(m.group(2)), m.group(0))
        if cand not in dates:
            dates.append(cand)

    for m in _NAMED_DATE_1_RE.finditer(norm_text):
        mon = _MONTH_MAP[m.group(2).lower()]
        yr = int(m.group(3)) if m.group(3) else None
        dates.append(CalendarDate(yr, mon, int(m.group(1)), m.group(0)))

    for m in _NAMED_DATE_2_RE.finditer(norm_text):
        mon = _MONTH_MAP[m.group(1).lower()]
        yr = int(m.group(3)) if m.group(3) else None
        dates.append(CalendarDate(yr, mon, int(m.group(2)), m.group(0)))

    rel_offsets: list[DurationItem] = []
    for m in _RELATIVE_DATE_RE.finditer(norm_text):
        cnt = _to_decimal(m.group(1) or m.group(3) or "0")
        unit_raw = (m.group(2) or m.group(4) or "").lower()
        if cnt is None or cnt <= 0:
            continue
        if unit_raw in {"week", "weeks", "हफ्ते", "हफ़्ते", "hafte"}:
            rel_offsets.append(DurationItem("days", cnt * Decimal(7), m.group(0).strip()))
        elif unit_raw in {"month", "months", "महीने", "mahine"}:
            rel_offsets.append(DurationItem("months", cnt, m.group(0).strip()))
        else:
            rel_offsets.append(DurationItem("days", cnt, m.group(0).strip()))

    return dates, rel_offsets


# ---------------------------------------------------------------------------
# 8. Rule 8: Measurements & Vitals
# ---------------------------------------------------------------------------

_BP_RE = re.compile(
    r"(?:\b(?:bp|blood\s*pressure)|रक्तचाप|बीपी)\s*[:=-]?\s*(\d{2,3})\s*/\s*(\d{2,3})(?:\s*mm\s*hg)?|"
    r"\b(\d{2,3})\s*/\s*(\d{2,3})\s*mm\s*hg\b",
    re.I,
)
_TEMP_RE = re.compile(
    r"(\d{2,3}(?:\.\d+)?)\s*(?:°\s*([FC])|deg(?:ree)?s?\s*([FC])|([FC])\b|fahrenheit|celsius|डिग्री\s*(?:फारेनहाइट|सेल्सियस))",
    re.I,
)
_SPO2_RE = re.compile(
    r"(?:\b(?:spo2|o2\s*sat(?:uration)?|oxygen\s*(?:saturation|level)?)|एसपीओ2)\s*[:=-]?\s*(\d{2,3}(?:\.\d+)?)\s*%?",
    re.I,
)
_HR_RE = re.compile(
    r"(?:\b(?:hr|heart\s*rate|pulse(?:\s*rate)?|pr)|नब्ज़)\s*[:=-]?\s*(\d{2,3})\s*(?:bpm|/min)?|"
    r"\b(\d{2,3})\s*bpm\b",
    re.I,
)


@dataclass
class VitalsSnapshot:
    bp: list[tuple[int, int]] = field(default_factory=list)
    temps: list[tuple[Decimal, str]] = field(default_factory=list)  # (value, "F"|"C")
    spo2: list[Decimal] = field(default_factory=list)
    hr: list[int] = field(default_factory=list)


def _extract_vitals(norm_text: str, structured_vitals: dict[str, Any] | None = None) -> VitalsSnapshot:
    combined = norm_text
    if structured_vitals and isinstance(structured_vitals, dict):
        combined += " " + " ".join(
            f"{k} {_normalize_text(str(v))}" for k, v in structured_vitals.items() if v is not None
        )

    snap = VitalsSnapshot()
    for m in _BP_RE.finditer(combined):
        sys_s = m.group(1) or m.group(3)
        dia_s = m.group(2) or m.group(4)
        if sys_s and dia_s:
            sys_v, dia_v = int(sys_s), int(dia_s)
            if 50 <= sys_v <= 280 and 30 <= dia_v <= 180 and sys_v > dia_v:
                pair = (sys_v, dia_v)
                if pair not in snap.bp:
                    snap.bp.append(pair)

    for m in _TEMP_RE.finditer(combined):
        val = _to_decimal(m.group(1))
        if val is None:
            continue
        raw_full = m.group(0).lower()
        unit_char = (m.group(2) or m.group(3) or m.group(4) or "").upper()
        if not unit_char:
            if "fahrenheit" in raw_full or "फारेनहाइट" in raw_full:
                unit_char = "F"
            elif "celsius" in raw_full or "सेल्सियस" in raw_full:
                unit_char = "C"
        if unit_char == "F" and Decimal(90) <= val <= Decimal(112):
            if (val, "F") not in snap.temps:
                snap.temps.append((val, "F"))
        elif unit_char == "C" and Decimal(32) <= val <= Decimal(44):
            if (val, "C") not in snap.temps:
                snap.temps.append((val, "C"))

    for m in _SPO2_RE.finditer(combined):
        val = _to_decimal(m.group(1))
        if val is not None and Decimal(50) <= val <= Decimal(100):
            if val not in snap.spo2:
                snap.spo2.append(val)

    for m in _HR_RE.finditer(combined):
        val_s = m.group(1) or m.group(2)
        if val_s:
            hr_v = int(val_s)
            if 25 <= hr_v <= 250 and hr_v not in snap.hr:
                snap.hr.append(hr_v)

    return snap


def _temps_equivalent(t1: tuple[Decimal, str], t2: tuple[Decimal, str]) -> bool:
    v1, u1 = t1
    v2, u2 = t2
    if u1 == u2:
        return v1 == v2
    if u1 == "F" and u2 == "C":
        c_expected = (float(v1) - 32.0) * 5.0 / 9.0
        return abs(c_expected - float(v2)) <= 0.2
    if u1 == "C" and u2 == "F":
        f_expected = float(v1) * 9.0 / 5.0 + 32.0
        return abs(f_expected - float(v2)) <= 0.3
    return False


# ---------------------------------------------------------------------------
# 9. Rule 9: Lab Values & Indian Lakh Scale
# ---------------------------------------------------------------------------

_LAB_ANALYTES: dict[str, str] = {
    "hba1c": "hba1c", "a1c": "hba1c", "एचबीए1सी": "hba1c",
    "serum creatinine": "creatinine", "s. creatinine": "creatinine", "creatinine": "creatinine", "क्रिएटिनिन": "creatinine",
    "hemoglobin": "hemoglobin", "haemoglobin": "hemoglobin", "hb": "hemoglobin", "हीमोग्लोबिन": "hemoglobin",
    "platelets": "platelets", "platelet count": "platelets", "platelet": "platelets", "प्लेटलेट्स": "platelets", "प्लेटलेट": "platelets",
    "wbc": "wbc", "tlc": "wbc", "rbc": "rbc",
    "tsh": "tsh", "t3": "t3", "t4": "t4",
    "fasting plasma glucose": "glucose", "fasting glucose": "glucose", "glucose": "glucose",
    "cholesterol": "cholesterol", "ldl": "ldl", "hdl": "hdl", "triglycerides": "triglycerides",
    "sgot": "sgot", "ast": "sgot", "sgpt": "sgpt", "alt": "sgpt",
    "bilirubin": "bilirubin", "urea": "urea", "bun": "bun",
    "sodium": "sodium", "potassium": "potassium", "egfr": "egfr",
    "esr": "esr", "crp": "crp", "vitamin d": "vitamin_d", "vitamin b12": "vitamin_b12",
    "ferritin": "ferritin", "uric acid": "uric_acid", "inr": "inr",
}

_ANALYTE_ALT = "|".join(sorted((re.escape(k) for k in _LAB_ANALYTES), key=len, reverse=True))
_LAB_VALUE_RE = re.compile(
    rf"(?<![\w\u0900-\u0963\u0966-\u097F])({_ANALYTE_ALT})(?![\w\u0900-\u0963\u0966-\u097F])\s*(?:is|was|:|=|-)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*"
    r"(%|mg/dl|g/dl|mmol/l|u/l|iu/l|miu/l|uiu/ml|ng/ml|pg/ml|meq/l|lakh|lakhs|lac|लाख|/cu\.?\s*mm|cells/ul|mm/hr)?",
    re.I,
)
_LAKH_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|लाख)", re.I)


@dataclass(frozen=True)
class LabMeasurement:
    analyte: str
    value: Decimal
    unit: str


def _extract_labs(
    norm_text: str, structured_source: dict[str, Any] | None = None
) -> tuple[list[LabMeasurement], list[Decimal]]:
    labs: list[LabMeasurement] = []
    lakh_values: list[Decimal] = []

    for m in _LAKH_RE.finditer(norm_text):
        dec = _to_decimal(m.group(1))
        if dec is not None:
            lakh_values.append(dec * Decimal(100000))

    # Also detect expanded Indian/standard large platelet-scale numbers (e.g. 1,20,000 or 120000)
    for m in re.finditer(r"\b(\d{1,2},\d{2},\d{3}|\d{5,7})\b", norm_text):
        dec = _to_decimal(m.group(1))
        if dec is not None and dec >= Decimal(10000):
            if dec not in lakh_values:
                lakh_values.append(dec)

    for m in _LAB_VALUE_RE.finditer(norm_text):
        analyte = _LAB_ANALYTES[m.group(1).lower()]
        raw_num = m.group(2)
        unit_raw = (m.group(3) or "").lower().replace(" ", "")
        dec = _to_decimal(raw_num)
        if dec is None:
            continue
        if unit_raw in {"lakh", "lakhs", "lac", "लाख"}:
            dec = dec * Decimal(100000)
            unit_raw = ""
        labs.append(LabMeasurement(analyte=analyte, value=dec, unit=unit_raw))

    if structured_source and isinstance(structured_source, dict):
        for key in ("tests", "labs"):
            test_list = structured_source.get(key)
            if isinstance(test_list, list):
                for item in test_list:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name", "")).strip().lower()
                    val_str = str(item.get("value", "")).strip()
                    unit_str = str(item.get("unit", "")).strip().lower().replace(" ", "")
                    analyte = _LAB_ANALYTES.get(name, name)
                    dec = _to_decimal(val_str)
                    if analyte and dec is not None:
                        if unit_str in {"lakh", "lakhs", "lac", "लाख"}:
                            dec = dec * Decimal(100000)
                            unit_str = ""
                        cand = LabMeasurement(analyte=analyte, value=dec, unit=unit_str)
                        if cand not in labs:
                            labs.append(cand)

    return labs, lakh_values


# ---------------------------------------------------------------------------
# 10. Rule 10: Qualitative Findings & Sliding-Window Negations
# ---------------------------------------------------------------------------

_POS_FINDING_RE = re.compile(r"\b(?:positive|reactive|detected)\b|पॉजिटिव|पाया\s+गया", re.I)
_NEG_FINDING_RE = re.compile(r"\b(?:non-?reactive|not\s+detected|negative)\b|निगेटिव|नहीं\s+पाया\s+गया", re.I)

_NEGATED_CONCEPT_ALIASES: dict[str, list[str]] = {
    "fever": ["fever", "bukhar", "बुखार"],
    "chest_pain": ["chest pain", "seene mein dard", "सीने में दर्द"],
    "breathing_difficulty": ["shortness of breath", "breathing difficulty", "trouble breathing", "sob", "saans", "सांस"],
    "alcohol": ["alcohol", "sharab", "daaru", "शराब"],
    "milk": ["milk", "dairy", "doodh", "दूध"],
    "driving": ["drive", "driving", "operate machinery", "gaadi", "गाड़ी"],
    "nsaids": ["nsaids", "nsaid", "painkillers", "दर्द की दवा"],
    "smoking": ["smoking", "smoke", "tobacco", "dhumrapan", "धूम्रपान"],
    "stop_abruptly": ["stop abruptly", "stop suddenly", "stop taking", "discontinue", "band", "बंद"],
}

_EN_LEFT_NEG_RE = re.compile(
    r"(?:\b(?:no|not|never|avoid|do\s+not|don'?t|does\s+not|without|denies|denied|"
    r"absent|ruled\s+out|negative\s+for|free\s+of|prohibited|contraindicated)\b|"
    r"नहीं|मत|मना(?:\s+है)?|बिना|न|रहित)\s*(?:\S+\s+){0,5}$",
    re.I,
)
_HI_RIGHT_NEG_RE = re.compile(
    r"^\s*(?:\S+\s+){0,4}?"
    r"(?:\b(?:nahi|nahin|mat|na|mana(?:\s+hai)?|bina|band|bachein|bachna|parhez|absent|ruled\s+out|negative)\b|"
    r"नहीं|मत|मना(?:\s+है)?|बिना|बंद|बचें|बचना|परहेज|ना|न|अनुपस्थित)",
    re.I,
)
_CLAUSE_BOUND_RE = re.compile(r"[.!?\n;।—–,]+")


def _subclause_bounds(text: str, pos: int, end: int) -> tuple[str, int, int]:
    start_b = 0
    for m in _CLAUSE_BOUND_RE.finditer(text):
        if m.end() <= pos:
            start_b = m.end()
        elif m.start() >= end:
            end_b = m.start()
            break
    else:
        end_b = len(text)
    return text[start_b:end_b], pos - start_b, end - start_b


def _extract_concept_polarities(
    text: str, extra_meds: set[str] | None = None
) -> dict[str, set[str]]:
    """Map clinical concepts & medicines to observed polarities {'NEGATED', 'AFFIRMED'}."""
    concept_map: dict[str, list[str]] = {k: list(v) for k, v in _NEGATED_CONCEPT_ALIASES.items()}
    if extra_meds:
        for med in extra_meds:
            aliases = CANONICAL_MEDICINE_ALIASES.get(med, [med])
            concept_map[f"med:{med}"] = aliases

    polarities: dict[str, set[str]] = {}
    for concept, aliases in concept_map.items():
        pat = re.compile(
            "|".join(rf"(?<![\w\u0900-\u0963\u0966-\u097F]){re.escape(a)}(?![\w\u0900-\u0963\u0966-\u097F])" for a in aliases),
            re.I,
        )
        for m in pat.finditer(text):
            clause, rel_s, rel_e = _subclause_bounds(text, m.start(), m.end())
            prefix = clause[:rel_s]
            suffix = clause[rel_e:]
            is_neg = bool(_EN_LEFT_NEG_RE.search(prefix) or _HI_RIGHT_NEG_RE.search(suffix))
            pol = "NEGATED" if is_neg else "AFFIRMED"
            polarities.setdefault(concept, set()).add(pol)
    return polarities


def _extract_qualitative_findings(text: str) -> dict[str, Any]:
    """Extract qualitative positive/negative counts and clause-subject pairs."""
    pos_hits = len(_POS_FINDING_RE.findall(text))
    neg_hits = len(_NEG_FINDING_RE.findall(text))
    not_det = len(re.findall(r"\bnot\s+detected\b", text, re.I))
    pos_hits = max(0, pos_hits - not_det)

    paired: dict[str, str] = {}
    for m in _NEG_FINDING_RE.finditer(text):
        clause, rel_s, _ = _subclause_bounds(text, m.start(), m.end())
        subject = re.sub(r"[:=\-\s]+$", "", clause[:rel_s]).strip().lower()
        words = subject.split()[-3:]
        if words:
            paired[" ".join(words)] = "NEGATIVE"
    for m in _POS_FINDING_RE.finditer(text):
        clause, rel_s, _ = _subclause_bounds(text, m.start(), m.end())
        prefix = clause[:rel_s].lower()
        if prefix.rstrip().endswith("not"):
            continue
        subject = re.sub(r"[:=\-\s]+$", "", prefix).strip()
        words = subject.split()[-3:]
        if words:
            key = " ".join(words)
            paired.setdefault(key, "POSITIVE")

    return {"positive": pos_hits, "negative": neg_hits, "paired": paired}


# ---------------------------------------------------------------------------
# 11. Rule 11: Allergies & NKDA Parity
# ---------------------------------------------------------------------------

_NKDA_RE = re.compile(
    r"\b(?:NKDA|no\s+known\s+(?:drug\s+)?allerg(?:y|ies)|no\s+(?:drug\s+)?allerg(?:y|ies)|"
    r"kisi\s+(?:bhi\s+)?dawai\s+se\s+allergy\s+nahi)\b|"
    r"कोई\s+(?:दवा\s+)?एलर्जी\s+नहीं",
    re.I,
)
_ALLERGY_EN_RE = re.compile(
    r"\b(?:allergic\s+to|allergy\s*(?:to|:|-))\s+([A-Za-z][A-Za-z0-9\s/-]{1,30}?)(?=[.,;\n]|$|\band\b|\bdo\b|\bavoid\b)",
    re.I,
)
_ALLERGY_HI_HINGLISH_RE = re.compile(
    r"\b([A-Za-z][A-Za-z0-9-]{2,25})\s+se\s+allergy\b|एलर्जी\s*:\s*([^\n.,;।]+)",
    re.I,
)


def _extract_allergies(text: str, structured_source: dict[str, Any] | None = None) -> tuple[set[str], bool]:
    allergens: set[str] = set()
    has_nkda = bool(_NKDA_RE.search(text))

    for m in _ALLERGY_EN_RE.finditer(text):
        sub = m.group(1).strip(" .,:;")
        if sub.lower() not in {"none", "nil", "no", "unknown"}:
            allergens.add(_canonicalize_medicine_name(sub))

    for m in _ALLERGY_HI_HINGLISH_RE.finditer(text):
        sub = (m.group(1) or m.group(2) or "").strip(" .,:;")
        if sub:
            allergens.add(_canonicalize_medicine_name(sub))

    if structured_source and isinstance(structured_source, dict):
        raw_all = structured_source.get("allergies")
        if isinstance(raw_all, str):
            if _NKDA_RE.search(raw_all):
                has_nkda = True
            else:
                allergens.add(_canonicalize_medicine_name(raw_all))
        elif isinstance(raw_all, list):
            for entry in raw_all:
                if isinstance(entry, str) and entry.strip():
                    if _NKDA_RE.search(entry):
                        has_nkda = True
                    else:
                        allergens.add(_canonicalize_medicine_name(entry))
                elif isinstance(entry, dict):
                    sub = str(entry.get("substance") or entry.get("allergen") or "").strip()
                    pol = str(entry.get("polarity") or "ALLERGIC").upper()
                    if sub and pol == "ALLERGIC":
                        allergens.add(_canonicalize_medicine_name(sub))

    return allergens, has_nkda


# ---------------------------------------------------------------------------
# 12. Rule 12: Warnings
# ---------------------------------------------------------------------------

_MAX_LIMIT_RE = re.compile(
    r"(?:\b(?:max(?:imum)?|do\s+not\s+exceed|never\s+(?:take\s+)?more\s+than|do\s+not\s+take\s+more\s+than|"
    r"never\s+exceed|not\s+more\s+than|up\s+to)\s+(\d+)\s+"
    r"(?:tablets?|tabs?|capsules?|caps?|puffs?|drops?|doses?|mg|goli|goliyan)|"
    r"(\d+)\s+(?:se\s+(?:zyada|adhik)|से\s+(?:ज्यादा|अधिक))\s+(?:goli|goliyan|गोली|गोलियां|tablets?)|"
    r"अधिकतम\s+(\d+)\s*(?:गोली|गोलियां|tablets?))",
    re.I,
)

_WARNING_PATTERNS: dict[str, tuple[re.Pattern[str], str]] = {
    "avoid_alcohol": (
        re.compile(r"\b(?:avoid\s+alcohol|no\s+alcohol|do\s+not\s+(?:drink|take\s+with)\s+alcohol|sharab\s+(?:bilkul\s+)?(?:na|mat)\s+(?:piy|l)\w*|sharab\s+se\s+bach(?:ein|na|e|o)?)\b|शराब\s+(?:न\s+पिएं|से\s+बचें|मना)", re.I),
        "blocker",
    ),
    "do_not_drive": (
        re.compile(r"\b(?:do\s+not\s+drive|avoid\s+driving|do\s+not\s+operate\s+machinery|may\s+cause\s+drowsiness|gaadi\s+(?:na|mat)\s+chalayein|driving\s+na\s+karein)\b|गाड़ी\s+(?:न|मत)\s*चलाएं", re.I),
        "blocker",
    ),
    "do_not_stop_abruptly": (
        _DO_NOT_STOP_RE,
        "blocker",
    ),
    "complete_course": (
        re.compile(r"\b(?:complete\s+(?:the\s+)?(?:full\s+)?course|finish\s+all\s+(?:tablets|doses)|poora\s+course\s+karein)\b|पूरा\s+कोर्स", re.I),
        "blocker",
    ),
    "keep_refrigerated": (
        re.compile(r"\b(?:keep\s+refrigerated|store\s+in\s+(?:a\s+)?(?:fridge|refrigerator)|fridge\s+mei?n\s+rakhein)\b|फ्रिज\s+में\s+रखें", re.I),
        "warning",
    ),
    "plenty_of_water": (
        re.compile(r"\b(?:plenty\s+of\s+water|drink\s+(?:lots|plenty)\s+of\s+water|zyada\s+paani\s+piy\w*)\b|खूब\s+पानी\s+पिएं", re.I),
        "warning",
    ),
}


def _extract_warnings(
    norm_text: str, structured_meds: list[dict[str, Any]] | None = None
) -> tuple[dict[str, str], list[int]]:
    combined = norm_text
    if structured_meds:
        for item in structured_meds:
            if isinstance(item, dict) and isinstance(item.get("warnings"), list):
                combined += " " + " ".join(_normalize_text(str(w)) for w in item["warnings"])

    found: dict[str, str] = {}
    for w_name, (pat, sev) in _WARNING_PATTERNS.items():
        if pat.search(combined):
            found[w_name] = sev

    max_limits: list[int] = []
    for m in _MAX_LIMIT_RE.finditer(combined):
        num_s = m.group(1) or m.group(2) or m.group(3)
        if num_s:
            max_limits.append(int(num_s))

    return found, max_limits


# ---------------------------------------------------------------------------
# 13. Rule 13: Follow-up Instructions
# ---------------------------------------------------------------------------

_FOLLOWUP_TIMELINE_RE = re.compile(
    r"(?:\b(?:follow\s*-?\s*up|review|return|come\s+back|visit\s+(?:again|clinic|doctor))\s+"
    r"(?:in|after)\s+(\d+)\s+(days?|weeks?|months?)|"
    r"(\d+)\s*(दिन|हफ्ते|हफ़्ते|महीने|din|hafte|mahine)\s*(?:बाद|baad)\s*(?:\S+\s+){0,2}?(?:दिखाएं|आएं|चेकअप|फॉलो|dikhayein|aayein|follow\s*-?\s*up))",
    re.I,
)
_RETURN_WORSENS_RE = re.compile(
    r"\b(?:return|sooner|seek\s+(?:urgent\s+|immediate\s+)?care|contact\s+doctor)\s+(?:if|when)\b|"
    r"\b(?:symptoms?\s+worsen|breathing\s+difficulty|trouble\s+breathing|high\s+fever\s+persists)\b|"
    r"(?:लक्षण\s+(?:बढ़ें|बिगड़ें|ज्यादा)|तबीयत\s+(?:बिगड़े|खराब)|सांस\s+(?:लेने\s+)?में\s+(?:दिक्कत|तकलीफ)\s+हो\s+तो|(?:तुरंत|जल्दी|फौरन)\s+(?:दिखाएं|आएं|डॉक्टर))|"
    r"\b(?:lakshan\s+(?:badhein|bigde)|tabiyat\s+bigde|(?:turant|jaldi|foran)\s+(?:dikhayein|aayein|wapas\s+aayein|doctor\s+(?:ko\s+dikhayein|se\s+milein))|saans\s+(?:lene\s+)?mei?n\s+(?:dikkat|takleef)(?:\s+ho)?)\b",
    re.I,
)
_TESTS_ADVISED_RE = re.compile(
    r"\b(?:tests?\s+advised|advised\s+tests?|(?:cbc|x-?ray|chest\s+x-?ray|blood\s+test|hba1c|creatinine|lipid\s+profile|ecg|ultrasound)\s+advised|"
    r"repeat\s+(?:cbc|hba1c|creatinine|blood\s+test|x-?ray)|jaanch\s+karayein)\b|"
    r"जांच\s+कराएं|एक्स-रे",
    re.I,
)


def _extract_followup(
    norm_text: str, structured_source: dict[str, Any] | None = None
) -> dict[str, Any]:
    combined = norm_text
    if structured_source and isinstance(structured_source, dict):
        fu = structured_source.get("follow_up")
        if isinstance(fu, str):
            combined += " " + _normalize_text(fu)

    timelines: list[DurationItem] = []
    for m in _FOLLOWUP_TIMELINE_RE.finditer(combined):
        cnt = _to_decimal(m.group(1) or m.group(3) or "0")
        unit_raw = (m.group(2) or m.group(4) or "").lower()
        if cnt is None or cnt <= 0:
            continue
        if unit_raw in {"week", "weeks", "हफ्ते", "हफ़्ते", "hafte"}:
            timelines.append(DurationItem("days", cnt * Decimal(7), m.group(0).strip()))
        elif unit_raw in {"month", "months", "महीने", "mahine"}:
            timelines.append(DurationItem("months", cnt, m.group(0).strip()))
        else:
            timelines.append(DurationItem("days", cnt, m.group(0).strip()))

    return {
        "timelines": timelines,
        "has_return_worsens": bool(_RETURN_WORSENS_RE.search(combined)),
        "has_tests_advised": bool(_TESTS_ADVISED_RE.search(combined)),
    }


# ---------------------------------------------------------------------------
# Main Comparison Engine across ALL 13 Rules
# ---------------------------------------------------------------------------

def _mismatch(
    rule_id: str,
    category: str,
    severity: str,
    field_name: str,
    source_value: str,
    output_value: str,
    message: str,
) -> dict[str, str]:
    return {
        "rule_id": rule_id,
        "category": category,
        "severity": severity,
        "field": field_name,
        "source_value": source_value,
        "output_value": output_value,
        "message": message,
    }


def check_instruction_integrity(
    source_text: str,
    output_text: str,
    structured_source: dict | None = None,
    output_language: str = "en",
) -> dict:
    """Deterministically verify all 13 critical medical fields between source and output.

    Zero LLM calls. Compares medicines (with LASA anti-fuzzy guard), dosages, units,
    frequencies, durations, routes, dates, vitals, lab values, negations/findings,
    allergies, warnings, and follow-up instructions across EN, HI, and Hinglish.
    """
    src_raw = source_text or ""
    out_raw = output_text or ""
    src_norm = _normalize_text(src_raw)
    out_norm = _normalize_text(out_raw)

    structured_meds = (
        structured_source.get("medications")
        if isinstance(structured_source, dict) and isinstance(structured_source.get("medications"), list)
        else None
    )
    structured_vitals = (
        structured_source.get("vitals")
        if isinstance(structured_source, dict) and isinstance(structured_source.get("vitals"), dict)
        else None
    )

    mismatches: list[dict[str, str]] = []
    dosage_preserved = True
    frequency_preserved = True
    duration_preserved = True
    measurements_preserved = True
    negation_preserved = True

    # --- Rule 1: Medicine Names & LASA Anti-Fuzzy Guard ---
    src_meds = _extract_medicines(src_raw, structured_meds=structured_meds)
    out_meds = _extract_medicines(out_raw)

    # Identify LASA swaps first
    lasa_handled: set[str] = set()
    for a, b in LASA_PAIRS:
        if a in src_meds and a not in out_meds and b in out_meds and b not in src_meds:
            lasa_handled.update({a, b})
            mismatches.append(
                _mismatch(
                    "RULE-01-LASA",
                    "medicine",
                    "blocker",
                    "medications",
                    a,
                    b,
                    f"LASA drug confusion detected: source specifies '{a}' but output contains look-alike/sound-alike '{b}'.",
                )
            )
        elif b in src_meds and b not in out_meds and a in out_meds and a not in src_meds:
            lasa_handled.update({a, b})
            mismatches.append(
                _mismatch(
                    "RULE-01-LASA",
                    "medicine",
                    "blocker",
                    "medications",
                    b,
                    a,
                    f"LASA drug confusion detected: source specifies '{b}' but output contains look-alike/sound-alike '{a}'.",
                )
            )

    for med in sorted(src_meds - out_meds - lasa_handled):
        mismatches.append(
            _mismatch(
                "RULE-01-MED",
                "medicine",
                "blocker",
                "medications",
                med,
                "<missing>",
                f"Source medicine '{med}' is missing from patient-facing output.",
            )
        )
    for med in sorted(out_meds - src_meds - lasa_handled):
        mismatches.append(
            _mismatch(
                "RULE-01-MED",
                "medicine",
                "blocker",
                "medications",
                "<none>",
                med,
                f"Unapproved medicine '{med}' appears in output without appearing in source instructions.",
            )
        )

    # --- Rule 2 & Rule 3: Dosage & Units ---
    src_doses = _extract_doses(src_norm, structured_meds=structured_meds)
    out_doses = _extract_doses(out_norm)
    out_used_idx: set[int] = set()

    for sd in src_doses:
        # Ignore implicit "1 tablet" only if output has no tablet count, unless sd wasn't 1 tablet?
        # Wait: if source explicitly wrote "1 tablet" or "half tablet" or "2 tablets", check it!
        matched_idx = None
        for idx, od in enumerate(out_doses):
            if idx in out_used_idx:
                continue
            if sd.value == od.value and sd.unit == od.unit:
                matched_idx = idx
                break
        if matched_idx is not None:
            out_used_idx.add(matched_idx)
            continue

        # Check specific failure modes: unit swap (same value, different unit), missing unit, or numeric shift
        unit_swap_match = next(
            (od for idx, od in enumerate(out_doses) if idx not in out_used_idx and sd.value == od.value and sd.unit != od.unit),
            None,
        )
        if unit_swap_match is not None:
            dosage_preserved = False
            if unit_swap_match.unit == "MISSING_UNIT":
                mismatches.append(
                    _mismatch(
                        "RULE-03-UNIT",
                        "units",
                        "blocker",
                        "dosage_unit",
                        sd.raw,
                        unit_swap_match.raw,
                        f"Critical unit omitted in output: expected '{sd.raw}', got '{unit_swap_match.raw}'.",
                    )
                )
            else:
                mismatches.append(
                    _mismatch(
                        "RULE-03-UNIT",
                        "units",
                        "blocker",
                        "dosage_unit",
                        sd.raw,
                        unit_swap_match.raw,
                        f"Unit mismatch detected: expected '{_fmt_dec(sd.value)} {sd.unit}', got '{_fmt_dec(unit_swap_match.value)} {unit_swap_match.unit}'.",
                    )
                )
            continue

        # Cross-unit conversion check (e.g. 50 mcg -> 0.05 mg)
        cross_unit_match = None
        if sd.unit == "mcg":
            cross_unit_match = next(
                (od for od in out_doses if od.unit == "mg" and od.value * Decimal(1000) == sd.value),
                None,
            )
        elif sd.unit == "mg":
            cross_unit_match = next(
                (od for od in out_doses if od.unit == "mcg" and sd.value * Decimal(1000) == od.value),
                None,
            )
        if cross_unit_match is not None:
            dosage_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-03-UNIT",
                    "units",
                    "blocker",
                    "dosage_unit",
                    sd.raw,
                    cross_unit_match.raw,
                    f"Silent cross-unit conversion on drug dose is prohibited: keep '{sd.raw}' verbatim.",
                )
            )
            continue

        # Value mismatch with same unit (e.g. 0.25 mg -> 2.5 mg or 0.5 tablet -> 1 tablet)
        same_unit_other_val = next(
            (od for idx, od in enumerate(out_doses) if idx not in out_used_idx and od.unit == sd.unit),
            None,
        )
        dosage_preserved = False
        if same_unit_other_val is not None:
            mismatches.append(
                _mismatch(
                    "RULE-02-DOSE",
                    "dosage",
                    "blocker",
                    "dosage",
                    sd.raw,
                    same_unit_other_val.raw,
                    f"Dosage mismatch: expected '{sd.raw}', found '{same_unit_other_val.raw}'.",
                )
            )
        else:
            mismatches.append(
                _mismatch(
                    "RULE-02-DOSE",
                    "dosage",
                    "blocker",
                    "dosage",
                    sd.raw,
                    "<missing>",
                    f"Source dosage '{sd.raw}' is missing or altered in output.",
                )
            )

    # Check slot vector quantities (e.g. 2-0-2 vs 1-0-1)
    src_vecs = _extract_slot_vectors(src_norm)
    out_vecs = _extract_slot_vectors(out_norm)
    if src_vecs and out_vecs:
        for sv in src_vecs:
            if sv not in out_vecs:
                # Differentiate slot position flip (1-0-1 vs 1-1-0) from quantity change (2-0-2 vs 1-0-1)
                same_sum_diff_pos = [ov for ov in out_vecs if sum(ov) == sum(sv) and ov != sv]
                if same_sum_diff_pos:
                    frequency_preserved = False
                    mismatches.append(
                        _mismatch(
                            "RULE-04-FREQ",
                            "frequency",
                            "blocker",
                            "schedule_slots",
                            "-".join(_fmt_dec(x) for x in sv),
                            "-".join(_fmt_dec(x) for x in same_sum_diff_pos[0]),
                            "Schedule slot timing mismatch (e.g., morning-night vs morning-afternoon).",
                        )
                    )
                else:
                    dosage_preserved = False
                    frequency_preserved = False
                    mismatches.append(
                        _mismatch(
                            "RULE-02-DOSE",
                            "dosage",
                            "blocker",
                            "schedule_slots",
                            "-".join(_fmt_dec(x) for x in sv),
                            "-".join(_fmt_dec(x) for x in out_vecs[0]),
                            "Slot dosage/frequency vector mismatch between source and output.",
                        )
                    )

    # --- Rule 4: Frequency & Schedule ---
    src_freq = _extract_frequency(src_norm, structured_meds=structured_meds)
    out_freq = _extract_frequency(out_norm)

    for pd in sorted(src_freq.per_day):
        if pd not in out_freq.per_day:
            frequency_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-04-FREQ",
                    "frequency",
                    "blocker",
                    "frequency.per_day",
                    f"{pd} time(s)/day",
                    ",".join(f"{x} time(s)/day" for x in sorted(out_freq.per_day)) or "<missing>",
                    f"Frequency mismatch: expected {pd} time(s) per day.",
                )
            )

    # Slot-position check when output specifies explicit slots (e.g. 1-0-1 vs morning & afternoon)
    if src_freq.slots and out_freq.slots and not src_freq.slots.issubset(out_freq.slots):
        # Allow if output only had per_day without conflicting slot, otherwise block!
        if src_freq.slots != out_freq.slots:
            frequency_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-04-FREQ",
                    "frequency",
                    "blocker",
                    "frequency.slots",
                    "/".join(sorted(src_freq.slots)),
                    "/".join(sorted(out_freq.slots)),
                    f"Time-of-day schedule mismatch: expected {sorted(src_freq.slots)}, got {sorted(out_freq.slots)}.",
                )
            )

    for mr in sorted(src_freq.meal_relations):
        if mr not in out_freq.meal_relations:
            frequency_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-04-FREQ",
                    "frequency",
                    "blocker",
                    "frequency.meal_relation",
                    mr,
                    ",".join(sorted(out_freq.meal_relations)) or "<missing>",
                    f"Meal-timing instruction '{mr}' was altered or dropped.",
                )
            )

    if src_freq.is_prn and not out_freq.is_prn:
        frequency_preserved = False
        mismatches.append(
            _mismatch(
                "RULE-04-FREQ",
                "frequency",
                "blocker",
                "frequency.prn",
                "SOS/PRN (as needed)",
                "<scheduled or missing>",
                "As-needed (SOS/PRN) qualifier was dropped or turned into a fixed schedule.",
            )
        )

    if src_freq.is_bedtime and not out_freq.is_bedtime:
        frequency_preserved = False
        mismatches.append(
            _mismatch(
                "RULE-04-FREQ",
                "frequency",
                "blocker",
                "frequency.bedtime",
                "HS / Bedtime",
                "<missing>",
                "Bedtime (HS) timing instruction is missing in output.",
            )
        )

    # --- Rule 5: Duration ---
    src_durs, src_chronic = _extract_durations(src_norm, structured_meds=structured_meds)
    out_durs, out_chronic = _extract_durations(out_norm)
    for sd_item in src_durs:
        if not any(od.unit == sd_item.unit and od.count == sd_item.count for od in out_durs):
            duration_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-05-DURATION",
                    "duration",
                    "blocker",
                    "duration",
                    sd_item.raw,
                    out_durs[0].raw if out_durs else "<missing>",
                    f"Duration mismatch: expected '{_fmt_dec(sd_item.count)} {sd_item.unit}' (from '{sd_item.raw}').",
                )
            )

    if src_chronic and not out_chronic:
        duration_preserved = False
        mismatches.append(
            _mismatch(
                "RULE-05-DURATION",
                "duration",
                "blocker",
                "duration.chronic_retention",
                "Do not stop abruptly / continue regularly",
                "<missing>",
                "Chronic medication retention instruction ('do not stop abruptly') was omitted or altered.",
            )
        )

    # --- Rule 6: Route of Administration ---
    src_routes = _extract_routes(src_raw, structured_meds=structured_meds)
    out_routes = _extract_routes(out_raw)
    non_oral_src = src_routes - {"oral"}
    non_oral_out = out_routes - {"oral"}

    for rt in sorted(non_oral_src):
        if rt not in out_routes:
            mismatches.append(
                _mismatch(
                    "RULE-06-ROUTE",
                    "route",
                    "blocker",
                    "route",
                    rt,
                    ",".join(sorted(out_routes)) or "<missing>",
                    f"Critical route mismatch: expected '{rt}', got '{','.join(sorted(out_routes)) or 'missing'}'.",
                )
            )
    if "oral" in src_routes and not non_oral_src and non_oral_out:
        mismatches.append(
            _mismatch(
                "RULE-06-ROUTE",
                "route",
                "blocker",
                "route",
                "oral",
                ",".join(sorted(non_oral_out)),
                f"Oral medication was mistranslated to non-oral route '{','.join(sorted(non_oral_out))}'.",
            )
        )

    # --- Rule 7: Dates & Relative Timelines ---
    src_dates, src_rel_dates = _extract_dates(src_norm)
    out_dates, out_rel_dates = _extract_dates(out_norm)
    for sd_dt in src_dates:
        matched_dt = any(
            od.month == sd_dt.month
            and od.day == sd_dt.day
            and (sd_dt.year is None or od.year is None or od.year == sd_dt.year)
            for od in out_dates
        )
        if not matched_dt:
            mismatches.append(
                _mismatch(
                    "RULE-07-DATES",
                    "dates",
                    "blocker",
                    "dates",
                    sd_dt.raw,
                    out_dates[0].raw if out_dates else "<missing>",
                    f"Date mismatch: source date '{sd_dt.raw}' not preserved accurately in output.",
                )
            )

    for srd in src_rel_dates:
        if not any(ord_.unit == srd.unit and ord_.count == srd.count for ord_ in out_rel_dates) and not any(
            od.unit == srd.unit and od.count == srd.count for od in out_durs
        ):
            mismatches.append(
                _mismatch(
                    "RULE-07-DATES",
                    "dates",
                    "blocker",
                    "relative_timeline",
                    srd.raw,
                    out_rel_dates[0].raw if out_rel_dates else "<missing>",
                    f"Relative date timeline '{srd.raw}' missing or altered in output.",
                )
            )

    # --- Rule 8: Measurements & Vitals ---
    src_vitals = _extract_vitals(src_norm, structured_vitals=structured_vitals)
    out_vitals = _extract_vitals(out_norm)

    for bp_pair in src_vitals.bp:
        if bp_pair not in out_vitals.bp:
            measurements_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-08-VITALS",
                    "measurements",
                    "blocker",
                    "vitals.blood_pressure",
                    f"{bp_pair[0]}/{bp_pair[1]} mmHg",
                    f"{out_vitals.bp[0][0]}/{out_vitals.bp[0][1]} mmHg" if out_vitals.bp else "<missing>",
                    f"Blood pressure reading '{bp_pair[0]}/{bp_pair[1]} mmHg' altered or missing.",
                )
            )

    for temp_pair in src_vitals.temps:
        if not any(_temps_equivalent(temp_pair, ot) for ot in out_vitals.temps):
            measurements_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-08-VITALS",
                    "measurements",
                    "blocker",
                    "vitals.temperature",
                    f"{_fmt_dec(temp_pair[0])} °{temp_pair[1]}",
                    f"{_fmt_dec(out_vitals.temps[0][0])} °{out_vitals.temps[0][1]}" if out_vitals.temps else "<missing>",
                    f"Temperature '{_fmt_dec(temp_pair[0])} °{temp_pair[1]}' altered or missing.",
                )
            )

    for spo2_v in src_vitals.spo2:
        if spo2_v not in out_vitals.spo2:
            measurements_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-08-VITALS",
                    "measurements",
                    "blocker",
                    "vitals.spo2",
                    f"SpO2 {_fmt_dec(spo2_v)}%",
                    f"SpO2 {_fmt_dec(out_vitals.spo2[0])}%" if out_vitals.spo2 else "<missing>",
                    f"Oxygen saturation SpO2 '{_fmt_dec(spo2_v)}%' altered or missing.",
                )
            )

    for hr_v in src_vitals.hr:
        if hr_v not in out_vitals.hr:
            measurements_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-08-VITALS",
                    "measurements",
                    "blocker",
                    "vitals.heart_rate",
                    f"HR {hr_v} bpm",
                    f"HR {out_vitals.hr[0]} bpm" if out_vitals.hr else "<missing>",
                    f"Heart rate '{hr_v} bpm' altered or missing.",
                )
            )

    # --- Rule 9: Lab Values & Indian Lakh Scale ---
    src_labs, src_lakhs = _extract_labs(src_norm, structured_source=structured_source)
    out_labs, out_lakhs = _extract_labs(out_norm)

    for lv in src_lakhs:
        if lv not in out_lakhs:
            measurements_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-09-LABS",
                    "lab_values",
                    "blocker",
                    "labs.indian_scale",
                    _fmt_dec(lv),
                    "<missing or truncated>",
                    f"Indian scale lab count '{_fmt_dec(lv)}' (lakh scale) was truncated or omitted.",
                )
            )

    for sl in src_labs:
        exact_lab = any(
            ol.analyte == sl.analyte
            and ol.value == sl.value
            and (not sl.unit or not ol.unit or ol.unit == sl.unit)
            for ol in out_labs
        )
        if not exact_lab:
            measurements_preserved = False
            same_analyte = [ol for ol in out_labs if ol.analyte == sl.analyte]
            actual_str = (
                f"{same_analyte[0].analyte} {_fmt_dec(same_analyte[0].value)} {same_analyte[0].unit}".strip()
                if same_analyte
                else "<missing>"
            )
            mismatches.append(
                _mismatch(
                    "RULE-09-LABS",
                    "lab_values",
                    "blocker",
                    f"labs.{sl.analyte}",
                    f"{sl.analyte} {_fmt_dec(sl.value)} {sl.unit}".strip(),
                    actual_str,
                    f"Lab value precision/unit mismatch for '{sl.analyte}': expected '{_fmt_dec(sl.value)} {sl.unit}'.",
                )
            )

    # --- Rule 10: Positive/Negative Findings, Sliding Negation Window & Contradictions ---
    src_qual = _extract_qualitative_findings(src_norm)
    out_qual = _extract_qualitative_findings(out_norm)
    qual_swapped = any(
        subj in out_qual["paired"] and out_qual["paired"][subj] != pol
        for subj, pol in src_qual["paired"].items()
    )
    if (
        src_qual["positive"] != out_qual["positive"]
        or src_qual["negative"] != out_qual["negative"]
        or qual_swapped
    ):
        if src_qual["positive"] > 0 or src_qual["negative"] > 0:
            negation_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-10-FINDING-POLARITY",
                    "negations",
                    "blocker",
                    "qualitative_findings",
                    f"positive={src_qual['positive']}, negative={src_qual['negative']}",
                    f"positive={out_qual['positive']}, negative={out_qual['negative']}",
                    "Qualitative clinical finding polarity (Positive/Reactive vs Negative/Non-reactive) flipped or omitted.",
                )
            )

    src_pol = _extract_concept_polarities(src_norm, extra_meds=src_meds)
    out_pol = _extract_concept_polarities(out_norm, extra_meds=src_meds)

    for concept, src_pols in src_pol.items():
        if "NEGATED" in src_pols:
            out_pols = out_pol.get(concept, set())
            # Special case: "stop_abruptly" negated in source can be preserved either via negated stop OR chronic retention
            if concept == "stop_abruptly" and out_chronic:
                continue
            if "NEGATED" not in out_pols:
                negation_preserved = False
                mismatches.append(
                    _mismatch(
                        "RULE-10-NEGATION",
                        "negations",
                        "blocker",
                        f"negation.{concept}",
                        f"{concept}: NEGATED",
                        f"{concept}: {'AFFIRMED' if 'AFFIRMED' in out_pols else '<missing>'}",
                        f"Negated instruction for '{concept}' was flipped to affirmed or omitted.",
                    )
                )

    # Cross-field source contradiction check (e.g. prose says "STOP Warfarin" while structured Rx lists Warfarin)
    if structured_meds:
        structured_med_names = {
            _canonicalize_medicine_name(str(m.get("name") or m.get("medicine_name") or ""))
            for m in structured_meds
            if isinstance(m, dict)
        }
        for med in structured_med_names:
            if not med:
                continue
            stop_pat = re.compile(
                rf"\b(?:stop|discontinue|hold|withhold)\s+(?:taking\s+)?(?:tab\.?\s+|tablet\s+)?{re.escape(med)}\b",
                re.I,
            )
            for m in stop_pat.finditer(src_norm):
                clause, rel_s, _ = _subclause_bounds(src_norm, m.start(), m.end())
                if not _EN_LEFT_NEG_RE.search(clause[:rel_s]):
                    negation_preserved = False
                    mismatches.append(
                        _mismatch(
                            "RULE-10-CONTRADICTION",
                            "negations",
                            "blocker",
                            f"contradiction.{med}",
                            f"Structured active Rx: {med} vs Prose: STOP {med}",
                            "<requires doctor reconciliation>",
                            f"Contradictory source instructions for '{med}' (active Rx conflicts with STOP order).",
                        )
                    )

    # --- Rule 11: Allergies & NKDA Parity ---
    src_allergens, src_nkda = _extract_allergies(src_raw, structured_source=structured_source)
    out_allergens, out_nkda = _extract_allergies(out_raw)

    for al in sorted(src_allergens):
        if not re.search(rf"(?<![\w\u0900-\u0963\u0966-\u097F]){re.escape(al)}(?![\w\u0900-\u0963\u0966-\u097F])", out_raw.lower()):
            mismatches.append(
                _mismatch(
                    "RULE-11-ALLERGY",
                    "allergies",
                    "blocker",
                    "allergies",
                    f"Allergic to {al}",
                    "<missing>",
                    f"Recorded allergy '{al}' is missing from patient-facing output.",
                )
            )
        else:
            # Ensure output did not negate the allergy ("no allergy to X" / "allergy nahi")
            al_pol = _extract_concept_polarities(out_norm, extra_meds={al}).get(f"med:{al}", set())
            if "NEGATED" in al_pol and "AFFIRMED" not in al_pol:
                negation_preserved = False
                mismatches.append(
                    _mismatch(
                        "RULE-11-ALLERGY",
                        "allergies",
                        "blocker",
                        "allergies",
                        f"Allergic to {al}",
                        f"Negated allergy for {al}",
                        f"Recorded allergy '{al}' was falsely negated in output.",
                    )
                )

    if src_nkda and not src_allergens:
        if out_allergens:
            negation_preserved = False
            mismatches.append(
                _mismatch(
                    "RULE-11-NKDA",
                    "allergies",
                    "blocker",
                    "allergies",
                    "NKDA (No Known Drug Allergies)",
                    f"Allergic to {', '.join(sorted(out_allergens))}",
                    "Source specifies NKDA (no known drug allergies), but output claims an allergy.",
                )
            )
        elif not out_nkda:
            mismatches.append(
                _mismatch(
                    "RULE-11-NKDA",
                    "allergies",
                    "warning",
                    "allergies",
                    "NKDA",
                    "<omitted>",
                    "Explicit NKDA (No Known Drug Allergies) note was omitted in output.",
                )
            )

    # --- Rule 12: Warnings ---
    src_warnings, src_max_limits = _extract_warnings(src_norm, structured_meds=structured_meds)
    out_warnings, out_max_limits = _extract_warnings(out_norm)

    for w_name, severity in src_warnings.items():
        if w_name not in out_warnings:
            mismatches.append(
                _mismatch(
                    "RULE-12-WARNINGS",
                    "warnings",
                    severity,
                    f"warnings.{w_name}",
                    w_name,
                    "<missing>",
                    f"Clinical warning '{w_name}' from source note was omitted.",
                )
            )

    for max_n in src_max_limits:
        if max_n not in out_max_limits:
            mismatches.append(
                _mismatch(
                    "RULE-12-MAX-LIMIT",
                    "warnings",
                    "blocker",
                    "warnings.max_dose",
                    f"max {max_n}",
                    f"max {out_max_limits[0]}" if out_max_limits else "<missing>",
                    f"Maximum dose limit ('max {max_n}') altered or omitted.",
                )
            )

    # --- Rule 13: Follow-up Instructions ---
    src_fu = _extract_followup(src_norm, structured_source=structured_source)
    out_fu = _extract_followup(out_norm)

    for tl in src_fu["timelines"]:
        if not any(o.unit == tl.unit and o.count == tl.count for o in out_fu["timelines"]) and not any(
            o.unit == tl.unit and o.count == tl.count for o in out_durs
        ):
            mismatches.append(
                _mismatch(
                    "RULE-13-FOLLOWUP",
                    "follow_up",
                    "blocker",
                    "follow_up.timeline",
                    tl.raw,
                    out_fu["timelines"][0].raw if out_fu["timelines"] else "<missing>",
                    f"Follow-up timeline '{tl.raw}' altered or omitted.",
                )
            )

    if src_fu["has_return_worsens"] and not out_fu["has_return_worsens"]:
        mismatches.append(
            _mismatch(
                "RULE-13-FOLLOWUP",
                "follow_up",
                "blocker",
                "follow_up.return_precautions",
                "Return if symptoms worsen / warning signs",
                "<missing>",
                "Return-precaution instruction ('return if symptoms worsen') omitted.",
            )
        )

    if src_fu["has_tests_advised"] and not out_fu["has_tests_advised"]:
        mismatches.append(
            _mismatch(
                "RULE-13-FOLLOWUP",
                "follow_up",
                "blocker",
                "follow_up.tests_advised",
                "Follow-up tests advised",
                "<missing>",
                "Advised diagnostic tests instruction omitted.",
            )
        )

    # --- Compute Final Status & Risk Level ---
    has_blocker = any(m["severity"] == "blocker" for m in mismatches)
    has_warning = any(m["severity"] == "warning" for m in mismatches)

    if has_blocker:
        status = "blocked"
        critical_categories = {"medicine", "dosage", "units", "frequency", "route", "negations", "allergies"}
        if (
            not dosage_preserved
            or not negation_preserved
            or not frequency_preserved
            or any(m["category"] in critical_categories and m["severity"] == "blocker" for m in mismatches)
        ):
            risk_level = "critical"
        else:
            risk_level = "high"
    elif has_warning:
        status = "warning"
        risk_level = "medium"
    else:
        status = "passed"
        risk_level = "low"

    return {
        "status": status,
        "risk_level": risk_level,
        "rules_evaluated": 13,
        "mismatches": mismatches,
        "negation_preserved": negation_preserved,
        "dosage_preserved": dosage_preserved,
        "frequency_preserved": frequency_preserved,
        "duration_preserved": duration_preserved,
        "measurements_preserved": measurements_preserved,
        "output_language": output_language,
        "disclaimer": DISCLAIMER_TEXT,
    }
