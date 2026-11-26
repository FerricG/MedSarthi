"""Deterministic, negation-aware multilingual emergency red-flag detector.

Scans English, Hindi (Devanagari), and Hinglish (Romanized Hindi) text for
acute emergency indicators across 7 domains before any LLM call runs.
"""

from __future__ import annotations

import re
from typing import NamedTuple


class _EmergencyRule(NamedTuple):
    category: str
    pattern: re.Pattern[str]


def _compile_patterns(patterns: list[str], case_sensitive: bool = False) -> re.Pattern[str]:
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.compile("|".join(f"(?:{p})" for p in patterns), flags)


_EMERGENCY_RULES: list[_EmergencyRule] = [
    _EmergencyRule(
        category="cardiac",
        pattern=_compile_patterns(
            [
                r"\bchest\s+pain\b",
                r"\bchest\s+tightness\b",
                r"\bcrushing\s+(?:chest\s+)?pain\b",
                r"\bpressure\s+in\s+(?:my\s+|the\s+)?chest\b",
                r"\bpain\s+radiating\s+to\s+(?:left\s+arm|jaw|back)\b",
                r"\bheart\s+attack\b",
                r"सीने\s+में\s+(?:तेज\s+|बहुत\s+)?दर्द",
                r"छाती\s+में\s+(?:तेज\s+|बहुत\s+)?(?:दर्द|दबाव|जकड़न)",
                r"सीने\s+में\s+(?:दबाव|जकड़न|भारीपन)",
                r"\bseene\s+mei?n\s+(?:tez\s+|bahut\s+)?(?:dard|jakdan|dabav|bharipan)\b",
                r"\bchhati\s+mei?n\s+(?:tez\s+|bahut\s+)?(?:dard|jakdan|dabav)\b",
                r"\bdil\s+ka\s+daura\b",
            ]
        ),
    ),
    _EmergencyRule(
        category="respiratory",
        pattern=_compile_patterns(
            [
                r"\bcan(?:'t|not)\s+breathe\b",
                r"\bunable\s+to\s+breathe\b",
                r"\bsevere\s+(?:shortness\s+of\s+breath|breathing\s+(?:trouble|difficulty))\b",
                r"\bdifficulty\s+breathing\b",
                r"\bbreathing\s+difficulty\b",
                r"\btrouble\s+breathing\b",
                r"\bshortness\s+of\s+breath\b",
                r"\bgasping\s+for\s+air\b",
                r"\bchoking\b",
                r"\bblue\s+lips\b",
                r"\bturning\s+blue\b",
                r"सांस\s+नहीं\s+आ\s+रही",
                r"सांस\s+लेने\s+में\s+(?:बहुत\s+)?(?:तकलीफ|दिक्कत|कठिनाई)",
                r"सांस\s+फूल\s+रही",
                r"दम\s+घुट\s+रहा",
                r"नीले\s+होंठ",
                r"\bsaans\s+nahi\s+aa\s+rahi\b",
                r"\bsaans\s+lene\s+mei?n\s+(?:bahut\s+|tez\s+)?(?:dikkat|takleef|mushkil)\b",
                r"\bsaans\s+phool\s+(?:rahi|raha|na)\b",
                r"\bsaans\s+phoolna\b",
                r"\bsaans\s+atak\s+rahi\b",
                r"\bdam\s+ghut\s+raha\b",
                r"\bneele\s+honth\b",
            ]
        ),
    ),
    # Uppercase clinical abbreviation SOB (case-sensitive to avoid matching lowercase "sob")
    _EmergencyRule(
        category="respiratory",
        pattern=_compile_patterns([r"\bSOB\b"], case_sensitive=True),
    ),
    _EmergencyRule(
        category="stroke_neuro",
        pattern=_compile_patterns(
            [
                r"\bface\s+drooping\b",
                r"\bfacial\s+droop\b",
                r"\bone\s+side\s+(?:weak|weakness|numb|numbness)\b",
                r"\bone-sided\s+(?:weakness|numbness)\b",
                r"\bslurred\s+speech\b",
                r"\btrouble\s+speaking\b",
                r"\bcan(?:'t|not)\s+speak\s+clearly\b",
                r"\bsudden\s+severe\s+headache\b",
                r"\bthunderclap\s+headache\b",
                r"\bsudden\s+vision\s+loss\b",
                r"\bseizures?\b",
                r"\bconvulsions?\b",
                r"\bfits\b",
                r"\bunconscious\b",
                r"\bunresponsive\b",
                r"\bfainted\b",
                r"\bpassed\s+out\b",
                r"चेहरा\s+टेढ़ा",
                r"एक\s+तरफ\s+(?:सुन्न|सुन्नपन|कमजोरी)",
                r"बोलने\s+में\s+दिक्कत",
                r"लड़खड़ाती\s+आवाज",
                r"दौरे\s+(?:पड़|आ)",
                r"बेहोशी",
                r"बेहोश\s+(?:हो|गया|गई)",
                r"लकवा",
                r"\bchehra\s+tedha\b",
                r"\bek\s+taraf\s+(?:kamzori|sunn|sunnpan)\b",
                r"\bbolne\s+mei?n\s+dikkat\b",
                r"\bdaure\b",
                r"\bbehosh(?:i)?\b",
                r"\blakwa\b",
            ]
        ),
    ),
    _EmergencyRule(
        category="anaphylaxis",
        pattern=_compile_patterns(
            [
                r"\banaphylaxis\b",
                r"\btongue\s+swelling\b",
                r"\bswollen\s+tongue\b",
                r"\bthroat\s+swelling\b",
                r"\bthroat\s+closing\b",
                r"\blips?\s+swelling\b",
                r"\bswollen\s+lips?\b",
                r"\bsevere\s+allergic\s+reaction\b",
                r"जीभ\s+में\s+सूजन",
                r"गले\s+में\s+सूजन",
                r"होंठ\s+में\s+सूजन",
                r"गला\s+बंद\s+हो\s+रहा",
                r"गंभीर\s+एलर्जी",
                r"\bjeebh\s+(?:mein\s+)?sujan\b",
                r"\bgale\s+(?:mein\s+)?sujan\b",
                r"\bhonth\s+(?:mein\s+)?sujan\b",
                r"\bgala\s+band\s+ho\s+raha\b",
                r"\bsujan\s+aur\s+saans\b",
            ]
        ),
    ),
    _EmergencyRule(
        category="severe_bleeding",
        pattern=_compile_patterns(
            [
                r"\bvomiting\s+blood\b",
                r"\bblood\s+in\s+vomit\b",
                r"\bcoughing\s+(?:up\s+)?blood\b",
                r"\bblack\s+tarry\s+stool\b",
                r"\bheavy\s+bleeding\b",
                r"\bsevere\s+bleeding\b",
                r"\buncontrolled\s+bleeding\b",
                r"\bbleeding\s+heavily\b",
                r"\bwon(?:'t|t)\s+stop\s+bleeding\b",
                r"खून\s+की\s+उल्टी",
                r"उल्टी\s+में\s+खून",
                r"खांसी\s+में\s+खून",
                r"काला\s+मल",
                r"बहुत\s+ज्यादा\s+खून",
                r"खून\s+नहीं\s+रुक\s+रहा",
                r"\bkhoon\s+ki\s+ulti\b",
                r"\bulti\s+mei?n\s+khoon\b",
                r"\bkhansi\s+mei?n\s+khoon\b",
                r"\bkala\s+mal\b",
                r"\bbahut\s+khoon\s+behna\b",
                r"\bkhoon\s+ruk\s+nahi\s+raha\b",
            ]
        ),
    ),
    _EmergencyRule(
        category="pediatric_obstetric",
        pattern=_compile_patterns(
            [
                r"\b(?:baby|infant|newborn)\s+(?:is\s+)?not\s+waking\b",
                r"\b(?:baby|infant|newborn)\s+(?:is\s+)?unresponsive\b",
                r"\b(?:baby|infant|newborn)\s+(?:is\s+)?turning\s+blue\b",
                r"\b(?:baby|infant|newborn)\s+(?:is\s+)?not\s+breathing\b",
                r"\b(?:baby|fetus)\s+(?:is\s+)?not\s+moving\b",
                r"\b(?:heavy|vaginal)\s+bleeding\s+in\s+pregnancy\b",
                r"\bpregnant\s+(?:and\s+)?bleeding\b",
                r"बच्चा\s+(?:बेहोश|सुस्त|उठ\s+नहीं\s+रहा|नीला|हिल\s+नहीं\s+रहा)",
                r"गर्भावस्था\s+में\s+(?:तेज\s+)?खून",
                r"\bbaccha\s+(?:behosh|uth\s+nahi\s+raha|neela|hil\s+nahi\s+raha)\b",
                r"\bpregnancy\s+mei?n\s+(?:tez\s+)?khoon\b",
            ]
        ),
    ),
    _EmergencyRule(
        category="overdose_self_harm",
        pattern=_compile_patterns(
            [
                r"\boverdose[sd]?\b",
                r"\btook\s+too\s+many\s+(?:pills|tablets|capsules|medicines)\b",
                r"\bswallowed\s+poison\b",
                r"\bdrank\s+poison\b",
                r"\bwant\s+to\s+(?:die|end\s+my\s+life|kill\s+myself)\b",
                r"\bkill\s+myself\b",
                r"\bend\s+my\s+life\b",
                r"\bsuicid(?:e|al)\b",
                r"\bself[- ]harm\b",
                r"\bharm\s+myself\b",
                r"(?:ज़्यादा|ज्यादा)\s+(?:गोली|दवाई|गोलियां)\s+खा\s+ली",
                r"जहर\s+(?:खा|पी)\s+लिया",
                r"आत्महत्या",
                r"खुद\s+को\s+नुकसान",
                r"जीना\s+नहीं\s+चाहता",
                r"मरना\s+चाहता",
                r"\bzyada\s+(?:goli|dawai)\s+kha\s+li\b",
                r"\bzeher\s+(?:kha|pi)\s+liya\b",
                r"\bkhudkushi\b",
                r"\baatmahatya\b",
                r"\bmarna\s+chahta\b",
                r"\bjeena\s+nahi\s+chahta\b",
            ]
        ),
    ),
]

