"""Comprehensive API integration tests covering all MedSarthi routes, isolation, safety gates, and 7-step judge demo."""

from __future__ import annotations

import io
import math
from pathlib import Path
import struct
import wave
import pymupdf
import pytest
from httpx import ASGITransport, AsyncClient
from app.core import database as db_module
from app.core.config import get_settings
from app.main import create_app
from app.seeds.seed_data import DEMO_DOCTOR_EMAIL, DEMO_PATIENT_EMAIL, seed_database


def _make_pdf_bytes(lines: list[str]) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    for line in lines:
        page.insert_text((72, y), line, fontsize=12)
        y += 22
    raw = doc.tobytes()
    doc.close()
    return raw


def _make_wav_bytes(duration_sec: float = 0.6, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(int(sample_rate * duration_sec)):
            val = int(7000 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(bytes(frames))
    return buf.getvalue()


def _auth_headers(token: str, csrf: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    return headers


@pytest.fixture
async def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Isolated temp SQLite WAL database + storage directory + seeded FastAPI app."""
    db_path = tmp_path / "integration_medsarthi.db"
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("STORAGE_LOCAL_DIR", str(storage_dir))
    monkeypatch.setenv("SYNTHETIC_PROTOTYPE_MODE", "true")
    monkeypatch.setenv("GROQ_API_KEY", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("DEEPGRAM_API_KEY", "")
    monkeypatch.setenv("AZURE_SPEECH_KEY", "")
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
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, storage_dir, test_session_maker, monkeypatch

    await test_engine.dispose()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_demo_login_auto_seed_and_prototype_gate(api_client):
    client, _storage, _sm, monkeypatch = api_client

    # Demo login auto-seeds when DB has no users yet
    pat_resp = await client.post("/api/demo/login", json={"role": "patient"})
    assert pat_resp.status_code == 200
    pat_data = pat_resp.json()["data"]
    assert pat_data["user"]["email"] == DEMO_PATIENT_EMAIL
    assert pat_data["patient_profile"]["name"] == "Ramesh Sharma"
    assert pat_data["preferences"]["font_size"] == "xl"
    assert pat_data["preferences"]["audio_speed"] == 0.75
    assert pat_data["access_token"]

    doc_resp = await client.post("/api/demo/login", json={"role": "doctor"})
    assert doc_resp.status_code == 200
    doc_data = doc_resp.json()["data"]
    assert doc_data["user"]["email"] == DEMO_DOCTOR_EMAIL
    assert doc_data["doctor_profile"]["full_name"] == "Dr. Priya Mehta"

    # Disabled when SYNTHETIC_PROTOTYPE_MODE=false
    monkeypatch.setenv("SYNTHETIC_PROTOTYPE_MODE", "false")
    get_settings.cache_clear()
    blocked = await client.post("/api/demo/login", json={"role": "patient"})
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "RBAC_FORBIDDEN"


@pytest.mark.asyncio
async def test_onboarding_preferences_persistence_and_reset(api_client):
    client, _storage, _sm, _mp = api_client

    reg = await client.post(
        "/api/auth/register",
        json={
            "email": "meera.onb@medsarthi.local",
            "password": "StrongPassword#123",
            "role": "patient",
            "name": "Meera Nair",
            "age_years": 65,
            "gender": "female",
        },
    )
    assert reg.status_code == 201
    tok = reg.json()["data"]["access_token"]

    # Check initial age-based defaults (65 -> xl, 135%, 0.75x)
    me = await client.get("/api/patients/me", headers=_auth_headers(tok))
    assert me.status_code == 200
    assert me.json()["data"]["preferences"]["font_size"] == "xl"
    assert me.json()["data"]["preferences"]["audio_speed"] == 0.75
    assert me.json()["data"]["preferences"]["accessibility_manual_override"] is False

    # Manual font/speed change sets accessibility_manual_override = True
    patch_pref = await client.patch(
        "/api/patients/me/preferences",
        headers=_auth_headers(tok),
        json={
            "preferred_language": "hi",
            "font_size": "medium",
            "font_scale_pct": 100,
            "audio_speed": 1.15,
            "high_contrast": True,
        },
    )
    assert patch_pref.status_code == 200
    pref_data = patch_pref.json()["data"]
    assert pref_data["preferred_language"] == "hi"
    assert pref_data["font_size"] == "medium"
    assert pref_data["audio_speed"] == 1.15
    assert pref_data["high_contrast"] is True
    assert pref_data["accessibility_manual_override"] is True

    # Complete onboarding via POST /api/patients
    onb = await client.post(
        "/api/patients",
        headers=_auth_headers(tok),
        json={"onboarding_step": 7, "onboarding_completed": True},
    )
    assert onb.status_code == 201
    assert onb.json()["data"]["patient_profile"]["onboarding_completed"] is True

    # Reset accessibility to age-recommended defaults
    reset_resp = await client.patch(
        "/api/patients/me/preferences",
        headers=_auth_headers(tok),
        json={"reset_accessibility_to_recommended": True},
    )
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()["data"]
    assert reset_data["font_size"] == "xl"
    assert reset_data["font_scale_pct"] == 135
    assert reset_data["audio_speed"] == 0.75
    assert reset_data["accessibility_manual_override"] is False


@pytest.mark.asyncio
async def test_patient_isolation_and_doctor_consent_lifecycle(api_client):
    client, _storage, session_maker, _mp = api_client
    async with session_maker() as s:
        await seed_database(s)

    # Demo Patient A (Ramesh) and Demo Doctor A (Dr. Priya)
    pat_a = (await client.post("/api/demo/login", json={"role": "patient"})).json()["data"]
    tok_a = pat_a["access_token"]
    pat_a_id = pat_a["patient_profile"]["id"]

    # Register Patient B and Unlinked Doctor B
    pat_b = (
        await client.post(
            "/api/auth/register",
            json={
                "email": "patient.b@medsarthi.local",
                "password": "StrongPassword#123",
                "role": "patient",
                "name": "Patient Beta",
                "age_years": 32,
            },
        )
    ).json()["data"]
    tok_b = pat_b["access_token"]

    doc_b = (
        await client.post(
            "/api/auth/register",
            json={
                "email": "doctor.b@medsarthi.local",
                "password": "StrongPassword#123",
                "role": "doctor",
                "name": "Dr. Arjun Rao",
            },
        )
    ).json()["data"]
    tok_doc_b = doc_b["access_token"]

    # Patient A has seeded consultation & doc
    a_consults = (await client.get("/api/consultations", headers=_auth_headers(tok_a))).json()["data"]
    assert len(a_consults) >= 1
    a_consult_id = a_consults[0]["id"]

    a_docs = (await client.get("/api/documents", headers=_auth_headers(tok_a))).json()["data"]
    assert len(a_docs) >= 1
    a_doc_id = a_docs[0]["id"]

    # Patient B CANNOT read Patient A's consultation, doc, or create chat on it
    assert (await client.get(f"/api/consultations/{a_consult_id}", headers=_auth_headers(tok_b))).status_code == 403
    assert (await client.get(f"/api/documents/{a_doc_id}", headers=_auth_headers(tok_b))).status_code == 403
    assert (
        await client.post(
            "/api/chat",
            headers=_auth_headers(tok_b),
            json={"message_text": "What is my medicine?", "context_consultation_id": a_consult_id},
        )
    ).status_code == 403

    # Patient A creates a chat thread; Patient B cannot read or delete it
    chat_a = await client.post(
        "/api/chat",
        headers=_auth_headers(tok_a),
        json={"message_text": "What is Hypertension?", "context_consultation_id": a_consult_id},
    )
    assert chat_a.status_code == 200
    conv_a_id = chat_a.json()["data"]["conversation_id"]
    assert (
        await client.get(
            f"/api/chat/history?conversation_id={conv_a_id}",
            headers=_auth_headers(tok_b),
        )
    ).status_code == 403
    assert (
        await client.delete(
            f"/api/chat/conversations/{conv_a_id}",
            headers=_auth_headers(tok_b),
        )
    ).status_code == 403

    # Unlinked Doctor B gets 403 CONSENT_REQUIRED for Patient A
    unlinked_doc_resp = await client.get(
        f"/api/documents?patient_id={pat_a_id}",
        headers=_auth_headers(tok_doc_b),
    )
    assert unlinked_doc_resp.status_code == 403
    assert unlinked_doc_resp.json()["error"]["code"] == "CONSENT_REQUIRED"

    unlinked_create = await client.post(
        "/api/doctor/consultation",
        headers=_auth_headers(tok_doc_b),
        json={
            "patient_id": pat_a_id,
            "title": "Unauthorized Attempt",
            "original_doctor_input": "Fever.",
        },
    )
    assert unlinked_create.status_code == 403
    assert unlinked_create.json()["error"]["code"] == "CONSENT_REQUIRED"

    # Doctor B requests consent link -> pending; Doctor B CANNOT self-accept (403)
    req_link = await client.post(
        "/api/consent/doctor-links",
        headers=_auth_headers(tok_doc_b),
        json={"patient_identifier": DEMO_PATIENT_EMAIL, "consent_scope": "linked_care"},
    )
    assert req_link.status_code == 201
    link_id = req_link.json()["data"]["link_id"]
    assert req_link.json()["data"]["consent_status"] == "pending"

    doc_self_accept = await client.post(
        f"/api/consent/doctor-links/{link_id}/accept",
        headers=_auth_headers(tok_doc_b),
        json={"confirm_consent": True},
    )
    assert doc_self_accept.status_code == 403

    # Patient A accepts -> active -> Doctor B now has access -> Patient A revokes -> blocked again
    accept_resp = await client.post(
        f"/api/consent/doctor-links/{link_id}/accept",
        headers=_auth_headers(tok_a),
        json={"confirm_consent": True},
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["data"]["consent_status"] == "active"

    linked_docs = await client.get(
        f"/api/documents?patient_id={pat_a_id}",
        headers=_auth_headers(tok_doc_b),
    )
    assert linked_docs.status_code == 200

    revoke_resp = await client.post(
        f"/api/consent/doctor-links/{link_id}/revoke",
        headers=_auth_headers(tok_a),
        json={},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["consent_status"] == "revoked"

    post_revoke = await client.get(
        f"/api/documents?patient_id={pat_a_id}",
        headers=_auth_headers(tok_doc_b),
    )
    assert post_revoke.status_code == 403
    assert post_revoke.json()["error"]["code"] == "CONSENT_REQUIRED"


@pytest.mark.asyncio
async def test_full_7_step_judge_demo_e2e_flow(api_client):
    """Full 7-step Judge Demo: Doctor creates URI note -> generates -> approves & shares -> Patient views, translates HI, requests TTS, Explain More, asks pneumonia Q&A."""
    client, _storage, _sm, _mp = api_client

    # Step 1: Doctor logs in and verifies linked patients (plus tests POST /api/doctor/patients)
    doc_login = (await client.post("/api/demo/login", json={"role": "doctor"})).json()["data"]
    tok_doc = doc_login["access_token"]

    pat_list = (await client.get("/api/doctor/patients", headers=_auth_headers(tok_doc))).json()["data"]
    ramesh = next(p for p in pat_list if "Ramesh" in p["name"])
    ramesh_id = ramesh["patient_id"]

    # Also verify doctor can create a synthetic patient directly
    new_pat = await client.post(
        "/api/doctor/patients",
        headers=_auth_headers(tok_doc),
        json={
            "name": "Sunita Devi",
            "age_years": 58,
            "gender": "female",
            "preferred_language": "hi",
            "reading_comfort_level": "very_simple",
        },
    )
    assert new_pat.status_code == 201
    assert new_pat.json()["data"]["consent_status"] == "active"

    # Step 2: Doctor creates URI + Fever & Sore Throat consultation
    raw_note = (
        "SYNTHETIC CASE: Acute Nasopharyngitis (Upper Respiratory Infection) with Fever & Sore Throat; Hypertension. "
        "BP 142/88 mmHg. Rx: 1) Paracetamol 500 mg SOS for fever/body ache, max 4 tablets in 24 hours. "
        "2) Continue Amlodipine 5 mg once daily every morning after breakfast — do NOT stop abruptly. "
        "Follow up in 5 days or sooner if fever > 102 F or breathing difficulty."
    )
    created = await client.post(
        "/api/doctor/consultation",
        headers=_auth_headers(tok_doc),
        json={
            "patient_id": ramesh_id,
            "title": "Judge Demo: Acute Nasopharyngitis (URI) & Fever",
            "visit_date": "2026-11-26",
            "source_type": "doctor_entered",
            "original_doctor_input": raw_note,
            "structured_data": {
                "diagnoses": ["Acute Nasopharyngitis (Upper Respiratory Infection)", "Hypertension"],
                "vitals": {"blood_pressure": "142/88 mmHg"},
                "medications": [
                    {
                        "name": "Paracetamol",
                        "dose": "500 mg",
                        "frequency": "SOS (as needed for fever/body ache)",
                        "warnings": ["Do NOT exceed 4 tablets in 24 hours"],
                    },
                    {
                        "name": "Amlodipine",
                        "dose": "5 mg",
                        "frequency": "Once daily every morning after breakfast",
                        "warnings": ["Do NOT stop abruptly"],
                    },
                ],
                "follow_up": "5 days (or sooner if fever > 102 F or breathing difficulty)",
            },
        },
    )
    assert created.status_code == 201
    consult_id = created.json()["data"]["id"]
    assert created.json()["data"]["sharing_status"] == "private_draft"

    # Private draft MUST NOT be visible to patient yet
    pat_login = (await client.post("/api/demo/login", json={"role": "patient"})).json()["data"]
    tok_pat = pat_login["access_token"]
    assert (await client.get(f"/api/consultations/{consult_id}", headers=_auth_headers(tok_pat))).status_code == 403

    # Step 3: Doctor generates simple explanation -> passes 13 integrity checks
    gen = await client.post(
        f"/api/doctor/consultation/{consult_id}/generate",
        headers=_auth_headers(tok_doc),
        json={"target_language": "en", "explanation_depth": "simple", "include_visuals": True},
    )
    assert gen.status_code == 200
    gen_data = gen.json()["data"]
    assert gen_data["integrity_status"] == "passed"
    assert gen_data["original_input_locked_at"] is not None
    assert set(gen_data["generated_explanation"].keys()) == {
        "doctor_provided",
        "ai_simplified",
        "general_education",
        "uncertain_or_missing",
    }

    # Sharing before approval is blocked with 409 APPROVAL_REQUIRED
    premature_share = await client.post(
        f"/api/doctor/consultation/{consult_id}/share",
        headers=_auth_headers(tok_doc),
        json={"sharing_target": "shared_with_patient"},
    )
    assert premature_share.status_code == 409
    assert premature_share.json()["error"]["code"] == "APPROVAL_REQUIRED"

    # Doctor approves & shares
    approved = await client.post(
        f"/api/doctor/consultation/{consult_id}/approve",
        headers=_auth_headers(tok_doc),
        json={"approve": True, "review_note": "Checked doses and safety warnings"},
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["approval_status"] == "approved"

    shared = await client.post(
        f"/api/doctor/consultation/{consult_id}/share",
        headers=_auth_headers(tok_doc),
        json={"sharing_target": "shared_with_patient"},
    )
    assert shared.status_code == 200
    assert shared.json()["data"]["sharing_status"] == "shared_with_patient"

    # Step 4: Patient fetches shared instructions + derived medications + KB lookups
    pat_consult = await client.get(
        f"/api/consultations/{consult_id}", headers=_auth_headers(tok_pat)
    )
    assert pat_consult.status_code == 200
    pc_data = pat_consult.json()["data"]
    assert len(pc_data["visual_diagrams"]) >= 1
    assert len(pc_data["highlighted_terms"]) >= 1

    meds_resp = await client.get("/api/medications", headers=_auth_headers(tok_pat))
    assert meds_resp.status_code == 200
    assert any(m["medicine_name"] == "Amlodipine" for m in meds_resp.json()["data"])

    med_expl = await client.post(
        "/api/explain/medicine",
        headers=_auth_headers(tok_pat),
        json={"medicine_name": "Amlodipine", "consultation_id": consult_id, "target_language": "en"},
    )
    assert med_expl.status_code == 200
    assert len(med_expl.json()["data"]["prohibitions_enforced"]) == 8

    term_expl = await client.post(
        "/api/explain/term",
        headers=_auth_headers(tok_pat),
        json={"term": "Acute Nasopharyngitis", "target_language": "hi"},
    )
    assert term_expl.status_code == 200
    assert term_expl.json()["data"]["term_card"]["verified_source"][0]["source_name"] == "MedlinePlus"

    kb_search = await client.get("/api/knowledge/terms/search?q=URI&language=hi-Latn")
    assert kb_search.status_code == 200
    assert len(kb_search.json()["data"]) >= 1

    kb_diagrams = await client.get("/api/knowledge/diagrams?key=respiratory_airways&language=hi")
    assert kb_diagrams.status_code == 200
    assert kb_diagrams.json()["data"][0]["svg_path"] == "/diagrams/respiratory_airways.svg"

    # Step 5: Patient translates instructions to Hindi & requests TTS cues at 0.75x
    tr_hi = await client.post(
        "/api/translate",
        headers=_auth_headers(tok_pat),
        json={
            "consultation_id": consult_id,
            "explanation_payload": pc_data["generated_explanation"],
            "source_language": "en",
            "target_language": "hi",
            "mode": "patient_friendly",
            "preserve_english_terms": True,
        },
    )
    assert tr_hi.status_code == 200
    tr_data = tr_hi.json()["data"]
    assert "Amlodipine" in tr_data["translated_text"]
    assert "5 mg" in tr_data["translated_text"]
    assert tr_data["integrity"]["status"] == "passed"

    tts_resp = await client.post(
        "/api/speech/tts",
        headers=_auth_headers(tok_pat),
        json={
            "text": tr_data["translated_text"],
            "language": "hi",
            "audio_speed": 0.75,
        },
    )
    assert tts_resp.status_code == 200
    tts_data = tts_resp.json()["data"]
    assert tts_data["audio_speed"] == 0.75
    assert len(tts_data["cues"]) >= 1
    assert tts_data["cues"][0]["start_ms"] == 0

    # Step 6: Patient triggers "Explain More" (causes_mechanism & explain_everything)
    more_why = await client.post(
        "/api/explain/more",
        headers=_auth_headers(tok_pat),
        json={
            "consultation_id": consult_id,
            "trigger": "causes_mechanism",
            "target_language": "en",
        },
    )
    assert more_why.status_code == 200
    assert more_why.json()["data"]["trigger"] == "causes_mechanism"
    assert more_why.json()["data"]["integrity"]["status"] == "passed"

    more_all = await client.post(
        "/api/explain/more",
        headers=_auth_headers(tok_pat),
        json={
            "consultation_id": consult_id,
            "trigger": "explain_everything",
            "target_language": "en",
        },
    )
    assert more_all.status_code == 200
    breakdown = more_all.json()["data"]["three_part_breakdown"]
    assert breakdown["what_doctor_provided"]["heading"].startswith("1.")
    assert breakdown["general_medical_knowledge"]["heading"].startswith("2.")
    assert breakdown["what_is_unknown_about_you"]["heading"].startswith("3.")

    # Step 7: Patient asks "Kya iska matlab mujhe pneumonia hai?" -> safe grounded reply
    pneu_chat = await client.post(
        "/api/chat",
        headers=_auth_headers(tok_pat),
        json={
            "message_text": "Kya iska matlab mujhe pneumonia hai?",
            "context_consultation_id": consult_id,
            "target_language": "hi-Latn",
        },
    )
    assert pneu_chat.status_code == 200
    chat_data = pneu_chat.json()["data"]
    assistant_msg = chat_data["assistant_message"]
    reply_l = assistant_msg["message_text"].lower()
    assert "nahi" in reply_l
    assert "pneumonia" in reply_l
    assert "upper respiratory infection" in reply_l or "nasopharyngitis" in reply_l
    assert "doctor" in reply_l
    assert assistant_msg["emergency_flag_triggered"] is False
    assert len(assistant_msg["citations"]) >= 1

    conv_id = chat_data["conversation_id"]
    hist = await client.get(
        f"/api/chat/history?conversation_id={conv_id}",
        headers=_auth_headers(tok_pat),
    )
    assert hist.status_code == 200
    assert len(hist.json()["data"]["messages"]) == 2

    # Emergency red-flag check inside chat
    emerg_chat = await client.post(
        "/api/chat",
        headers=_auth_headers(tok_pat),
        json={
            "conversation_id": conv_id,
            "message_text": "I have severe chest pain and can't breathe",
            "context_consultation_id": consult_id,
            "target_language": "en",
        },
    )
    assert emerg_chat.status_code == 200
    assert emerg_chat.json()["data"]["assistant_message"]["emergency_flag_triggered"] is True
    assert "112" in emerg_chat.json()["data"]["assistant_message"]["message_text"]

    # Soft-delete conversation
    del_conv = await client.delete(
        f"/api/chat/conversations/{conv_id}",
        headers=_auth_headers(tok_pat),
    )
    assert del_conv.status_code == 200


@pytest.mark.asyncio
async def test_safety_integrity_gate_and_immutable_doctor_input(api_client):
    """Tampered AI edit (500 mg twice daily -> once daily) sets integrity_status='blocked' and blocks approval with 409."""
    client, _storage, _sm, _mp = api_client

    doc_login = (await client.post("/api/demo/login", json={"role": "doctor"})).json()["data"]
    tok_doc = doc_login["access_token"]
    pat_list = (await client.get("/api/doctor/patients", headers=_auth_headers(tok_doc))).json()["data"]
    patient_id = pat_list[0]["patient_id"]

    created = await client.post(
        "/api/doctor/consultation",
        headers=_auth_headers(tok_doc),
        json={
            "patient_id": patient_id,
            "title": "Antibiotic Course (Safety Gate Test)",
            "original_doctor_input": "Take Amoxicillin 500 mg twice daily for 5 days. Return if fever worsens.",
            "structured_data": {
                "medications": [
                    {
                        "name": "Amoxicillin",
                        "dose": "500 mg",
                        "frequency": "twice daily",
                        "duration": "5 days",
                    }
                ],
                "follow_up": "Return if fever worsens",
            },
        },
    )
    assert created.status_code == 201
    cid = created.json()["data"]["id"]

    gen = await client.post(
        f"/api/doctor/consultation/{cid}/generate",
        headers=_auth_headers(tok_doc),
        json={"target_language": "en", "explanation_depth": "simple"},
    )
    assert gen.status_code == 200
    assert gen.json()["data"]["integrity_status"] == "passed"

    # Attempt to overwrite immutable original_doctor_input -> 409 CONSULTATION_INPUT_LOCKED
    overwrite = await client.patch(
        f"/api/doctor/consultation/{cid}",
        headers=_auth_headers(tok_doc),
        json={"original_doctor_input": "Tampered original source note"},
    )
    assert overwrite.status_code == 409
    assert overwrite.json()["error"]["code"] == "CONSULTATION_INPUT_LOCKED"

    # Tampered AI edit: "twice daily" -> "once daily"
    tamper = await client.patch(
        f"/api/doctor/consultation/{cid}",
        headers=_auth_headers(tok_doc),
        json={
            "edited_explanation": {
                "ai_simplified": {
                    "summary": "Take Amoxicillin 500 mg once daily for 5 days. Return if fever worsens.",
                    "steps": ["Take Amoxicillin 500 mg once daily for 5 days."],
                }
            }
        },
    )
    assert tamper.status_code == 200
    tamper_data = tamper.json()["data"]
    assert tamper_data["integrity_status"] == "blocked"
    assert tamper_data["approval_status"] == "safety_flagged"
    assert len(tamper_data["integrity_report"]["mismatches"]) >= 1

    # Approve MUST fail with 409 SAFETY_INTEGRITY_BLOCKED
    approve_blocked = await client.post(
        f"/api/doctor/consultation/{cid}/approve",
        headers=_auth_headers(tok_doc),
        json={"approve": True},
    )
    assert approve_blocked.status_code == 409
    assert approve_blocked.json()["error"]["code"] == "SAFETY_INTEGRITY_BLOCKED"

    # Fixing the edit restores passed status and unlocks approval
    fix = await client.patch(
        f"/api/doctor/consultation/{cid}",
        headers=_auth_headers(tok_doc),
        json={
            "edited_explanation": {
                "ai_simplified": {
                    "summary": "Take Amoxicillin 500 mg twice daily for 5 days. Return if fever worsens.",
                    "steps": ["Take Amoxicillin 500 mg twice daily for 5 days."],
                }
            }
        },
    )
    assert fix.status_code == 200
    assert fix.json()["data"]["integrity_status"] == "passed"

    approve_ok = await client.post(
        f"/api/doctor/consultation/{cid}/approve",
        headers=_auth_headers(tok_doc),
        json={"approve": True},
    )
    assert approve_ok.status_code == 200
    assert approve_ok.json()["data"]["approval_status"] == "approved"


@pytest.mark.asyncio
async def test_ocr_no_guessing_voice_confirm_and_audio_consent(api_client):
    client, storage_dir, _sm, _mp = api_client

    pat_data = (await client.post("/api/demo/login", json={"role": "patient"})).json()["data"]
    tok_pat = pat_data["access_token"]
    doc_data = (await client.post("/api/demo/login", json={"role": "doctor"})).json()["data"]
    tok_doc = doc_data["access_token"]
    ramesh_id = pat_data["patient_profile"]["id"]

    # 1. Upload low-confidence / [UNREADABLE] prescription PDF
    bad_pdf = _make_pdf_bytes(
        [
            "Rx Prescription",
            "Paracetamol [UNREADABLE] mg SOS",
            "HbA1c: ??? %",
        ]
    )
    up_doc = await client.post(
        "/api/documents/upload",
        headers=_auth_headers(tok_pat),
        files={"file": ("unclear_rx.pdf", bad_pdf, "application/pdf")},
        data={"document_type": "prescription"},
    )
    assert up_doc.status_code == 201
    doc_id = up_doc.json()["data"]["id"]

    # Preview returns PNG with nosniff + private no-store
    prev = await client.get(
        f"/api/documents/{doc_id}/preview?page=1",
        headers=_auth_headers(tok_pat),
    )
    assert prev.status_code == 200
    assert prev.headers["content-type"] == "image/png"
    assert prev.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in prev.headers["cache-control"]
    assert prev.content[:8] == b"\x89PNG\r\n\x1a\n"

    # Extract flags needs_verification
    ext = await client.post(f"/api/documents/{doc_id}/extract", headers=_auth_headers(tok_pat))
    assert ext.status_code == 200
    assert ext.json()["data"]["processing_status"] == "needs_verification"
    assert len(ext.json()["data"]["uncertain_spans"]) >= 2

    # No-Guessing Gate blocks /explain before verification
    blocked_explain = await client.post(
        f"/api/documents/{doc_id}/explain",
        headers=_auth_headers(tok_pat),
        json={"target_language": "en"},
    )
    assert blocked_explain.status_code == 409
    assert blocked_explain.json()["error"]["code"] == "OCR_VERIFICATION_REQUIRED"

    # Confirm corrected text -> /explain succeeds with ocr_warning
    verify = await client.post(
        f"/api/documents/{doc_id}/verify",
        headers=_auth_headers(tok_pat),
        json={
            "corrected_ocr_text": "Rx Prescription\nParacetamol 500 mg SOS",
            "verification_decision": "confirm",
        },
    )
    assert verify.status_code == 200
    assert verify.json()["data"]["verification_status"] == "patient_confirmed"

    ok_explain = await client.post(
        f"/api/documents/{doc_id}/explain",
        headers=_auth_headers(tok_pat),
        json={"target_language": "en"},
    )
    assert ok_explain.status_code == 200
    assert ok_explain.json()["data"]["ocr_warning"] is not None

    # Delete wipes file on disk
    deleted_doc = await client.delete(
        f"/api/documents/{doc_id}", headers=_auth_headers(tok_pat)
    )
    assert deleted_doc.status_code == 200
    assert (await client.get(f"/api/documents/{doc_id}", headers=_auth_headers(tok_pat))).status_code == 404
    assert not list((storage_dir / "documents" / ramesh_id).glob(f"{doc_id}*"))

    # 2. Ephemeral Voice STT (<0.78 -> requires_confirmation) & chat STT gate
    wav_bytes = _make_wav_bytes()
    stt = await client.post(
        "/api/speech/stt",
        headers=_auth_headers(tok_pat),
        files={"file": ("voice.wav", wav_bytes, "audio/wav")},
        data={
            "consent_recorded": "true",
            "language_hint": "hi-Latn",
            "synthetic_demo_transcript": "Kya iska matlab mujhe pneumonia hai?",
        },
    )
    assert stt.status_code == 200
    stt_data = stt.json()["data"]
    assert stt_data["requires_confirmation"] is True
    assert stt_data["confidence_score"] < 0.78
    assert not list((storage_dir / "tmp_stt").glob("*"))

    gated_chat = await client.post(
        "/api/chat",
        headers=_auth_headers(tok_pat),
        json={
            "message_text": stt_data["transcript_text"],
            "input_modality": "voice",
            "source_audio_id": stt_data["audio_id"],
            "stt_confirmed": False,
        },
    )
    assert gated_chat.status_code == 200
    assert gated_chat.json()["data"]["requires_stt_confirmation"] is True

    # 3. Consultation Audio consent gate & lifecycle
    no_consent = await client.post(
        "/api/audio/upload",
        headers=_auth_headers(tok_doc),
        files={"file": ("consult.wav", wav_bytes, "audio/wav")},
        data={
            "audio_purpose": "doctor_consultation",
            "consent_recorded": "false",
            "patient_id": ramesh_id,
        },
    )
    assert no_consent.status_code == 400
    assert no_consent.json()["error"]["code"] == "AUDIO_CONSENT_REQUIRED"

    up_audio = await client.post(
        "/api/audio/upload",
        headers=_auth_headers(tok_doc),
        files={"file": ("consult.wav", wav_bytes, "audio/wav")},
        data={
            "audio_purpose": "doctor_consultation",
            "consent_recorded": "true",
            "patient_id": ramesh_id,
        },
    )
    assert up_audio.status_code == 201
    audio_id = up_audio.json()["data"]["audio_id"]

    tr_audio = await client.post(
        "/api/audio/transcribe",
        headers=_auth_headers(tok_doc),
        json={
            "audio_id": audio_id,
            "language_hint": "en",
            "synthetic_demo_transcript": "Take Paracetamol 500 mg SOS for fever, max 4 tablets in 24 hours.",
        },
    )
    assert tr_audio.status_code == 200
    assert "Paracetamol" in tr_audio.json()["data"]["transcript_raw"]

    patched_audio = await client.patch(
        f"/api/audio/{audio_id}/transcript",
        headers=_auth_headers(tok_doc),
        json={
            "speaker_reassignments": [{"segment_id": "seg_1", "speaker_role": "doctor"}],
            "speaker_map_verified": True,
        },
    )
    assert patched_audio.status_code == 200
    assert patched_audio.json()["data"]["speaker_map_verified"] is True

    summarized = await client.post(
        "/api/audio/summarize",
        headers=_auth_headers(tok_doc),
        json={"audio_id": audio_id, "auto_purge_audio_after_summary": True},
    )
    assert summarized.status_code == 200
    assert summarized.json()["data"]["audio_purged"] is True
    assert not list((storage_dir / "audio" / ramesh_id).glob(f"{audio_id}*"))


@pytest.mark.asyncio
async def test_doctor_generate_and_approve_integrity_consistency(api_client, monkeypatch):
    """Ensure /generate evaluates integrity on ai_simplified identically to PATCH and /approve across languages."""
    from app.routes import doctor as doctor_routes

    client, _storage, _sm, _mp = api_client
    doc_login = (await client.post("/api/demo/login", json={"role": "doctor"})).json()["data"]
    tok_doc = doc_login["access_token"]
    pat_list = (await client.get("/api/doctor/patients", headers=_auth_headers(tok_doc))).json()["data"]
    patient_id = pat_list[0]["patient_id"]

    # 1. Exact buildConsultationSubmission() Judge Demo scenario across en/deep_dive, hi/simple, and hi-Latn/simple
    for lang, depth in (("en", "deep_dive"), ("hi", "simple"), ("hi-Latn", "simple")):
        created = await client.post(
            "/api/doctor/consultation",
            headers=_auth_headers(tok_doc),
            json={
                "patient_id": patient_id,
                "title": f"URI Consistency Check ({lang}/{depth})",
                "original_doctor_input": (
                    "Vitals: blood pressure 142/88 mmHg.\n"
                    "Diagnoses: Acute Nasopharyngitis (Upper Respiratory Infection), Hypertension.\n"
                    "Symptoms: Fever, Sore throat, Mild body ache.\n"
                    "Observations: BP 142/88 mmHg; Mild throat redness; Chest clear on auscultation.\n"
                    "Rx: 1) Paracetamol 500 mg SOS (as needed for fever/body ache) 3 days oral — After food if needed; Do NOT exceed 4 tablets in 24 hours | "
                    "2) Amlodipine 5 mg Once daily every morning after breakfast Continue regularly oral — After breakfast; Do NOT stop abruptly.\n"
                    "Tests advised: Monitor temperature at home, Home blood pressure tracking.\n"
                    "Follow up in 5 days (or sooner if fever > 102 F or breathing difficulty). Follow-up date: 2026-12-01."
                ),
                "structured_data": {
                    "diagnoses": [
                        "Acute Nasopharyngitis (Upper Respiratory Infection)",
                        "Hypertension",
                    ],
                    "symptoms": ["Fever", "Sore throat", "Mild body ache"],
                    "observations": ["BP 142/88 mmHg", "Mild throat redness", "Chest clear on auscultation"],
                    "vitals": {"blood_pressure": "142/88 mmHg"},
                    "medications": [
                        {
                            "name": "Paracetamol",
                            "dose": "500 mg",
                            "route": "oral",
                            "frequency": "SOS (as needed for fever/body ache)",
                            "timing_with_food": "After food if needed",
                            "duration": "3 days",
                            "warnings": ["Do NOT exceed 4 tablets in 24 hours"],
                        },
                        {
                            "name": "Amlodipine",
                            "dose": "5 mg",
                            "route": "oral",
                            "frequency": "Once daily every morning after breakfast",
                            "timing_with_food": "After breakfast",
                            "duration": "Continue regularly",
                            "warnings": ["Do NOT stop abruptly"],
                        },
                    ],
                    "tests_advised": ["Monitor temperature at home", "Home blood pressure tracking"],
                    "follow_up": "Follow up in 5 days (or sooner if fever > 102 F or breathing difficulty)",
                    "follow_up_date": "2026-12-01",
                },
            },
        )
        assert created.status_code == 201
        cid = created.json()["data"]["id"]

        gen = await client.post(
            f"/api/doctor/consultation/{cid}/generate",
            headers=_auth_headers(tok_doc),
            json={"target_language": lang, "explanation_depth": depth},
        )
        assert gen.status_code == 200
        gen_data = gen.json()["data"]
        assert gen_data["integrity_status"] == "passed", gen_data["integrity_report"]
        assert gen_data["approval_status"] == "pending_review"

        appr = await client.post(
            f"/api/doctor/consultation/{cid}/approve",
            headers=_auth_headers(tok_doc),
            json={"approve": True},
        )
        assert appr.status_code == 200
        appr_data = appr.json()["data"]
        assert appr_data["approval_status"] == "approved"
        assert appr_data["integrity_status"] == gen_data["integrity_status"]
        assert appr_data["integrity_report"]["mismatches"] == gen_data["integrity_report"]["mismatches"]

    # 2. If ai_simplified drops/changes frequency while doctor_provided remains intact, /generate MUST block immediately
    async def _fake_explain_with_tampered_ai(*_args, **_kwargs):
        return {
            "provenance": {
                "doctor_provided": [
                    {"text": "Take Amoxicillin 500 mg twice daily for 5 days.", "verified_from_source": True}
                ],
                "ai_simplified": {
                    "summary": "Take Amoxicillin 500 mg once daily for 5 days. Return if fever worsens.",
                    "steps": ["Take Amoxicillin 500 mg once daily for 5 days."],
                },
                "general_education": [{"text": "Complete the prescribed course.", "source": "MedSarthi KB"}],
                "uncertain_or_missing": [],
            },
            "language": "en",
            "depth": "simple",
            "visual_diagrams": [],
            "safety": {
                "integrity_status": "passed",
                "integrity_report": {"status": "passed", "mismatches": []},
                "guardrail_check": {"is_valid": True, "violations": []},
            },
        }

    monkeypatch.setattr(
        doctor_routes.explanation_service,
        "explain_clinical_input",
        _fake_explain_with_tampered_ai,
    )
    bad_created = await client.post(
        "/api/doctor/consultation",
        headers=_auth_headers(tok_doc),
        json={
            "patient_id": patient_id,
            "title": "Tampered AI Consistency Regression",
            "original_doctor_input": "Take Amoxicillin 500 mg twice daily for 5 days. Return if fever worsens.",
            "structured_data": {
                "medications": [
                    {
                        "name": "Amoxicillin",
                        "dose": "500 mg",
                        "frequency": "twice daily",
                        "duration": "5 days",
                    }
                ],
                "follow_up": "Return if fever worsens",
            },
        },
    )
    assert bad_created.status_code == 201
    bad_cid = bad_created.json()["data"]["id"]

    bad_gen = await client.post(
        f"/api/doctor/consultation/{bad_cid}/generate",
        headers=_auth_headers(tok_doc),
        json={"target_language": "en", "explanation_depth": "simple"},
    )
    assert bad_gen.status_code == 200
    bad_gen_data = bad_gen.json()["data"]
    assert bad_gen_data["integrity_status"] == "blocked"
    assert bad_gen_data["approval_status"] == "safety_flagged"

    bad_appr = await client.post(
        f"/api/doctor/consultation/{bad_cid}/approve",
        headers=_auth_headers(tok_doc),
        json={"approve": True},
    )
    assert bad_appr.status_code == 409
    assert bad_appr.json()["error"]["code"] == "SAFETY_INTEGRITY_BLOCKED"


@pytest.mark.asyncio
async def test_guest_session_lan_cors_and_idempotent_seed(api_client):
    """Verify account-free guest login, LAN dev CORS preflight, and idempotent seed_database."""
    from app.seeds.seed_data import seed_database

    client, _tmp, session_factory, _mp = api_client

    # 1. LAN dev origin CORS preflight should return 200 (not 400 Disallowed CORS origin)
    preflight = await client.options(
        "/api/health",
        headers={
            "Origin": "http://192.168.3.101:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "http://192.168.3.101:3000"

    # 2. Account-free guest patient session works without email/password
    guest_res = await client.post("/api/auth/guest", json={})
    assert guest_res.status_code == 201
    guest_data = guest_res.json()["data"]
    assert guest_data["guest_mode"] is True
    assert guest_data["user"]["role"] == "patient"
    assert guest_data["user"]["email"].endswith("@guest.medsarthi.local")
    tok_guest = guest_data["access_token"]

    me_res = await client.get("/api/auth/me", headers=_auth_headers(tok_guest))
    assert me_res.status_code == 200
    assert me_res.json()["data"]["patient_profile"]["name"] == "Guest Patient"

    # Guest can ask non-diagnostic Q&A immediately without creating an account
    chat_res = await client.post(
        "/api/chat",
        headers=_auth_headers(tok_guest),
        json={"message_text": "What does fever mean?", "target_language": "en"},
    )
    assert chat_res.status_code == 200

    # 3. Create an extra consultation for Demo Patient and re-run seed_database() -> no MultipleResultsFound
    client.cookies.clear()
    doc_login = (await client.post("/api/demo/login", json={"role": "doctor"})).json()["data"]
    tok_doc = doc_login["access_token"]
    patients_res = await client.get("/api/doctor/patients", headers=_auth_headers(tok_doc))
    ramesh = next(p for p in patients_res.json()["data"] if "Ramesh" in p["name"])
    ramesh_id = ramesh["patient_id"]
    extra_c = await client.post(
        "/api/doctor/consultation",
        headers=_auth_headers(tok_doc),
        json={
            "patient_id": ramesh_id,
            "title": "Extra Consultation Before Reseed",
            "original_doctor_input": "Take Paracetamol 500 mg SOS. Return if fever worsens.",
        },
    )
    assert extra_c.status_code == 201

    async with session_factory() as db:
        reseed_result = await seed_database(db)
    assert "kb_created" in reseed_result
