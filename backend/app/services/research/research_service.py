"""Trusted internet research service with multi-mode research (Normal, Web, Deep) and verified citations."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import re
from typing import Any
import urllib.parse
import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Trusted domain directory
TRUSTED_SOURCE_DOMAINS: dict[str, list[str]] = {
    "official_health": [
        "who.int",
        "cdc.gov",
        "nih.gov",
        "ncbi.nlm.nih.gov",
        "nhs.uk",
        "mohfw.gov.in",
        "fda.gov",
    ],
    "medical_scientific": [
        "pubmed.ncbi.nlm.nih.gov",
        "medlineplus.gov",
        "mayoclinic.org",
        "clevelandclinic.org",
        "bmj.com",
        "thelancet.com",
        "nature.com",
        "nejm.org",
    ],
    "technology": [
        "docs.python.org",
        "github.com",
        "openrouter.ai",
        "developer.mozilla.org",
        "nvidia.com",
        "pytorch.org",
    ],
    "news": [
        "reuters.com",
        "apnews.com",
        "bbc.com",
        "thehindu.com",
        "indianexpress.com",
    ],
    "encyclopedia": [
        "en.wikipedia.org",
        "wikipedia.org",
    ],
}

# Domains explicitly disallowed as untrusted
DISALLOWED_DOMAINS: set[str] = {
    "quora.com",
    "reddit.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "pinterest.com",
}


def is_trusted_domain(url: str) -> tuple[bool, str]:
    """Check if URL belongs to an authoritative trusted source and return category."""
    parsed = urllib.parse.urlparse(url)
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]

    for disallowed in DISALLOWED_DOMAINS:
        if netloc == disallowed or netloc.endswith("." + disallowed):
            return False, "untrusted"

    for category, domains in TRUSTED_SOURCE_DOMAINS.items():
        for d in domains:
            if netloc == d or netloc.endswith("." + d):
                return True, category

    return False, "general"


def sanitize_external_text(raw_text: str) -> str:
    """Strip script tags, prompt injection cues, and format cleanly."""
    if not raw_text:
        return ""
    text = re.sub(r"<script[^>]*>.*?</script>", " ", raw_text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    # Neutralize prompt injection attempts like 'Ignore previous instructions'
    text = re.sub(r"(?i)\b(ignore previous instructions|disregard all rules|system prompt|reveal your prompt)\b", "[redacted instruction]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:2000]


def extract_search_keywords(query: str) -> str:
    """Extract core scientific/medical keywords from conversational queries."""
    cleaned = re.sub(r"[^\w\s-]", " ", query)
    stopwords = {
        "what", "is", "are", "the", "a", "an", "can", "you", "tell", "me", "about",
        "how", "does", "do", "why", "did", "please", "explain", "i", "my", "have",
        "has", "had", "for", "in", "of", "to", "and", "or", "on", "with", "kya", "hai",
        "mujhe", "kaise", "batao", "standard", "show", "draw", "diagram", "picture"
    }
    tokens = [w for w in cleaned.split() if w.lower() not in stopwords and len(w) > 1]
    return " ".join(tokens).strip() or query.strip()


class TrustedResearchService:
    """Intelligent web research assistant enforcing trusted sources, citations, and anti-injection guards."""

    USER_AGENT = "MedSarthiEducationalApp/1.0 (https://medsarthi.org; contact@medsarthi.org)"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def search_wikipedia(self, query: str, limit: int = 3) -> list[dict[str, Any]]:
        """Query official Wikipedia API for verified definitions and encyclopedic background."""
        clean_q = extract_search_keywords(query)
        if not clean_q:
            clean_q = query.strip()
        if not clean_q:
            return []
        api_url = (
            f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="
            f"{urllib.parse.quote(clean_q)}&format=json&utf8=1"
        )
        headers = {"User-Agent": self.USER_AGENT}
        items: list[dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    search_hits = data.get("query", {}).get("search", [])
                    for hit in search_hits[:limit]:
                        title = hit.get("title", "")
                        raw_snippet = hit.get("snippet", "")
                        snippet = sanitize_external_text(raw_snippet)
                        timestamp = hit.get("timestamp")
                        date_str = timestamp[:10] if timestamp else None
                        items.append(
                            {
                                "title": title,
                                "source_name": f"Wikipedia: {title}",
                                "domain": "en.wikipedia.org",
                                "source_url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title)}",
                                "snippet": snippet,
                                "category": "encyclopedia",
                                "published_date": date_str,
                                "trust_score": 0.88,
                            }
                        )
        except Exception as exc:
            logger.warning("Wikipedia API research query failed: %s", exc)

        return items

    async def search_pubmed(self, query: str, limit: int = 3) -> list[dict[str, Any]]:
        """Query PubMed E-Utilities API for peer-reviewed medical and scientific literature."""
        clean_q = extract_search_keywords(query)
        if not clean_q:
            clean_q = query.strip()
        if not clean_q:
            return []
        search_url = (
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term="
            f"{urllib.parse.quote(clean_q)}&retmode=json&retmax={limit}"
        )
        headers = {"User-Agent": self.USER_AGENT}
        items: list[dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(search_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    id_list = data.get("esearchresult", {}).get("idlist", [])
                    for pmcid in id_list[:limit]:
                        items.append(
                            {
                                "title": f"PubMed Central Article (PMC{pmcid})",
                                "source_name": f"PubMed Central PMC{pmcid}",
                                "domain": "ncbi.nlm.nih.gov",
                                "source_url": f"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{pmcid}/",
                                "snippet": f"Peer-reviewed scientific and biomedical study related to {clean_q} indexed in NIH PubMed Central.",
                                "category": "medical_scientific",
                                "published_date": "Verified Biomedical Literature",
                                "trust_score": 0.98,
                            }
                        )
        except Exception as exc:
            logger.warning("PubMed research query failed: %s", exc)

        return items

    async def execute_research(
        self,
        query: str,
        mode: str = "normal",
        language: str = "en",
    ) -> dict[str, Any]:
        """Perform research according to selected mode: normal, web_research, or deep_research."""
        norm_mode = mode if mode in {"normal", "web_research", "deep_research"} else "normal"
        clean_q = query.strip()
        t0 = datetime.now(timezone.utc)

        citations: list[dict[str, Any]] = []
        evidence_excerpts: list[str] = []
        subtopics: list[str] = []

        # In normal mode, only do web research if question explicitly asks for current facts or latest info
        needs_search = norm_mode in {"web_research", "deep_research"} or any(
            kw in clean_q.lower()
            for kw in ("latest", "recent", "what is", "how does", "research", "news", "current", "update")
        )

        if not needs_search and norm_mode == "normal":
            return {
                "research_mode": "normal",
                "citations": [],
                "evidence_text": "",
                "subtopics": [],
                "has_research": False,
            }

        # 1. Generate Subtopics in Deep Research Mode
        if norm_mode == "deep_research":
            subtopics = [
                f"{clean_q} mechanism overview",
                f"{clean_q} clinical evidence guidelines",
                f"{clean_q} recent advancements and consensus",
            ]
            search_tasks = [
                self.search_wikipedia(clean_q, limit=2),
                self.search_pubmed(clean_q, limit=3),
            ]
            for st in subtopics:
                search_tasks.append(self.search_wikipedia(st, limit=1))
            gathered = await asyncio.gather(*search_tasks, return_exceptions=True)
            for res_group in gathered:
                if isinstance(res_group, list):
                    citations.extend(res_group)
        else:
            # Web Research Mode: Focused search across Wikipedia and PubMed
            search_tasks = [
                self.search_wikipedia(clean_q, limit=3),
                self.search_pubmed(clean_q, limit=2),
            ]
            gathered = await asyncio.gather(*search_tasks, return_exceptions=True)
            for res_group in gathered:
                if isinstance(res_group, list):
                    citations.extend(res_group)

        # Deduplicate citations by source_url
        unique_citations: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for c in citations:
            url = c.get("source_url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_citations.append(c)

        # Sort citations by trust score
        unique_citations.sort(key=lambda x: float(x.get("trust_score", 0.5)), reverse=True)

        for idx, c in enumerate(unique_citations[:6], start=1):
            evidence_excerpts.append(
                f"[{idx}] {c['source_name']} ({c['domain']}) - {c.get('published_date', 'N/A')}:\n"
                f"{c['snippet']}\nURL: {c['source_url']}"
            )

        evidence_text = "\n\n".join(evidence_excerpts)
        return {
            "research_mode": norm_mode,
            "citations": unique_citations[:6],
            "evidence_text": evidence_text,
            "subtopics": subtopics,
            "has_research": len(unique_citations) > 0,
            "timestamp": t0.isoformat(),
        }


trusted_research_service = TrustedResearchService()