_CLAUSE_SPLIT_RE = re.compile(r"[.!?\n;।—–]+")
_SUBCLAUSE_SPLIT_RE = re.compile(
    r",|\b(?:but|however|although|whereas|except|lekin|par|magar|किंतु|लेकिन)\b",
    re.IGNORECASE,
)

# Pre-cue English & HI/Hinglish negations (inspected strictly BEFORE the match)
_PRE_NEGATION_RE = re.compile(
    r"(?:\b(?:no|not|never|without|denies|denied|absent|ruled\s+out|negative\s+for|free\s+of|"
    r"no\s+history\s+of|no\s+h/o|nahi|nahin|na|mat|bina)\b|नहीं|मत|बिना|मना)\s*"
    r"(?:(?:\w+|[^\w\s]+)\s*){0,4}$",
    re.IGNORECASE,
)
# Tight pre-negation for patient_query fail-safe (only direct modifiers before symptom)
_PATIENT_DIRECT_NEGATION_RE = re.compile(
    r"(?:\b(?:no|without|denies|denied|never\s+had|not\s+having|no\s+signs\s+of)\b|"
    r"\b(?:koi)\b(?:\s+\w+){0,3}\s*$)\s*(?:\w+\s+){0,2}$",
    re.IGNORECASE,
)

