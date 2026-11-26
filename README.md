# MedSarthi

> **Educational Prototype Notice:** MedSarthi is an educational healthcare-communication prototype built for the AI-thon using **synthetic data only**. It is **not clinically validated**, does not diagnose, prescribe, or replace a qualified doctor, and must not be used for real clinical care.

MedSarthi helps patients—across reading comfort levels, ages, languages (`English`, `हिन्दी`, `Hinglish`), and visual/audio accessibility needs—clearly understand doctor-provided instructions, medical terms, medicines, prescriptions, and lab reports, while keeping original doctor instructions immutable and verified.

## Repository Structure

```text
Ai-thon/
├── backend/                  # FastAPI + SQLAlchemy 2.0 (async) + SQLite (WAL + FTS5)
│   ├── app/
│   │   ├── core/             # Config, async SQLite DB + FTS5, Argon2id/JWT/CSRF security, deps
│   │   ├── models/           # 12 lean SQLAlchemy models
│   │   ├── routes/           # Auth, health, (and Phase 2+ clinical routes)
│   │   ├── schemas/          # Pydantic v2 request/response contracts
│   │   └── seeds/            # Synthetic KB (terms + meds), demo patient/doctor, diagram metadata
│   ├── tests/                # Pytest suite
│   └── requirements.txt
├── frontend/                 # Next.js App Router + React 19 + TypeScript + Tailwind CSS v4
│   ├── public/diagrams/      # Curated educational SVG anatomical/process diagrams
│   └── src/
│       ├── i18n/             # Modular en / hi / hi-Latn dictionaries + React provider
│       ├── contexts/         # Auth + Accessibility/Personalization contexts
│       ├── lib/              # Typed API client with refresh & CSRF handling
│       ├── components/       # Global prototype safety banner & accessible primitives
│       └── styles/           # WCAG AAA high-contrast & font-scale CSS variables
├── scripts/
│   └── dev.ps1               # Windows 11 local dev runner (backend + frontend)
├── .env.example
└── package.json
```

## Quick Start (Windows 11)

### 1. Environment Variables
Copy `.env.example` to `.env` (optional for Phase 1 local run; safe local defaults are built in).

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

## Synthetic Demo Accounts (1-Click Demo / Local Dev)
> All accounts and clinical notes are 100% synthetic.

- **Demo Patient (`Ramesh Sharma`, age 64):** `ramesh.demo@medsarthi.local` / `DemoPatient#2026`
- **Demo Doctor (`Dr. Priya Mehta`):** `priya.doctor@medsarthi.local` / `DemoDoctor#2026`
