"""Intent Policy Router & Post-LLM Provenance / Guardrail Validator for MedSarthi.

Enforces SAFE-01..11:
- Pre-LLM classification of diagnosis-seeking, prescription requests, dose changes,
  stop/substitute requests, and prompt injection attempts across EN/HI/Hinglish.
- Post-LLM verification of strict 4-way provenance separation (`doctor_provided`,
  `ai_simplified`, `general_education`, `uncertain_or_missing`), banned false-reassurance
  phrases, autonomous diagnosing/prescribing, and prompt injection leakage.
"""

from __future__ import annotations

import re
from typing import Any

REQUIRED_PROVENANCE_KEYS: tuple[str, ...] = (
    "doctor_provided",
    "ai_simplified",
    "general_education",
    "uncertain_or_missing",
)

# --- Intent Router Patterns (checked in strict priority order) ---

_PROMPT_INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bignore\s+(?:all\s+)?(?:previous|prior|above|your|safety)?\s*(?:instructions?|rules?|prompts?|guardrails?)\b", re.I),
    re.compile(r"\bdisregard\s+(?:all\s+)?(?:previous|safety|system)\s*(?:instructions?|rules?)\b", re.I),
    re.compile(r"\boverride\s+(?:safety|rules?|system|guardrails?)\b", re.I),
    re.compile(r"\bbypass\s+(?:safety|rules?|guardrails?|filters?)\b", re.I),
    re.compile(r"\bforget\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|rules?)\b", re.I),
    re.compile(r"\bjailbreak\b|\byou\s+are\s+now\s+dan\b|\bdeveloper\s+mode\b", re.I),
    re.compile(r"(?:^|\s)(?:SYSTEM|DEVELOPER)\s*:", re.I),
    re.compile(r"<\s*/?\s*system\s*>|<\s*/?\s*UNTRUSTED_CLINICAL_TEXT\s*>", re.I),
    re.compile(r"\bact\s+as\s+(?:a\s+)?doctor\s+and\s+(?:prescribe|diagnose)\b", re.I),
    re.compile(r"\btell\s+the\s+patient\s+to\s+take\s+\d+\s*(?:tablets?|pills?|mg)\b", re.I),
]

_DOSE_CHANGE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(?:can|should|may)\s+i\s+(?:take|use)\s+(?:\d+|two|three|four|half|double|extra)\s+(?:more\s+)?(?:tablets?|pills?|capsules?|drops?|puffs?|doses?)\s*(?:instead|at\s+once|tonight|today)?\b", re.I),
    re.compile(r"\b(?:increase|decrease|reduce|lower|raise|double|triple|split|halve|change|adjust)\s+(?:my\s+|the\s+)?(?:dose|dosage|tablet|medicine|strength)\b", re.I),
    re.compile(r"\bmissed\s+(?:a\s+|my\s+)?dose\b.*\b(?:double|two|2)\b", re.I),
    re.compile(r"\btake\s+(?:double|2x)\s+(?:dose|tonight|next)\b", re.I),
    re.compile(r"\binstead\s+of\s+(?:one|1|half|two|2)\s+(?:tablet|pill|capsule|drop)\b", re.I),
    re.compile(r"\b(?:kya\s+main|kya\s+mai|main)\s+.*\b(?:do|2|teen|3|aadhi|double|zyada)\s+(?:goli|goliyan|dose|khurak)\s+(?:le\s+sak(?:ta|ti)|badha|kam)\b", re.I),
    re.compile(r"\b(?:dose|khurak|matra)\s+(?:badha|ghata|kam|double)\b", re.I),
    re.compile(r"(?:क्या\s+मैं|मैं)\s+.*(?:दो|2|तीन|आधी|ज्यादा|डबल)\s*(?:गोली|गोलियां|खुराक|डोज)", re.I),
    re.compile(r"(?:खुराक|डोज|मात्रा)\s*(?:बढ़ा|कम|घटा|बदल)", re.I),
]