# Post-verbal HI/Hinglish negations (inspected strictly AFTER the match)
_POST_NEGATION_RE = re.compile(
    r"^\s*(?:[^\w\s]+\s*)?(?:\S+\s+){0,4}?"
    r"(?:\b(?:nahi|nahin|mat|na|absent|ruled\s+out|negative)\b|नहीं|मत|अनु?पस्थित)",
    re.IGNORECASE,
)

# Doctor return-precaution / conditional warning cues
_CONDITIONAL_PRECAUTION_RE = re.compile(
    r"\b(?:return|sooner|come\s+back|seek\s+(?:urgent\s+|immediate\s+)?care|go\s+to\s+(?:er|hospital)|"
    r"call\s+(?:112|108|doctor|ambulance)|warn(?:ed|ing)?|watch\s+for|red\s+flag|if\s+any|"
    r"should\s+\w+\s+occur|in\s+case\s+of|agar|yadi)\b"
    r"|(?:\bif\b.{0,80}$)"
    r"|(?:अगर|यदि|हो\s+तो)",
    re.IGNORECASE,
)


def _find_subclause(text: str, start: int, end: int) -> tuple[str, int]:
    """Return the enclosing sub-clause and the offset of the match inside it."""
    clause_start = 0
    for m in _CLAUSE_SPLIT_RE.finditer(text):
        if m.end() <= start:
            clause_start = m.end()
        elif m.start() >= end:
            clause_end = m.start()
            break
    else:
        clause_end = len(text)

    clause = text[clause_start:clause_end]
    rel_start = start - clause_start
    rel_end = end - clause_start

    sub_start = 0
    for m in _SUBCLAUSE_SPLIT_RE.finditer(clause):
        if m.end() <= rel_start:
            sub_start = m.end()
        elif m.start() >= rel_end:
            sub_end = m.start()
            break
    else:
        sub_end = len(clause)

    return clause[sub_start:sub_end], rel_start - sub_start


def _suppression_reason(
    text: str,
    match_start: int,
    match_end: int,
    is_doctor_mode: bool,
) -> str | None:
    """Determine if a red-flag match should be suppressed as negated or conditional."""
    subclause, rel_start = _find_subclause(text, match_start, match_end)
    rel_end = rel_start + (match_end - match_start)
    prefix = subclause[:rel_start]
    suffix = subclause[rel_end:]

    if is_doctor_mode:
        if _PRE_NEGATION_RE.search(prefix) or _POST_NEGATION_RE.search(suffix):
            return "negated"
        if _CONDITIONAL_PRECAUTION_RE.search(subclause):
            return "conditional_precaution"
        return None

    # Patient fail-safe mode: only suppress unambiguous direct negation on the symptom
    if _PATIENT_DIRECT_NEGATION_RE.search(prefix) or _POST_NEGATION_RE.search(suffix):
        return "negated"
    return None


