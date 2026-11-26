"""Verified medical terminology, medicines, and curated SVG diagram lookup routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db
from app.core.exceptions import AppError
from app.models.knowledge import KBEntry
from app.routes._helpers import serialize_kb_term
from app.schemas.common import ok_envelope
from app.services.knowledge.retriever import (
    _serialize_kb_row,
    knowledge_retriever,
    list_diagrams,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/terms/search")
async def search_terms(
    q: str = Query(default="", max_length=200),
    language: str = Query(default="en"),
    limit: int = Query(default=10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search verified medical terms across English, Hindi, and Hinglish."""
    if not q.strip():
        return ok_envelope([])
    hits = await knowledge_retriever.search_kb(db, q, language=language, limit=limit)
    return ok_envelope([serialize_kb_term(item) for item in hits])


@router.get("/terms/{slug}")
async def get_term_by_slug(
    slug: str,
    language: str = Query(default="en"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch a verified medical KB entry by slug."""
    entry = await knowledge_retriever.get_by_slug(db, slug, language=language)
    if not entry:
        raise AppError(404, "NOT_FOUND", f"Medical term '{slug}' not found.")
    return ok_envelope(serialize_kb_term(entry))


@router.get("/medicines/search")
async def search_medicines(
    q: str = Query(default="", max_length=200),
    language: str = Query(default="en"),
    limit: int = Query(default=10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search verified medicine entries respecting LASA anti-fuzzy protection."""
    if not q.strip():
        return ok_envelope([])
    hits = await knowledge_retriever.search_kb(
        db, q, entry_type="medicine", language=language, limit=limit
    )
    return ok_envelope([serialize_kb_term(item) for item in hits])


@router.get("/medicines/{medicine_id}")
async def get_medicine_by_id(
    medicine_id: str,
    language: str = Query(default="en"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch a verified medicine KB entry by ID or slug."""
    row = (
        await db.execute(
            select(KBEntry).where(
                KBEntry.entry_type == "medicine",
                or_(KBEntry.id == medicine_id, KBEntry.slug == medicine_id),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise AppError(404, "NOT_FOUND", f"Medicine '{medicine_id}' not found.")
    serialized = _serialize_kb_row(row, language=language)
    return ok_envelope(serialize_kb_term(serialized))


@router.get("/diagrams")
async def get_diagrams(
    key: str | None = Query(default=None),
    related_term: str | None = Query(default=None),
    language: str = Query(default="en"),
    depth: str = Query(default="simple"),
) -> dict:
    """List localized curated SVG diagram metadata."""
    return ok_envelope(
        list_diagrams(language=language, key=key, related_term=related_term, depth=depth)
    )