_STOP_OR_SUBSTITUTE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(?:can|should|may)\s+i\s+(?:stop|quit|discontinue|skip)\s+(?:taking\s+)?(?:my\s+|this\s+|the\s+)?(?:medicine|tablet|pill|medication|[A-Z]?[a-z]{4,})\b", re.I),
    re.compile(r"\bstop\s+taking\s+(?:my\s+|this\s+|the\s+)?(?:medicine|tablet|pill|medication)\b", re.I),
    re.compile(r"\b(?:switch|change|replace|substitute)\s+(?:this|my|the)?\s*(?:medicine|tablet|drug|brand)?\s*(?:to|with|for)\s+(?:a\s+)?(?:cheaper|generic|another|other|different)\b", re.I),
    re.compile(r"\b(?:cheaper|generic|alternative|substitute)\s+(?:generic\s+)?(?:substitute|alternative|brand|medicine|tablet|drug|option)\s+(?:instead|for)\b", re.I),
    re.compile(r"\bcan\s+i\s+(?:take|use|buy)\s+(?:a\s+)?(?:cheaper\s+)?(?:generic|another\s+brand|substitute|alternative)(?:\s+(?:substitute|brand|medicine|tablet|option))?\s*(?:instead)?\b", re.I),
    re.compile(r"\b(?:kya\s+main|main)\s+.*\b(?:dawai|dawa|goli|medicine)\s+(?:band\s+kar|chhod|rok)\s+(?:sak(?:ta|ti)|du|doon)\b", re.I),
    re.compile(r"\b(?:band\s+kar\s+(?:du|doon|sakta|sakti)|dusri\s+dawai\s+le|iski\s+jagah\s+(?:koi\s+)?aur)\b", re.I),
    re.compile(r"(?:दवा|दवाई|गोली)\s*(?:बंद\s+कर|छोड़|रोक)", re.I),
    re.compile(r"(?:इसकी\s+जगह|बदले\s+में)\s*(?:कोई\s+)?(?:दूसरी|सस्ती|जेनेरिक)\s*(?:दवा|दवाई|गोली)", re.I),
]

_PRESCRIPTION_REQUEST_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(?:which|what)\s+(?:medicine|medicines|tablet|tablets|pill|pills|drug|drugs|antibiotic|syrup|cream|painkiller)\s+(?:should|can)\s+i\s+(?:take|buy|use)\b", re.I),
    re.compile(r"\b(?:suggest|recommend|prescribe|give)\s+(?:me\s+)?(?:(?:a|an|some)\s+)?(?:(?:good|best|strong|effective)\s+)?(?:medicine|tablet|pill|antibiotic|syrup|painkiller|drug|remedy)\b", re.I),
    re.compile(r"\bwhat\s+(?:should|can)\s+i\s+take\s+for\s+(?:my\s+)?[a-z]+\b", re.I),
    re.compile(r"\b(?:best|good)\s+(?:medicine|tablet|antibiotic|syrup|drug)\s+for\b", re.I),
    re.compile(r"\b(?:kaun\s*si|kaunsi|konsi|koi)\s+(?:dawai|dawa|goli|antibiotic|syrup)\s+(?:lu|loon|lein|batao|bataiye|chahiye)\b", re.I),
    re.compile(r"\b(?:dawai|dawa|goli)\s+(?:batao|bataiye|likh\s+do|suggest\s+karo)\b", re.I),
    re.compile(r"(?:कौन\s*सी|कोई)\s*(?:दवा|दवाई|गोली|सिरप)\s*(?:लूं|लेनी|बताइए|बताओ)", re.I),
]

_DIAGNOSIS_SEEKING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(?:do\s+i\s+have|could\s+i\s+have|might\s+i\s+have|am\s+i\s+suffering\s+from)\b", re.I),
    re.compile(r"\b(?:does\s+(?:this|it)\s+mean\s+i\s+have|is\s+(?:this|it)\s+(?:pneumonia|cancer|typhoid|dengue|malaria|tb|tuberculosis|diabetes|covid|asthma|heart\s+disease|anemia|thyroid))\b", re.I),
    re.compile(r"\bdiagnose\s+(?:me|my|this)\b", re.I),
    re.compile(r"\bwhat\s+(?:disease|illness|condition|infection)\s+do\s+i\s+have\b", re.I),
    re.compile(r"\b(?:tell\s+me\s+)?what\s+is\s+wrong\s+with\s+me\b", re.I),
    re.compile(r"\b(?:kya\s+(?:iska\s+matlab\s+)?mujhe)\s+[a-z0-9_\s]{2,40}\s+hai\b", re.I),
    re.compile(r"\b(?:kya\s+yeh|kya\s+ye)\s+(?:pneumonia|typhoid|dengue|sugar|diabetes|cancer|tb|bimari)\s+hai\b", re.I),
    re.compile(r"\bmujhe\s+(?:kya|kaun\s*si)\s+bimari\s+hai\b", re.I),
    re.compile(r"क्या\s+(?:इसका\s+मतलब\s+)?मुझे\s+.*\s+है", re.I),
    re.compile(r"मुझे\s+(?:क्या|कौन\s*सी)\s*(?:बीमारी|रोग)\s*है", re.I),
]

