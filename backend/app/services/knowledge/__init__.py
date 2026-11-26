"""Knowledge Base retrieval package (SQLite FTS5 + curated diagrams)."""

from app.services.knowledge.retriever import (
    CLINICAL_ALIAS_TO_SLUG,
    LASA_EXCLUSION_PAIRS,
    KnowledgeRetriever,
    get_diagram,
    knowledge_retriever,
    list_diagrams,
    load_diagrams_catalog,
)

__all__ = [
    "CLINICAL_ALIAS_TO_SLUG",
    "LASA_EXCLUSION_PAIRS",
    "KnowledgeRetriever",
    "get_diagram",
    "knowledge_retriever",
    "list_diagrams",
    "load_diagrams_catalog",
]