def _build_helplines(categories: list[str]) -> list[dict[str, str]]:
    helplines = [
        {"name": "National Emergency Helpline", "number": "112"},
        {"name": "Ambulance Services", "number": "108"},
    ]
    if "overdose_self_harm" in categories:
        helplines.append({"name": "Tele-MANAS Mental Health Helpline", "number": "14416"})
        helplines.append({"name": "Tele-MANAS Toll-Free", "number": "1800-891-4416"})
    return helplines


def _build_guidance(categories: list[str]) -> dict[str, str]:
    has_self_harm = "overdose_self_harm" in categories
    if has_self_harm:
        return {
            "en": (
                "If this is happening right now, call 112 or 108 immediately or go to the nearest emergency room. "
                "For immediate mental health or crisis support, call Tele-MANAS at 14416 or 1800-891-4416."
            ),
            "hi": (
                "यदि यह अभी हो रहा है, तो तुरंत 112 या 108 पर कॉल करें या नजदीकी अस्पताल के इमरजेंसी विभाग में जाएं। "
                "तत्काल मानसिक स्वास्थ्य सहायता के लिए टेली-मानस (Tele-MANAS) 14416 या 1800-891-4416 पर कॉल करें।"
            ),
            "hi-Latn": (
                "Agar yeh abhi ho raha hai, toh turant 112 ya 108 par call karein ya sabse paas ke hospital emergency room jayein. "
                "Turant madad ke liye Tele-MANAS 14416 ya 1800-891-4416 par bhi call karein."
            ),
        }
    return {
        "en": (
            "These symptoms may need urgent medical care. Call 112 or 108 right now, "
            "or go to the nearest hospital emergency room."
        ),
        "hi": (
            "ये लक्षण गंभीर हो सकते हैं। कृपया तुरंत 112 या 108 पर कॉल करें, "
            "या नजदीकी अस्पताल के इमरजेंसी विभाग में जाएं।"
        ),
        "hi-Latn": (
            "Yeh lakshan gambhir ho sakte hain. Kripya turant 112 ya 108 par call karein, "
            "ya sabse paas ke hospital emergency room jayein."
        ),
    }


def detect_emergency(text: str, context_mode: str = "patient_query") -> dict:
    """Scan EN, HI, and Hinglish text for acute clinical emergencies.

    Args:
        text: Input clinical text or patient query.
        context_mode: ``"patient_query"`` (fail-safe on acute symptoms) or
            ``"doctor_note"`` (suppresses negated/return-precaution phrases).

    Returns:
        Structured dictionary with ``is_emergency``, ``categories``, ``matched_phrases``,
        ``suppressed_matches``, ``helplines``, ``emergency_numbers``, and multilingual ``guidance``.
    """
    if not text or not text.strip():
        return {
            "is_emergency": False,
            "severity": "none",
            "category": None,
            "categories": [],
            "matched_phrases": [],
            "suppressed_matches": [],
            "context_mode": context_mode,
            "helplines": [],
            "emergency_numbers": [],
            "guidance": None,
            "action_required": "none",
        }

    normalized_mode = context_mode.strip().lower()
    is_doctor_mode = normalized_mode in {"doctor_note", "doctor_provided", "doctor_entered"}

    active_categories: list[str] = []
    matched_phrases: list[str] = []
    suppressed_matches: list[dict[str, str]] = []

    for rule in _EMERGENCY_RULES:
        for match in rule.pattern.finditer(text):
            phrase = match.group(0).strip()
            reason = _suppression_reason(text, match.start(), match.end(), is_doctor_mode)
            if reason is not None:
                suppressed_matches.append(
                    {
                        "phrase": phrase,
                        "category": rule.category,
                        "reason": reason,
                    }
                )
            else:
                if rule.category not in active_categories:
                    active_categories.append(rule.category)
                if phrase not in matched_phrases:
                    matched_phrases.append(phrase)

    is_emergency = len(active_categories) > 0
    helplines = _build_helplines(active_categories) if is_emergency else []
    emergency_numbers = [h["number"] for h in helplines]
    guidance = _build_guidance(active_categories) if is_emergency else None

    return {
        "is_emergency": is_emergency,
        "severity": "critical" if is_emergency else "none",
        "category": active_categories[0] if active_categories else None,
        "categories": active_categories,
        "matched_phrases": matched_phrases,
        "suppressed_matches": suppressed_matches,
        "context_mode": context_mode,
        "helplines": helplines,
        "emergency_numbers": emergency_numbers,
        "guidance": guidance,
        "action_required": "immediate_emergency_escalation" if is_emergency else "none",
    }