_INTENT_REFUSAL_GUIDANCE: dict[str, dict[str, str]] = {
    "prompt_injection": {
        "en": "MedSarthi follows strict clinical safety boundaries and cannot override safety rules or generate unauthorized medical orders.",
        "hi": "मेडसारथी कड़े चिकित्सा सुरक्षा नियमों का पालन करता है और किसी भी अनधिकृत चिकित्सा निर्देश को स्वीकार नहीं कर सकता।",
        "hi-Latn": "MedSarthi sakht medical safety niyamon ka palan karta hai aur safety rules tod kar koi medical salah nahi de sakta.",
    },
    "diagnosis_seeking": {
        "en": "MedSarthi cannot diagnose medical conditions. Only your doctor can confirm or rule out a diagnosis after examining you. I can explain what terms in your doctor's note mean in general.",
        "hi": "मेडसारथी किसी बीमारी का निदान (diagnosis) नहीं कर सकता। केवल आपके डॉक्टर ही जांच के बाद सही निदान बता सकते हैं। मैं आपके डॉक्टर के नोट में लिखे शब्दों का सामान्य अर्थ समझा सकता हूँ।",
        "hi-Latn": "MedSarthi kisi bimari ki diagnosis nahi kar sakta. Sirf aapke doctor hi jaanch ke baad bata sakte hain. Main aapke doctor ke note mein likhe shabdon ka matlab samjha sakta hoon.",
    },
    "prescription_request": {
        "en": "MedSarthi cannot prescribe or recommend medicines, antibiotics, or supplements. Please consult a licensed doctor for treatment advice.",
        "hi": "मेडसारथी कोई भी दवा, एंटीबायोटिक या सप्लीमेंट लेने की सलाह या पर्ची नहीं दे सकता। कृपया सही इलाज के लिए डॉक्टर से संपर्क करें।",
        "hi-Latn": "MedSarthi koi bhi dawai ya antibiotic suggest ya prescribe nahi kar sakta. Kripya sahi ilaaj ke liye doctor se salah lein.",
    },
    "dose_change_request": {
        "en": "MedSarthi cannot advise changing, increasing, decreasing, doubling, or splitting your medicine dose. Please follow your doctor's exact prescribed dose and contact your doctor or pharmacist before making any change.",
        "hi": "मेडसारथी आपकी दवा की खुराक बढ़ाने, घटाने, दोगुनी करने या बदलने की सलाह नहीं दे सकता। कृपया डॉक्टर द्वारा बताई गई मात्रा ही लें और किसी भी बदलाव से पहले अपने डॉक्टर से पूछें।",
        "hi-Latn": "MedSarthi aapki dawai ki dose badhane, ghatane ya double karne ki salah nahi de sakta. Kripya doctor ki batayi matra hi lein aur kisi bhi badlav se pehle doctor se poochhein.",
    },
    "stop_or_substitute_request": {
        "en": "MedSarthi cannot advise stopping a prescribed medicine or switching to another brand or generic substitute. Please check with your prescribing doctor or pharmacist before stopping or changing any medicine.",
        "hi": "मेडसारथी किसी निर्धारित दवा को बंद करने या उसकी जगह कोई दूसरी दवा लेने की सलाह नहीं दे सकता। कृपया दवा रोकने या बदलने से पहले अपने डॉक्टर या फार्मासिस्ट से सलाह लें।",
        "hi-Latn": "MedSarthi kisi prescribed dawai ko band karne ya uski jagah koi aur dawai lene ki salah nahi de sakta. Kripya dawai rokne ya badalne se pehle apne doctor ya pharmacist se zaroor poochhein.",
    },
}


