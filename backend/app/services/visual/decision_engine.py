"""Decision engine that determines whether a visual explanation/diagram is genuinely needed for a user query."""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Topics and keywords that genuinely benefit from visual intelligence
ANATOMY_KEYWORDS: tuple[str, ...] = (
    "heart", "cardiac", "atrium", "ventricle", "aorta", "circulation", "artery", "vein",
    "lung", "pulmonary", "alveoli", "bronchi", "respiratory", "airway",
    "brain", "neuron", "synapse", "cortex", "nervous system",
    "kidney", "nephron", "renal", "filtration",
    "eye", "retina", "cornea", "lens", "optic nerve",
    "cell", "mitochondria", "dna", "rna", "nucleus", "chromosome", "gene",
    "skeleton", "bone", "spine", "vertebra", "joint",
    "digestive", "stomach", "intestine", "liver", "pancreas",
)

MEDICAL_MECHANISM_KEYWORDS: tuple[str, ...] = (
    "mechanism of action", "how does it work", "blood pressure regulation", "pathway",
    "drug action", "receptor", "vasodilation", "action mechanism",
    "fever regulation", "immune response", "antibody", "inflammation pathway",
    "blood flow", "oxygenation", "glucose regulation", "insulin",
)

EXPLICIT_VISUAL_REQUEST_KEYWORDS: tuple[str, ...] = (
    "diagram", "visual", "draw", "picture", "chart", "graph", "flowchart",
    "show me visually", "explain visually", "illustration", "schematic",
    "chitra", "naksha", "banao", "dikhao", "tasveer",
)

SCIENTIFIC_KEYWORDS: tuple[str, ...] = (
    "optics", "ray diagram", "focal point", "refraction", "reflection",
    "magnetic field", "electric circuit", "resistor", "capacitor",
    "wave propagation", "frequency", "amplitude", "wavelength",
    "projectile motion", "trajectory", "velocity",
    "molecular structure", "chemical bonding", "covalent",
    "derivative", "integral", "sine wave", "cosine", "function graph",
)

SCHEDULE_PROCESS_KEYWORDS: tuple[str, ...] = (
    "timeline", "schedule", "routine", "morning and night", "food schedule",
    "triage", "urgent care criteria", "decision flow",
)

# Queries where a visual is definitely NOT needed (e.g. conversational, simple facts, yes/no)
NON_VISUAL_PATTERNS: tuple[str, ...] = (
    r"^(hi|hello|hey|namaste|good\s+morning|good\s+evening|thanks|thank\s+you|dhanyawad|shukriya)[\.!?]*$",
    r"^(yes|no|ok|okay|sure|fine)[\.!?]*$",
    r"what\s+is\s+my\s+doctor'?s?\s+name",
    r"who\s+is\s+my\s+doctor",
    r"when\s+is\s+my\s+(next\s+)?appointment",
    r"when\s+is\s+my\s+(next\s+)?follow[\s-]*up",
    r"how\s+much\s+does\s+it\s+cost",
    r"can\s+i\s+drink\s+water",
    r"can\s+i\s+call\s+you",
    r"how\s+are\s+you",
    r"what\s+time\s+is\s+it",
)


class VisualDecisionEngine:
    """Evaluates whether generating or showing a visual explanation is appropriate and necessary."""

    def should_generate_visual(
        self,
        query: str,
        explicit_user_flag: bool | None = None,
        llm_spec: dict[str, Any] | None = None,
    ) -> tuple[bool, str]:
        """
        Determine if visual intelligence should be triggered.
        Returns (is_needed, reason).
        """
        q = (query or "").strip().lower()
        if not q:
            return False, "empty_query"

        # Check explicit negative patterns
        for pat in NON_VISUAL_PATTERNS:
            if re.search(pat, q, re.IGNORECASE):
                logger.info("Visual decision: NOT needed (conversational/admin query: '%s')", q)
                return False, "conversational_or_admin_query"

        # 1. User explicitly requested a visual or diagram
        if any(kw in q for kw in EXPLICIT_VISUAL_REQUEST_KEYWORDS):
            logger.info("Visual decision: NEEDED (explicit visual request in query: '%s')", q)
            return True, "explicit_user_request"

        # 2. Check if LLM explicitly provided a valid, non-empty visual spec
        if llm_spec and isinstance(llm_spec, dict) and llm_spec.get("script") and llm_spec.get("type"):
            spec_type = str(llm_spec.get("type", "")).lower()
            if spec_type in ("anatomy", "medical_mechanism", "physics", "math", "scientific", "process"):
                logger.info("Visual decision: NEEDED (LLM generated specific domain visual: %s)", spec_type)
                return True, f"llm_domain_visual:{spec_type}"

        # 3. Scientific and Anatomical Concepts
        if any(kw in q for kw in ANATOMY_KEYWORDS):
            logger.info("Visual decision: NEEDED (anatomy domain keyword: '%s')", q)
            return True, "anatomy_concept"

        if any(kw in q for kw in MEDICAL_MECHANISM_KEYWORDS):
            logger.info("Visual decision: NEEDED (medical mechanism keyword: '%s')", q)
            return True, "medical_mechanism"

        if any(kw in q for kw in SCIENTIFIC_KEYWORDS):
            logger.info("Visual decision: NEEDED (scientific/physics/math keyword: '%s')", q)
            return True, "scientific_concept"

        # 4. If explicit_user_flag is True, check if query has medical schedule/process context
        if explicit_user_flag is True:
            if any(kw in q for kw in SCHEDULE_PROCESS_KEYWORDS):
                logger.info("Visual decision: NEEDED (schedule/process keyword with flag: '%s')", q)
                return True, "schedule_or_process_flow"

        # By default: NOT needed
        logger.info("Visual decision: NOT needed (no visual trigger matched for query: '%s')", q)
        return False, "no_visual_relevance"


visual_decision_engine = VisualDecisionEngine()
