"""Curated medical terminology & medicines knowledge base model (Table 12 + FTS5 index)."""

from datetime import UTC, datetime
import uuid
from sqlalchemy import CheckConstraint, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(UTC)


class KBEntry(Base):
    """12. kb_entries — Verified clinical terms and medicines indexed by kb_entries_fts (FTS5)."""

    __tablename__ = "kb_entries"
    __table_args__ = (
        CheckConstraint(
            "entry_type IN ('condition', 'symptom', 'lab_test', 'medicine', 'procedure', 'anatomy', 'abbreviation')",
            name="ck_kb_entry_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    entry_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    canonical_name: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    aliases: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    body_system: Mapped[str | None] = mapped_column(String(80), nullable=True)
    simple_en: Mapped[str] = mapped_column(Text, nullable=False)
    detailed_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    translations: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_url: Mapped[str] = mapped_column(String(512), nullable=False)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
