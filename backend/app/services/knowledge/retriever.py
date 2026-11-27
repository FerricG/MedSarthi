"""Verified medical terminology, medicines, and curated diagram retriever (SQLite FTS5 + alias lookup)."""

from __future__ import annotations

from functools import lru_cache
import json
import re
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import BACKEND_DIR
from app.core.database import search_kb_fts
from app.models.knowledge import KBEntry

DIAGRAMS_PATH = BACKEND_DIR / "app" / "seeds" / "diagrams.json"

# LASA (Look-Alike Sound-Alike) medication pairs that must NEVER be fuzzy-conflated.
LASA_EXCLUSION_PAIRS: tuple[tuple[str, str], ...] = (
    ("metformin", "metronidazole"),
    ("glipizide", "glyburide"),
    ("prednisone", "prednisolone"),
    ("cefixime", "cefuroxime"),
    ("hydroxyzine", "hydralazine"),
    ("amlodipine", "atorvastatin"),
    ("azithromycin", "erythromycin"),
)

# Helpful bilingual/abbreviated clinical synonyms -> canonical slugs for exact pre-resolution.
CLINICAL_ALIAS_TO_SLUG: dict[str, str] = {
    "uri": "upper-respiratory-infection",
    "urti": "upper-respiratory-infection",
    "acute nasopharyngitis": "upper-respiratory-infection",
    "nasopharyngitis": "upper-respiratory-infection",
    "common cold": "upper-respiratory-infection",
    "cold": "upper-respiratory-infection",
    "zukam": "upper-respiratory-infection",
    "zukaam": "upper-respiratory-infection",
    "जुकाम": "upper-respiratory-infection",
    "सर्दी": "upper-respiratory-infection",
    "sore throat": "upper-respiratory-infection",
    "gale mein kharash": "upper-respiratory-infection",
    "pneumonia": "pneumonia",
    "निमोनिया": "pneumonia",
    "lung infection": "pneumonia",
    "cap": "pneumonia",
    "htn": "hypertension",
    "high bp": "hypertension",
    "high blood pressure": "hypertension",
    "bp": "hypertension",
    "hypertension": "hypertension",
    "रक्तचाप": "hypertension",
    "हाई ब्लड प्रेशर": "hypertension",
    "उच्च रक्तचाप": "hypertension",
    "cr": "creatinine",
    "s. creatinine": "creatinine",
    "serum creatinine": "creatinine",
    "creatinine": "creatinine",
    "क्रिएटिनिन": "creatinine",
    "a1c": "hba1c",
    "hba1c": "hba1c",
    "glycated hemoglobin": "hba1c",
    "hemoglobin a1c": "hba1c",
    "एचबीए1सी": "hba1c",
    "pyrexia": "fever",
    "fever": "fever",
    "bukhar": "fever",
    "bukhaar": "fever",
    "बुखार": "fever",
    "acetaminophen": "paracetamol",
    "paracetamol": "paracetamol",
    "dolo": "paracetamol",
    "dolo 650": "paracetamol",
    "dolo-650": "paracetamol",
    "crocin": "paracetamol",
    "calpol": "paracetamol",
    "पैरासिटामोल": "paracetamol",
    "azithromycin": "azithromycin",
    "azithral": "azithromycin",
    "azee": "azithromycin",
    "zithromax": "azithromycin",
    "एज़िथ्रोमाइसिन": "azithromycin",
    "metformin": "metformin",
    "glycomet": "metformin",
    "glucophage": "metformin",
    "मेटफॉर्मिन": "metformin",
    "amlodipine": "amlodipine",
    "amlong": "amlodipine",
    "amlokind": "amlodipine",
    "norvasc": "amlodipine",
    "एम्लोडिपिन": "amlodipine",
    "amoxicillin": "amoxicillin",
    "amoxil": "amoxicillin",
    "mox": "amoxicillin",
    "novamox": "amoxicillin",
    "एमोक्सिसिलिन": "amoxicillin",
    "cefixime": "cefixime",
    "taxim-o": "cefixime",
    "taxim o": "cefixime",
    "zifi": "cefixime",
    "mahacef": "cefixime",
    "सेफिक्सिम": "cefixime",
    "ibuprofen": "ibuprofen",
    "combiflam": "ibuprofen",
    "brufen": "ibuprofen",
    "advil": "ibuprofen",
    "motrin": "ibuprofen",
    "आइबूप्रोफेन": "ibuprofen",
    "pantoprazole": "pantoprazole",
    "pan 40": "pantoprazole",
    "pan40": "pantoprazole",
    "pantocid": "pantoprazole",
    "pantosec": "pantoprazole",
    "पेंटोप्राजोल": "pantoprazole",
    "omeprazole": "omeprazole",
    "omez": "omeprazole",
    "prilosec": "omeprazole",
    "ओमेप्राजोल": "omeprazole",
    "cetirizine": "cetirizine",
    "cetzine": "cetirizine",
    "okacet": "cetirizine",
    "zyrtec": "cetirizine",
    "सिटिरिज़िन": "cetirizine",
    "levocetirizine": "levocetirizine",
    "levocet": "levocetirizine",
    "montelukast": "montelukast",
    "montek lc": "montelukast",
    "montair lc": "montelukast",
    "atorvastatin": "atorvastatin",
    "atorva": "atorvastatin",
    "lipitor": "atorvastatin",
    "storvas": "atorvastatin",
    "एटोर्वास्टेटिन": "atorvastatin",
    "telmisartan": "telmisartan",
    "telma": "telmisartan",
    "losartan": "losartan",
    "losacar": "losartan",
    "aspirin": "aspirin",
    "ecosprin": "aspirin",
    "disprin": "aspirin",
    "एसप्रिन": "aspirin",
    "diclofenac": "diclofenac",
    "voveran": "diclofenac",
    "voltaren": "diclofenac",
    "ondansetron": "ondansetron",
    "emeset": "ondansetron",
    "zofran": "ondansetron",
    "ranitidine": "ranitidine",
    "rantac": "ranitidine",
    "zantac": "ranitidine",
    "salbutamol": "salbutamol",
    "asthalin": "salbutamol",
}

