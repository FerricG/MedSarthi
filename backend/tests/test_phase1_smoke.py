"""Phase 1 smoke tests: DB creation, 12 models, auth lifecycle, KB FTS5 search, and health check."""

from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from app.core import database as db_module
from app.core.config import get_settings
from app.main import create_app
from app.models import (
    AudioRecord,
    AuthSession,
    Consultation,
    Conversation,
    ConversationMessage,
    DoctorPatientLink,
    DoctorProfile,
    KBEntry,
    MedicalDocument,
    PatientPreference,
    PatientProfile,
    User,
)
from app.seeds.seed_data import DEMO_DOCTOR_EMAIL, DEMO_DOCTOR_PASSWORD, DEMO_PATIENT_EMAIL, DEMO_PATIENT_PASSWORD, seed_database


@pytest.fixture
async def test_app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Create an isolated temp SQLite WAL database and seeded FastAPI app."""
    db_path = tmp_path / "test_medsarthi.db"
    storage_dir = tmp_path / "storage"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("STORAGE_LOCAL_DIR", str(storage_dir))
    get_settings.cache_clear()

    test_engine = db_module.create_engine_from_url(f"sqlite+aiosqlite:///{db_path.as_posix()}")
    test_session_maker = db_module.async_sessionmaker(
        bind=test_engine,
        class_=db_module.AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    monkeypatch.setattr(db_module, "engine", test_engine)
    monkeypatch.setattr(db_module, "AsyncSessionLocal", test_session_maker)

    await db_module.init_db(test_engine)
    async with test_session_maker() as session:
        await seed_database(session)

    app = create_app()
    yield app, test_engine, test_session_maker

    await test_engine.dispose()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_db_tables_pragmas_and_seed_integrity(test_app):
    """Verify all 12 tables, FTS5 table, SQLite WAL + FKs, and synthetic seed rows."""
    _app, _engine, session_maker = test_app

    expected_tables = {
        User.__tablename__,
        AuthSession.__tablename__,
        PatientProfile.__tablename__,
        PatientPreference.__tablename__,
        DoctorProfile.__tablename__,
        DoctorPatientLink.__tablename__,
        Consultation.__tablename__,
        MedicalDocument.__tablename__,
        AudioRecord.__tablename__,
        Conversation.__tablename__,
        ConversationMessage.__tablename__,
        KBEntry.__tablename__,
    }
    assert len(expected_tables) == 12

    async with session_maker() as session:
        fk_enabled = (await session.execute(text("PRAGMA foreign_keys;"))).scalar_one()
        journal_mode = (await session.execute(text("PRAGMA journal_mode;"))).scalar_one()
        assert fk_enabled == 1
        assert str(journal_mode).lower() == "wal"

        tables_rows = (
            await session.execute(
                text("SELECT name FROM sqlite_master WHERE type IN ('table', 'view');")
            )
        ).scalars().all()
        assert expected_tables.issubset(set(tables_rows))
        assert "kb_entries_fts" in set(tables_rows)

        kb_count = (await session.execute(text("SELECT COUNT(*) FROM kb_entries;"))).scalar_one()
        assert kb_count == 12

        # Idempotent re-seed should not duplicate
        res = await seed_database(session)
        assert res["kb_created"] == 0


@pytest.mark.asyncio
async def test_kb_fts5_search(test_app):
    """Verify SQLite FTS5 search matches clinical terms, medicines, aliases, and Hinglish."""
    _app, _engine, session_maker = test_app

    async with session_maker() as session:
        metformin_hits = await db_module.search_kb_fts(session, "Metformin")
        assert len(metformin_hits) >= 1
        assert metformin_hits[0]["slug"] == "metformin"
        assert metformin_hits[0]["source_name"] == "MedlinePlus"

        hinglish_hits = await db_module.search_kb_fts(session, "phephdon")
        assert any(row["slug"] in ("pneumonia", "upper-respiratory-infection") for row in hinglish_hits)

        lab_hits = await db_module.search_kb_fts(session, "HbA1c", entry_type="lab_test")
        assert len(lab_hits) == 1
        assert lab_hits[0]["canonical_name"] == "HbA1c"


@pytest.mark.asyncio
async def test_health_endpoint(test_app):
    """Verify /api/health returns prototype notice, DB ok, storage ok, and local packages."""
    app, _engine, _session_maker = test_app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["status"] == "ok"
        assert body["data"]["prototype"] is True
        assert body["data"]["db"] == "ok"
        assert body["data"]["storage"] == "ok"
        assert body["data"]["ocr_local"] in ("pymupdf", "pymupdf+rapidocr")
        assert body["data"]["tts_local"] in ("mithi_v2_flash_cuda", "mithi_v2_flash_cpu")


@pytest.mark.asyncio
async def test_auth_lifecycle_and_demo_users(test_app):
    """Verify register, age-based defaults, login, /me, rotating refresh, replay protection, and logout."""
    app, _engine, _session_maker = test_app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register new patient (age 62 -> xl / 0.75 defaults)
        reg = await client.post(
            "/api/auth/register",
            json={
                "email": "asha.test@medsarthi.local",
                "password": "StrongPassword#123",
                "role": "patient",
                "name": "Asha Verma",
                "age_years": 62,
                "gender": "female",
            },
        )
        assert reg.status_code == 201
        reg_data = reg.json()["data"]
        assert reg_data["user"]["role"] == "patient"
        assert reg_data["onboarding_required"] is True
        assert reg_data["preferences"]["font_size"] == "xl"
        assert reg_data["preferences"]["audio_speed"] == 0.75

        access_token = reg_data["access_token"]
        csrf_token = reg_data["csrf_token"]

        # 2. /api/auth/me
        me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me.status_code == 200
        assert me.json()["data"]["patient_profile"]["name"] == "Asha Verma"

        # 3. Rotating refresh with CSRF header + HttpOnly cookie
        first_refresh_cookie = client.cookies.get("medsarthi_refresh_token")
        assert first_refresh_cookie
        ref = await client.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf_token})
        assert ref.status_code == 200
        ref_data = ref.json()["data"]
        assert ref_data["access_token"] != ""
        new_csrf = ref_data["csrf_token"]

        # 4. Replay detection with old refresh token revokes session family
        async with AsyncClient(transport=transport, base_url="http://test") as replay_client:
            replay_client.cookies.set("medsarthi_refresh_token", first_refresh_cookie)
            replay_client.cookies.set("medsarthi_csrf_token", new_csrf)
            replay = await replay_client.post(
                "/api/auth/refresh",
                headers={"X-CSRF-Token": new_csrf},
            )
            assert replay.status_code == 401
            assert replay.json()["error"]["code"] == "AUTH_SESSION_REVOKED"

        # 5. Seeded Demo Patient login (Ramesh Sharma, age 64)
        demo_pat = await client.post(
            "/api/auth/login",
            json={"identifier": DEMO_PATIENT_EMAIL, "password": DEMO_PATIENT_PASSWORD},
        )
        assert demo_pat.status_code == 200
        pat_data = demo_pat.json()["data"]
        assert pat_data["patient_profile"]["name"] == "Ramesh Sharma"
        assert pat_data["onboarding_completed"] is True
        assert pat_data["preferences"]["font_size"] == "xl"
        assert pat_data["preferences"]["audio_speed"] == 0.75

        # 6. Logout revokes session
        logout = await client.post(
            "/api/auth/logout",
            headers={
                "Authorization": f"Bearer {pat_data['access_token']}",
                "X-CSRF-Token": pat_data["csrf_token"],
            },
        )
        assert logout.status_code == 200
        assert logout.json()["data"]["logged_out"] is True

        me_after_logout = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {pat_data['access_token']}"},
        )
        assert me_after_logout.status_code == 401

        # 7. Seeded Demo Doctor login (Dr. Priya Mehta)
        demo_doc = await client.post(
            "/api/auth/login",
            json={"identifier": DEMO_DOCTOR_EMAIL, "password": DEMO_DOCTOR_PASSWORD},
        )
        assert demo_doc.status_code == 200
        assert demo_doc.json()["data"]["doctor_profile"]["full_name"] == "Dr. Priya Mehta"
