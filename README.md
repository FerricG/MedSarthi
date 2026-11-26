# MedSarthi

> **Educational Prototype Notice:** MedSarthi is an educational healthcare-communication prototype built for the AI-thon using **synthetic data only**. It is **not clinically validated**, does not diagnose, prescribe, or replace a qualified doctor, and must not be used for real clinical care.

MedSarthi helps patients—across reading comfort levels, ages, languages (`English`, `हिन्दी`, `Hinglish`), and visual/audio accessibility needs—clearly understand doctor-provided instructions, medical terms, medicines, prescriptions, and lab reports, while keeping original doctor instructions immutable and verified through a deterministic 13-rule Safety Integrity Checker.

## Repository Structure

```text
Ai-thon/
├── backend/                  # FastAPI + SQLAlchemy 2.0 (async) + SQLite (WAL + FTS5)
│   ├── app/
│   │   ├── main.py           # App factory registering all 11 routers under /api + CORS + security headers
│   │   ├── core/             # config.py, database.py, deps.py, exceptions.py, security.py (Argon2id/JWT/CSRF)
│   │   ├── models/           # 12 SQLAlchemy models (auth.py, clinical.py, knowledge.py)
│   │   ├── routes/           # 11 API routers: health, auth, demo, patients, consent, explain, chat,
│   │   │                     #   documents, audio, doctor, knowledge (+ _helpers.py)
│   │   ├── schemas/          # Pydantic v2 contracts (common.py, auth.py, patients.py, clinical.py)
│   │   ├── seeds/            # seed_data.py, diagrams.json (synthetic multilingual KB + demo accounts)
│   │   └── services/
│   │       ├── safety/       # emergency_detector.py, integrity_checker.py, pii_scrubber.py, provenance_validator.py
│   │       ├── ai/           # base.py, llm_providers.py, registry.py, prompts.py,
│   │       │                 #   explanation_service.py, translation_service.py, chat_service.py
│   │       ├── knowledge/    # retriever.py (SQLite FTS5 multilingual KB + LASA confusable guard)
│   │       └── media/        # ocr_service.py (PyMuPDF + RapidOCR), audio_service.py (STT/TTS cues + purge)
│   ├── tests/                # 5 test modules (72 tests total): test_phase1_smoke.py, test_safety_unit.py,
│   │                         #   test_safety_adversarial.py, test_ai_media_services.py, test_api_integration.py
│   └── requirements.txt
├── frontend/                 # Next.js App Router + React 19 + TypeScript + Tailwind CSS v4
│   ├── public/diagrams/      # Curated educational SVG anatomical/process diagrams
│   └── src/
│       ├── app/
│       │   ├── page.tsx, layout.tsx, login/page.tsx, register/page.tsx, onboarding/page.tsx
│       │   ├── patient/      # Home, instructions/ ([id] & ConsultationViewer), reports/, medicines/,
│       │   │                 #   talk/, listen/, history/, settings/, _components/PatientGate.tsx
│       │   └── doctor/       # Dashboard, patients/[id]/, consultations/new/, consultations/[id]/
│       ├── components/       # AudioPlayer, DiagramViewer, EmergencyAlert, IntegrityNotice, Navbar,
│       │   │                 #   PrototypeBanner, ProvenanceCards, Providers, TermLookupModal, VoiceInputButton
│       │   └── doctor/       # AudioUploadReview, ConsultationForm, DoctorWorkspaceHeader,
│       │                     #   DocumentOcrReview, SideBySideReview, doctorHelpers.ts
│       ├── i18n/             # Modular en.json / hi.json / hi-Latn.json dictionaries + I18nProvider.tsx
│       ├── contexts/         # AuthContext.tsx, AccessibilityContext.tsx
│       ├── lib/              # api.ts (typed API client with refresh rotation & CSRF handling)
│       └── styles/           # globals.css (WCAG AAA high-contrast & font-scale CSS variables)
├── scripts/
│   └── dev.ps1               # Windows 11 local dev runner (backend + frontend)
├── .env.example
└── package.json
```

## Quick Start (Windows 11)

### 1. Environment Variables
Copy `.env.example` to `.env` (optional for local Zero-Key Demo Mode; safe local defaults are built in).

### 2. Backend Setup (`Python 3.13`)
```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.seeds.seed_data
.\.venv\Scripts\python.exe -m pytest tests -v
```