def classify_user_intent(message: str) -> dict:
    """Classify a user query for clinical policy enforcement before calling an LLM.

    Detects: ``prompt_injection``, ``dose_change_request``, ``stop_or_substitute_request``,
    ``prescription_request``, ``diagnosis_seeking``, or ``allowed_communication``.
    """
    text = (message or "").strip()
    if not text:
        return {
            "intent": "allowed_communication",
            "is_prohibited": False,
            "matched_rules": [],
            "matched_triggers": [],
            "policy_action": "allow",
            "safe_refusal_guidance": None,
        }

    checks: list[tuple[str, str, str, list[re.Pattern[str]]]] = [
        ("prompt_injection", "SAFE-10", "block_and_refuse", _PROMPT_INJECTION_PATTERNS),
        ("dose_change_request", "SAFE-03", "refuse_with_education", _DOSE_CHANGE_PATTERNS),
        ("stop_or_substitute_request", "SAFE-04", "refuse_with_education", _STOP_OR_SUBSTITUTE_PATTERNS),
        ("prescription_request", "SAFE-02", "refuse_with_education", _PRESCRIPTION_REQUEST_PATTERNS),
        ("diagnosis_seeking", "SAFE-01", "refuse_with_education", _DIAGNOSIS_SEEKING_PATTERNS),
    ]

    for intent_name, rule_id, policy_action, patterns in checks:
        hits: list[str] = []
        for pat in patterns:
            m = pat.search(text)
            if m:
                hits.append(m.group(0).strip())
        if hits:
            return {
                "intent": intent_name,
                "is_prohibited": True,
                "matched_rules": [rule_id],
                "matched_triggers": hits,
                "policy_action": policy_action,
                "safe_refusal_guidance": _INTENT_REFUSAL_GUIDANCE[intent_name],
            }

    return {
        "intent": "allowed_communication",
        "is_prohibited": False,
        "matched_rules": [],
        "matched_triggers": [],
        "policy_action": "allow",
        "safe_refusal_guidance": None,
    }


# --- Post-LLM Guardrail Patterns ---

_FALSE_REASSURANCE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bdon(?:'t|t)\s+worry\b", re.I),
    re.compile(r"\bdo\s+not\s+worry\b", re.I),
    re.compile(r"\bno\s+need\s+to\s+worry\b", re.I),
    re.compile(r"\bnothing\s+to\s+worry(?:\s+about)?\b", re.I),
    re.compile(r"\bnothing\s+serious\b", re.I),
    re.compile(r"\b(?:it(?:'s|\s+is)|this\s+is)\s+not\s+serious\b", re.I),
    re.compile(r"\b(?:completely|totally|perfectly|entirely)\s+harmless\b", re.I),
    re.compile(r"\b(?:is|are)\s+harmless\b", re.I),
    re.compile(r"\bthis\s+is\s+(?:completely\s+)?normal\b", re.I),
    re.compile(r"\beverything\s+is\s+(?:completely\s+)?(?:fine|normal|okay|ok)\b", re.I),
    re.compile(r"\byour\s+(?:results?|reports?|labs?|values?|readings?)\s+(?:is|are)\s+(?:completely\s+)?normal\b", re.I),
    re.compile(r"\bchinta\s+(?:mat|na)\s+kar(?:o|ein)\b", re.I),
    re.compile(r"\bchinta\s+karne\s+ki\s+(?:koi\s+)?zaroorat\s+nahi\b", re.I),
    re.compile(r"\bghabrane\s+ki\s+(?:koi\s+)?baat\s+nahi\b", re.I),
    re.compile(r"\bbilkul\s+normal\s+hai\b", re.I),
    re.compile(r"\bkuch\s+(?:serious|gambhir)\s+nahi\b", re.I),
    re.compile(r"चिंता\s+(?:मत|न)\s*कर(?:ें|ो)", re.I),
    re.compile(r"चिंता\s+करने\s+की\s+(?:कोई\s+)?जरूरत\s+नहीं", re.I),
    re.compile(r"घबराने\s+की\s+(?:कोई\s+)?बात\s+नहीं", re.I),
    re.compile(r"बिल्कुल\s+सामान्य\s+है", re.I),
]

_AUTONOMOUS_DIAGNOSIS_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"\byou\s+(?:definitely\s+|probably\s+|likely\s+)?have\s+"
        r"(?:pneumonia|diabetes|hypertension|typhoid|dengue|malaria|tuberculosis|cancer|"
        r"asthma|anemia|hypothyroidism|hyperthyroidism|kidney\s+disease|infection)\b",
        re.I,
    ),
    re.compile(r"\byou\s+are\s+suffering\s+from\b", re.I),
    re.compile(r"\bthis\s+(?:confirms|means|proves)\s+(?:that\s+)?you\s+have\b", re.I),
    re.compile(r"\byour\s+diagnosis\s+is\b", re.I),
    re.compile(
        r"\baapko\s+(?:pneumonia|sugar|diabetes|typhoid|dengue|malaria|cancer|tb)\s+hai\b",
        re.I,
    ),
    re.compile(r"आपको\s+(?:निमोनिया|डायबिटीज|शुगर|टाइफाइड|डेंगू|कैंसर|टीबी)\s+है", re.I),
]