_STOPWORDS = {
    "what", "is", "are", "the", "a", "an", "my", "me", "for", "of", "in", "to", "and",
    "or", "do", "does", "mean", "kya", "iska", "matlab", "mujhe", "hai", "hain",
    "ke", "ka", "ki", "ko", "se", "mein", "aur", "ya", "ye", "yeh", "doctor",
    "note", "report", "tablet", "medicine", "dawa", "test", "why", "how",
}


def _maybe_json(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return value


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s\-\./\u0900-\u097F]", " ", text.lower())).strip()


def _normalize_lang(language: str | None) -> str:
    if not language:
        return "en"
    lang = language.strip()
    if lang in ("en", "hi", "hi-Latn"):
        return lang
    lower = lang.lower()
    if lower in ("hindi", "hi-in", "hi_in"):
        return "hi"
    if lower in ("hinglish", "hi-latn", "hi_latn"):
        return "hi-Latn"
    return "en"


def _violates_lasa_guard(query_norm: str, candidate_canonical_norm: str) -> bool:
    """Block matching one LASA sibling when query explicitly asks for the other sibling."""
    q_tokens = set(re.findall(r"[a-z]+", query_norm))
    c_tokens = set(re.findall(r"[a-z]+", candidate_canonical_norm))
    for left, right in LASA_EXCLUSION_PAIRS:
        if left in q_tokens and right in c_tokens and left not in c_tokens:
            return True
        if right in q_tokens and left in c_tokens and right not in c_tokens:
            return True
    return False


@lru_cache(maxsize=1)
def load_diagrams_catalog() -> dict[str, Any]:
    """Load curated SVG diagram catalog metadata from seeds/diagrams.json."""
    if not DIAGRAMS_PATH.exists():
        return {"prototype_notice": "", "diagrams": []}
    with DIAGRAMS_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _format_diagram(item: dict[str, Any], language: str = "en", depth: str = "simple") -> dict[str, Any]:
    lang = _normalize_lang(language)
    titles = item.get("titles", {})
    descriptions = item.get("descriptions", {})
    callouts_map = item.get("callouts", {})
    raw_callouts = callouts_map.get(lang) or callouts_map.get("en") or []
    if depth == "very_simple":
        callouts = [c for c in raw_callouts if c.get("depth") == "very_simple"] or raw_callouts[:2]
    else:
        callouts = raw_callouts

    catalog = load_diagrams_catalog()
    return {
        "id": item["id"],
        "key": item["id"],
        "svg_path": item["svg_path"],
        "svg_url": item["svg_path"],
        "body_system": item.get("body_system"),
        "related_terms": item.get("related_terms", []),
        "title": titles.get(lang) or titles.get("en") or item["id"],
        "description": descriptions.get(lang) or descriptions.get("en") or "",
        "callouts": callouts,
        "disclaimer": catalog.get(
            "prototype_notice",
            "Educational anatomical illustration only. Not diagnostic imagery.",
        ),
    }