### 3. Frontend Setup (`Node.js` via `npm.cmd`)
```powershell
cd frontend
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
```

### 4. Run Both Servers Together
From the repository root (`d:\Projects\Ai-thon`):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```
- Backend API: `http://localhost:8000` (Health: `http://localhost:8000/api/health`, Docs: `http://localhost:8000/docs`)
- Frontend App: `http://localhost:3000`

## Zero-Key Demo Mode & Optional External Providers

MedSarthi runs end-to-end **offline with zero external API keys** when `SYNTHETIC_PROTOTYPE_MODE=true`:
- **Clinical Explanations, Translation & Q&A:** Uses deterministic `DemoClinicalLLMProvider` grounded in the local SQLite FTS5 medical Knowledge Base and guarded by PII scrubbing and the 13-rule Safety Integrity Checker.
- **Document OCR & Previews:** Uses local `PyMuPDF` + `RapidOCR` to extract structured findings, render PNG page previews, and enforce the `< 0.75` / `[UNREADABLE]` No-Guessing Gate (`409 OCR_VERIFICATION_REQUIRED`).
- **Voice & Audio:** Uses synthetic STT/TTS cue generation on the backend paired with browser Web Speech API playback/dictation fallback on the frontend (`POST /api/demo/login` also auto-seeds synthetic data if missing).

To enable external providers, copy `.env.example` to `.env` and configure optional keys (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `AZURE_DOC_INTEL_ENDPOINT`/`AZURE_DOC_INTEL_KEY`, `DEEPGRAM_API_KEY`, `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`) while keeping privacy guards enabled (`LLM_ALLOW_UNPAID_TRAINING_TIER=false`, `DEEPGRAM_MIP_OPT_OUT=true`, `AZURE_DOC_INTEL_F0_MODE=true`).

## Synthetic Demo Accounts (1-Click Demo / Local Dev)
> All accounts and clinical notes are 100% synthetic.

- **Demo Patient (`Ramesh Sharma`, age 64):** `ramesh.demo@medsarthi.local` / `DemoPatient#2026`
- **Demo Doctor (`Dr. Priya Mehta`):** `priya.doctor@medsarthi.local` / `DemoDoctor#2026`

## Judge Demo Walkthrough

1. **Doctor Side (`Dr. Priya Mehta` at `/doctor`):**
   - Click **1-Click Demo Doctor** (or **Switch to Demo Doctor**) to open the consented patient roster (`Ramesh Sharma`, or add a synthetic patient via **Add / Link Demo Patient**).
   - Open **New Consultation** (`/doctor/consultations/new`), click **Load Judge Demo Scenario**, and click **Save & Generate Simple Explanation** to lock `original_doctor_input` and generate a 4-category provenance draft checked by all 13 deterministic integrity rules.
   - **Verify Tamper Gate (`409 SAFETY_INTEGRITY_BLOCKED`):** Edit an AI-simplified medication dose/frequency in Side-by-Side Review; integrity flips to `blocked` and disables approval (calling `POST /approve` directly returns `409`).
   - Click **Regenerate** to restore a passing explanation (`integrity_status: passed`), then click **Approve** and **Share with Patient**.
2. **Patient Side (`Ramesh Sharma` at `/` or `/patient`):**
   - Click **1-Click Demo Patient** (or inspect age-calibrated accessibility defaults in `/onboarding?demo=1` / `/patient/settings`).
   - Open **Instructions** (`/patient/instructions`) to view the 4 Provenance Cards (*Doctor Provided*, *AI Simplified*, *General Medical Education*, *What Is Unknown*), switch languages (`en` / `hi` / `hi-Latn`) and explanation depths (`Very Simple` / `Simple` / `Detailed` / `Deep Dive`), play synced **Audio Player** narration, and expand sections with **Explain More** (including *Explain Everything*).
   - Open **Talk** (`/patient/talk`) and ask `"Kya iska matlab mujhe pneumonia hai?"` to verify safe, non-diagnostic KB-grounded guidance (and emergency escalation on chest pain/red-flag queries).
   - Open **Reports** (`/patient/reports`) to upload a PDF/image prescription or lab report, inspect PNG preview & extracted `lab_rows`/`tests`, verify low-confidence `[UNREADABLE]` fields (blocked until verified via `409 OCR_VERIFICATION_REQUIRED`), and generate an explanation once verified.