_AUTONOMOUS_PRESCRIBING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bi\s+(?:recommend|suggest|advise|prescribe)\s+(?:that\s+you\s+)?(?:taking|take|start|starting|buying)\b", re.I),
    re.compile(r"\byou\s+should\s+(?:start\s+taking|take\s+(?:an?\s+)?(?:antibiotic|painkiller|steroid|ibuprofen|azithromycin|amoxicillin|paracetamol))\b", re.I),
    re.compile(r"\btry\s+taking\s+(?:some\s+)?[a-z]+\b", re.I),
    re.compile(r"\byou\s+can\s+(?:stop\s+taking|discontinue|switch\s+to|increase\s+(?:your\s+)?dose|double\s+(?:your\s+)?dose)\b", re.I),
    re.compile(r"\btake\s+\d+\s+tablets?\s+instead\b", re.I),
    re.compile(r"\b(?:aap|tum)\s+(?:yeh\s+|ye\s+)?(?:dawai|goli|antibiotic)\s+(?:shuru\s+kar|band\s+kar)\s+(?:sakte|lo)\b", re.I),
]

_INJECTION_LEAK_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?:^|\s)SYSTEM\s*:", re.I),
    re.compile(r"\bignore\s+all\s+safety\s+rules\b", re.I),
    re.compile(r"<\s*/?\s*UNTRUSTED_CLINICAL_TEXT\s*>", re.I),
]

_CLAUSE_NEGATION_DISCLAIMER_RE = re.compile(
    r"\b(?:not|never|cannot|can't|does\s+not|doesn't|did\s+not|didn't|without|"
    r"as\s+prescribed\s+by|your\s+doctor\s+(?:prescribed|noted|did\s+not)|"
    r"nahi|nahin|mat|bina)\b|नहीं|मत|बिना",
    re.I,
)


def _extract_strings(node: Any) -> list[str]:
    """Flatten strings inside nested dicts/lists."""
    if isinstance(node, str):
        return [node] if node.strip() else []
    if isinstance(node, list):
        out: list[str] = []
        for item in node:
            out.extend(_extract_strings(item))
        return out
    if isinstance(node, dict):
        out = []
        for v in node.values():
            out.extend(_extract_strings(v))
        return out
    return []


def _local_prefix_has_negation_disclaimer(text: str, match_start: int) -> bool:
    """Check if the same sentence/clause right before a match negates/disclaims it."""
    clause_start = max(
        text.rfind(".", 0, match_start),
        text.rfind(";", 0, match_start),
        text.rfind("\n", 0, match_start),
        text.rfind("।", 0, match_start),
    )
    prefix = text[clause_start + 1 : match_start]
    return bool(_CLAUSE_NEGATION_DISCLAIMER_RE.search(prefix))