def get_diagram(
    diagram_id: str | None,
    language: str = "en",
    depth: str = "simple",
) -> dict[str, Any] | None:
    """Return a single localized curated diagram reference by ID, or None if absent."""
    if not diagram_id:
        return None
    catalog = load_diagrams_catalog()
    for item in catalog.get("diagrams", []):
        if item.get("id") == diagram_id:
            return _format_diagram(item, language=language, depth=depth)
    return None


def list_diagrams(
    language: str = "en",
    key: str | None = None,
    related_term: str | None = None,
    depth: str = "simple",
) -> list[dict[str, Any]]:
    """Return localized curated diagrams optionally filtered by key or related term slug."""
    catalog = load_diagrams_catalog()
    results: list[dict[str, Any]] = []
    for item in catalog.get("diagrams", []):
        if key and item.get("id") != key:
            continue
        if related_term and related_term not in item.get("related_terms", []):
            continue
        results.append(_format_diagram(item, language=language, depth=depth))
    return results


def _serialize_kb_row(row: KBEntry | dict[str, Any], language: str = "en") -> dict[str, Any]:
    lang = _normalize_lang(language)
    if isinstance(row, KBEntry):
        entry_id = row.id
        entry_type = row.entry_type
        canonical_name = row.canonical_name
        slug = row.slug
        aliases = list(row.aliases or [])
        body_system = row.body_system
        simple_en = row.simple_en
        detailed_en = row.detailed_en
        translations = dict(row.translations or {})
        metadata_json = dict(row.metadata_json or {})
        source_name = row.source_name
        source_url = row.source_url
        last_reviewed_at = row.last_reviewed_at
    else:
        entry_id = row["id"]
        entry_type = row["entry_type"]
        canonical_name = row["canonical_name"]
        slug = row["slug"]
        aliases = _maybe_json(row.get("aliases"), [])
        body_system = row.get("body_system")
        simple_en = row["simple_en"]
        detailed_en = row.get("detailed_en")
        translations = _maybe_json(row.get("translations"), {})
        metadata_json = _maybe_json(row.get("metadata_json"), {})
        source_name = row["source_name"]
        source_url = row["source_url"]
        last_reviewed_at = row.get("last_reviewed_at")

    lang_tr = translations.get(lang, {}) if lang != "en" else {}
    hi_latn_tr = translations.get("hi-Latn", {})

    localized_name = lang_tr.get("name") or canonical_name
    localized_simple = lang_tr.get("simple") or simple_en
    localized_detailed = lang_tr.get("detailed") or detailed_en or simple_en

    diagram_key = metadata_json.get("curated_diagram_key")
    diagram = get_diagram(diagram_key, language=lang) if diagram_key else None

    reviewed_iso = (
        last_reviewed_at.isoformat()
        if hasattr(last_reviewed_at, "isoformat")
        else (str(last_reviewed_at) if last_reviewed_at else None)
    )

    return {
        "id": entry_id,
        "entry_type": entry_type,
        "canonical_name": canonical_name,
        "slug": slug,
        "aliases": aliases,
        "body_system": body_system,
        "simple_en": simple_en,
        "detailed_en": detailed_en or simple_en,
        "translations": translations,
        "metadata_json": metadata_json,
        "localized_name": localized_name,
        "localized_simple": localized_simple,
        "localized_detailed": localized_detailed,
        "hinglish_name": hi_latn_tr.get("name") or canonical_name,
        "hinglish_simple": hi_latn_tr.get("simple") or simple_en,
        "hinglish_detailed": hi_latn_tr.get("detailed") or detailed_en or simple_en,
        "source_name": source_name,
        "source_url": source_url,
        "last_reviewed_at": reviewed_iso,
        "citation": {
            "source_name": source_name,
            "source_url": source_url,
            "last_reviewed_at": reviewed_iso,
        },
        "diagram_key": diagram_key,
        "diagram": diagram,
    }


