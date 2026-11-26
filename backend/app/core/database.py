"""Async SQLAlchemy SQLite engine (WAL + foreign keys) and FTS5 KB search helpers."""

from collections.abc import AsyncGenerator
from typing import Any
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all 12 lean SQLAlchemy models."""


def _configure_sqlite_connection(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.close()


def create_engine_from_url(database_url: str) -> AsyncEngine:
    """Create an async engine with SQLite WAL & FK pragmas when using sqlite."""
    engine = create_async_engine(
        database_url,
        echo=False,
        future=True,
        pool_pre_ping=True,
    )
    if database_url.startswith("sqlite"):
        event.listen(engine.sync_engine, "connect", _configure_sqlite_connection)
    return engine


settings = get_settings()
engine = create_engine_from_url(settings.DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


FTS5_DDL_STATEMENTS = [
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_entries_fts USING fts5(
        entry_id UNINDEXED,
        entry_type,
        canonical_name,
        aliases_text,
        simple_en,
        detailed_en,
        translations_text,
        tokenize='unicode61'
    );
    """,
    """
    CREATE TRIGGER IF NOT EXISTS kb_entries_ai AFTER INSERT ON kb_entries BEGIN
        INSERT INTO kb_entries_fts(
            entry_id, entry_type, canonical_name, aliases_text,
            simple_en, detailed_en, translations_text
        ) VALUES (
            new.id,
            new.entry_type,
            new.canonical_name,
            COALESCE(CAST(new.aliases AS TEXT), ''),
            new.simple_en,
            COALESCE(new.detailed_en, ''),
            COALESCE(CAST(new.translations AS TEXT), '')
        );
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS kb_entries_ad AFTER DELETE ON kb_entries BEGIN
        DELETE FROM kb_entries_fts WHERE entry_id = old.id;
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS kb_entries_au AFTER UPDATE ON kb_entries BEGIN
        DELETE FROM kb_entries_fts WHERE entry_id = old.id;
        INSERT INTO kb_entries_fts(
            entry_id, entry_type, canonical_name, aliases_text,
            simple_en, detailed_en, translations_text
        ) VALUES (
            new.id,
            new.entry_type,
            new.canonical_name,
            COALESCE(CAST(new.aliases AS TEXT), ''),
            new.simple_en,
            COALESCE(new.detailed_en, ''),
            COALESCE(CAST(new.translations AS TEXT), '')
        );
    END;
    """,
]


async def init_db(target_engine: AsyncEngine | None = None) -> None:
    """Create all tables and SQLite FTS5 virtual table + sync triggers."""
    import app.models  # noqa: F401 - ensures all 12 models are registered on Base.metadata

    active_engine = target_engine or engine
    async with active_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if active_engine.url.drivername.startswith("sqlite"):
            for ddl in FTS5_DDL_STATEMENTS:
                await conn.execute(text(ddl))


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session."""
    async with AsyncSessionLocal() as session:
        yield session


def _sanitize_fts_query(query: str) -> str:
    tokens = [
        "".join(ch for ch in token if ch.isalnum() or ch in ("_", "-"))
        for token in query.strip().split()
    ]
    clean_tokens = [f'"{tok}"*' for tok in tokens if tok]
    return " OR ".join(clean_tokens)


async def search_kb_fts(
    session: AsyncSession,
    query: str,
    entry_type: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Query kb_entries_fts with BM25 ranking and return matched KB row summaries."""
    fts_expr = _sanitize_fts_query(query)
    if not fts_expr:
        return []

    sql = """
        SELECT
            k.id,
            k.entry_type,
            k.canonical_name,
            k.slug,
            k.aliases,
            k.body_system,
            k.simple_en,
            k.detailed_en,
            k.translations,
            k.metadata_json,
            k.source_name,
            k.source_url,
            k.last_reviewed_at,
            bm25(kb_entries_fts) AS rank
        FROM kb_entries_fts
        JOIN kb_entries k ON k.id = kb_entries_fts.entry_id
        WHERE kb_entries_fts MATCH :fts_expr
    """
    params: dict[str, Any] = {"fts_expr": fts_expr, "limit": limit}
    if entry_type:
        sql += " AND k.entry_type = :entry_type"
        params["entry_type"] = entry_type
    sql += " ORDER BY rank ASC LIMIT :limit"

    result = await session.execute(text(sql), params)
    return [dict(row) for row in result.mappings().all()]