def validate_provenance_and_guardrails(payload: dict) -> dict:
    """Validate strict 4-way provenance separation and post-LLM safety guardrails.

    Accepts either a full response object containing ``{"provenance": {...}}`` or
    a provenance dictionary directly containing the 4 required keys:
    ``doctor_provided``, ``ai_simplified``, ``general_education``, ``uncertain_or_missing``.
    """
    if not isinstance(payload, dict):
        return {
            "is_valid": False,
            "provenance_complete": False,
            "missing_provenance_keys": list(REQUIRED_PROVENANCE_KEYS),
            "no_hallucinated_diagnosis": True,
            "no_autonomous_prescribing": True,
            "no_false_reassurance": True,
            "no_prompt_injection_leak": True,
            "violations": [
                {
                    "rule_id": "PROVENANCE-INVALID",
                    "category": "provenance",
                    "severity": "blocker",
                    "field": "payload",
                    "matched_text": "",
                    "message": "Payload must be a dictionary with strict 4-way provenance keys.",
                }
            ],
            "disclaimer_present": False,
        }

    prov = payload.get("provenance") if isinstance(payload.get("provenance"), dict) else payload

    missing_keys: list[str] = []
    violations: list[dict[str, str]] = []

    for key in REQUIRED_PROVENANCE_KEYS:
        if key not in prov or prov[key] is None:
            missing_keys.append(key)
            violations.append(
                {
                    "rule_id": "PROVENANCE-MISSING-KEY",
                    "category": "provenance",
                    "severity": "blocker",
                    "field": key,
                    "matched_text": "",
                    "message": f"Missing required provenance category '{key}'.",
                }
            )
        elif not isinstance(prov[key], (list, dict, str)):
            missing_keys.append(key)
            violations.append(
                {
                    "rule_id": "PROVENANCE-INVALID-TYPE",
                    "category": "provenance",
                    "severity": "blocker",
                    "field": key,
                    "matched_text": str(type(prov[key]).__name__),
                    "message": f"Provenance category '{key}' must be list, dict, or str.",
                }
            )

    provenance_complete = len(missing_keys) == 0

    # Collect AI-generated / educational prose fields to scan (excluding verbatim doctor_provided)
    scan_targets: list[tuple[str, str]] = []
    for field_name in ("ai_simplified", "general_education", "uncertain_or_missing"):
        if field_name in prov and prov[field_name] is not None:
            for s in _extract_strings(prov[field_name]):
                scan_targets.append((field_name, s))

    for extra_key in ("answer", "summary", "explanation", "text", "message_text"):
        if isinstance(payload.get(extra_key), str) and payload[extra_key].strip():
            scan_targets.append((extra_key, payload[extra_key]))

    no_false_reassurance = True
    no_hallucinated_diagnosis = True
    no_autonomous_prescribing = True
    no_prompt_injection_leak = True

    for field_name, text in scan_targets:
        for pat in _FALSE_REASSURANCE_PATTERNS:
            m = pat.search(text)
            if m:
                no_false_reassurance = False
                violations.append(
                    {
                        "rule_id": "SAFE-08-FALSE-REASSURANCE",
                        "category": "false_reassurance",
                        "severity": "blocker",
                        "field": field_name,
                        "matched_text": m.group(0).strip(),
                        "message": "Banned false-reassurance phrase detected; use neutral factual framing.",
                    }
                )

        for pat in _AUTONOMOUS_DIAGNOSIS_PATTERNS:
            m = pat.search(text)
            if m and not _local_prefix_has_negation_disclaimer(text, m.start()):
                no_hallucinated_diagnosis = False
                violations.append(
                    {
                        "rule_id": "SAFE-01-AUTONOMOUS-DIAGNOSIS",
                        "category": "autonomous_diagnosis",
                        "severity": "blocker",
                        "field": field_name,
                        "matched_text": m.group(0).strip(),
                        "message": "Autonomous diagnostic statement detected outside doctor-provided context.",
                    }
                )

        for pat in _AUTONOMOUS_PRESCRIBING_PATTERNS:
            m = pat.search(text)
            if m and not _local_prefix_has_negation_disclaimer(text, m.start()):
                no_autonomous_prescribing = False
                violations.append(
                    {
                        "rule_id": "SAFE-02-AUTONOMOUS-PRESCRIBING",
                        "category": "autonomous_prescribing",
                        "severity": "blocker",
                        "field": field_name,
                        "matched_text": m.group(0).strip(),
                        "message": "Autonomous prescribing, dose change, or medicine stopping advice detected.",
                    }
                )

        for pat in _INJECTION_LEAK_PATTERNS:
            m = pat.search(text)
            if m:
                no_prompt_injection_leak = False
                violations.append(
                    {
                        "rule_id": "SAFE-10-INJECTION-LEAK",
                        "category": "prompt_injection",
                        "severity": "blocker",
                        "field": field_name,
                        "matched_text": m.group(0).strip(),
                        "message": "Untrusted prompt-injection marker or directive leaked into output.",
                    }
                )

    safety_block = payload.get("safety") if isinstance(payload.get("safety"), dict) else {}
    disclaimer_val = payload.get("disclaimer") or safety_block.get("disclaimer")
    disclaimer_present = isinstance(disclaimer_val, str) and bool(disclaimer_val.strip())

    is_valid = (
        provenance_complete
        and no_false_reassurance
        and no_hallucinated_diagnosis
        and no_autonomous_prescribing
        and no_prompt_injection_leak
    )

    return {
        "is_valid": is_valid,
        "provenance_complete": provenance_complete,
        "missing_provenance_keys": missing_keys,
        "no_hallucinated_diagnosis": no_hallucinated_diagnosis,
        "no_autonomous_prescribing": no_autonomous_prescribing,
        "no_false_reassurance": no_false_reassurance,
        "no_prompt_injection_leak": no_prompt_injection_leak,
        "violations": violations,
        "disclaimer_present": disclaimer_present,
    }