class KnowledgeRetriever:
    """Verified medical KB retriever backed by SQLite FTS5 + exact/alias lookup + diagrams.json."""

    async def get_by_slug(
        self,
        session: AsyncSession,
        slug: str,
        language: str = "en",
    ) -> dict[str, Any] | None:
        stmt = select(KBEntry).where(KBEntry.slug == slug)
        row = (await session.execute(stmt)).scalar_one_or_none()
        return _serialize_kb_row(row, language=language) if row else None

    async def _exact_or_alias_matches(
        self,
        session: AsyncSession,
        query: str,
        entry_type: str | None = None,
    ) -> list[KBEntry]:
        q_norm = _normalize_text(query)
        if not q_norm:
            return []

        stmt = select(KBEntry)
        if entry_type:
            stmt = stmt.where(KBEntry.entry_type == entry_type)
        all_rows = list((await session.execute(stmt)).scalars().all())

        # Direct synonym-to-slug map hit
        mapped_slug = CLINICAL_ALIAS_TO_SLUG.get(q_norm)
        exact_hits: list[tuple[int, KBEntry]] = []

        for row in all_rows:
            canon_norm = _normalize_text(row.canonical_name)
            if _violates_lasa_guard(q_norm, canon_norm):
                continue

            slug_norm = row.slug.lower().replace("-", " ")
            aliases_norm = [_normalize_text(str(a)) for a in (row.aliases or [])]
            tr_names = [
                _normalize_text(str(v.get("name", "")))
                for v in (row.translations or {}).values()
                if isinstance(v, dict)
            ]

            score = 0
            if mapped_slug and row.slug == mapped_slug:
                score = 100
            elif q_norm == canon_norm or q_norm == row.slug.lower() or q_norm == slug_norm:
                score = 95
            elif q_norm in aliases_norm or q_norm in tr_names:
                score = 90
            elif len(q_norm) >= 3 and (
                q_norm in canon_norm
                or any(q_norm == tok for tok in canon_norm.split())
                or any(q_norm in alias for alias in aliases_norm)
                or any(q_norm in tr_name for tr_name in tr_names)
            ):
                score = 75
            else:
                # Check if any synonym token from a multi-word query appears verbatim
                q_words = [
                    w for w in re.findall(r"[\w\-\u0900-\u097F]+", q_norm)
                    if len(w) >= 2 and w not in _STOPWORDS
                ]
                for word in q_words:
                    word_slug = CLINICAL_ALIAS_TO_SLUG.get(word)
                    if word_slug == row.slug:
                        score = max(score, 80)
                    elif word == canon_norm or word in aliases_norm:
                        score = max(score, 78)
                    elif len(word) >= 4 and (word in canon_norm.split() or word in row.slug.split("-")):
                        score = max(score, 70)

            if score > 0:
                exact_hits.append((score, row))

        exact_hits.sort(key=lambda pair: pair[0], reverse=True)
        return [row for _, row in exact_hits]

    async def search_kb(
        self,
        session: AsyncSession,
        query: str,
        entry_type: str | None = None,
        language: str = "en",
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Search verified KB entries via exact/alias match + SQLite FTS5 BM25 ranking."""
        if not query or not query.strip():
            return []

        q_norm = _normalize_text(query)
        lang = _normalize_lang(language)
        seen_ids: set[str] = set()
        results: list[dict[str, Any]] = []

        # 1. Exact & case-insensitive alias match (respects LASA exclusion guard)
        exact_rows = await self._exact_or_alias_matches(session, query, entry_type=entry_type)
        for row in exact_rows:
            if row.id not in seen_ids:
                seen_ids.add(row.id)
                item = _serialize_kb_row(row, language=lang)
                item["match_kind"] = "exact_or_alias"
                results.append(item)
                if len(results) >= limit:
                    return results

        # 2. SQLite FTS5 BM25 lexical search (strip stopwords to avoid diluting BM25)
        raw_tokens = [
            tok for tok in re.findall(r"[\w\-\u0900-\u097F]+", query.strip())
            if tok.lower() not in _STOPWORDS and len(tok) >= 2
        ]
        fts_query = " ".join(raw_tokens) if raw_tokens else query.strip()

        try:
            fts_rows = await search_kb_fts(
                session,
                fts_query,
                entry_type=entry_type,
                limit=max(limit * 2, 10),
            )
        except Exception:
            fts_rows = []

        for row in fts_rows:
            if row["id"] in seen_ids:
                continue
            canon_norm = _normalize_text(row["canonical_name"])
            if _violates_lasa_guard(q_norm, canon_norm):
                continue
            seen_ids.add(row["id"])
            item = _serialize_kb_row(row, language=lang)
            item["match_kind"] = "fts5"
            results.append(item)
            if len(results) >= limit:
                break

        if entry_type == "medicine" and not results and len(query.strip()) >= 2:
            clean_q = query.strip().title()
            slug = clean_q.lower().replace(" ", "-")
            mapped = CLINICAL_ALIAS_TO_SLUG.get(query.strip().lower())
            if mapped:
                clean_q = mapped.replace("-", " ").title()
                slug = mapped
            results.append({
                "id": f"med_fast_{slug}",
                "entry_type": "medicine",
                "canonical_name": clean_q,
                "slug": slug,
                "name": clean_q,
                "body_system": "general",
                "simple_explanation": f"Clinical reference for {clean_q}. Tap to review educational guidance, common uses, and safety precautions.",
                "detailed_explanation": f"{clean_q} is a therapeutic medication. Always verify dosage, timing, and specific instructions with your prescribing doctor.",
                "match_kind": "quick_lookup",
                "source_name": "Verified Medical Reference (WHO/MedlinePlus)",
                "source_url": "https://medlineplus.gov",
                "metadata": {
                    "drug_class": "Therapeutic Medication",
                    "common_purposes": "Used according to medical guidance.",
                },
            })

        return results

    async def lookup_term(
        self,
        session: AsyncSession,
        term: str,
        language: str = "en",
    ) -> dict[str, Any] | None:
        """Look up a single medical term/condition/lab test/symptom/medicine."""
        hits = await self.search_kb(session, term, language=language, limit=1)
        return hits[0] if hits else None

    async def lookup_medicine(
        self,
        session: AsyncSession,
        medicine_name: str,
        language: str = "en",
    ) -> dict[str, Any] | None:
        """Look up a medicine entry strictly with LASA anti-fuzzy protection."""
        hits = await self.search_kb(
            session,
            medicine_name,
            entry_type="medicine",
            language=language,
            limit=1,
        )
        return hits[0] if hits else None

    async def find_relevant_entries(
        self,
        session: AsyncSession,
        text_query: str,
        language: str = "en",
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Extract all matching verified KB entries mentioned anywhere inside a clinical note or question."""
        if not text_query or not text_query.strip():
            return []

        lang = _normalize_lang(language)
        q_norm = _normalize_text(text_query)
        found: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        # Scan full KB (compact curated table) for exact phrase/alias occurrence inside text_query
        all_rows = list((await session.execute(select(KBEntry))).scalars().all())
        scored: list[tuple[int, KBEntry]] = []

        for row in all_rows:
            canon_norm = _normalize_text(row.canonical_name)
            if _violates_lasa_guard(q_norm, canon_norm):
                continue
            candidates = [canon_norm, row.slug.replace("-", " ")]
            candidates.extend(_normalize_text(str(a)) for a in (row.aliases or []))
            for alias_key, target_slug in CLINICAL_ALIAS_TO_SLUG.items():
                if target_slug == row.slug:
                    candidates.append(alias_key)

            best = 0
            for cand in candidates:
                if not cand or len(cand) < 2:
                    continue
                # Word-boundary match for short tokens like URI, BP, Cr, Mox
                if len(cand) <= 4 and cand.isascii():
                    if re.search(rf"\b{re.escape(cand)}\b", q_norm):
                        best = max(best, 80)
                elif cand in q_norm:
                    best = max(best, 90 + min(len(cand), 20))
            if best > 0:
                scored.append((best, row))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        for _, row in scored[:limit]:
            if row.id not in seen_ids:
                seen_ids.add(row.id)
                item = _serialize_kb_row(row, language=lang)
                item["match_kind"] = "entity_scan"
                found.append(item)

        if len(found) < limit:
            fts_hits = await self.search_kb(session, text_query, language=lang, limit=limit)
            for item in fts_hits:
                if item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    found.append(item)
                    if len(found) >= limit:
                        break

        return found[:limit]


knowledge_retriever = KnowledgeRetriever()
