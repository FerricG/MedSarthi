# MedSarthi — Presenter Guide
### AI-Powered Patient Medical Understanding & Communication Platform
**AI-thon 2026 · Educational Prototype · Synthetic Data Only**

---

> [!IMPORTANT]
> This document is the **presenter's reference guide** for the MedSarthi demo. Read every section before presenting. The guide follows the recommended demo sequence from patient side → doctor side → technical deep-dive.

---

## 1. What Is MedSarthi?

**MedSarthi** (Hindi: "Medical Companion / Charioteer") is a full-stack, AI-powered healthcare communication platform built to solve a single, critical real-world problem:

> *"A patient walks out of a doctor's clinic — they don't understand what their diagnosis means, what their medicines are for, what the dosages mean, or what to do next."*

MedSarthi bridges this gap by converting doctor-provided clinical instructions into **plain-language, multilingual, voice-narrated, accessibility-first explanations** — without ever replacing the doctor, without diagnosing, and without prescribing.

### Core Mission
- Help patients **understand** what their doctor said
- Help patients **understand** their diagnosis, medicines, reports, and instructions
- Serve patients across **all literacy levels** — from illiterate rural patients to educated urban users
- Support **11 Indian languages** natively
- Keep the original doctor instructions **immutable and tamper-proof**
- Keep patient data **private** — no PII leaves the system to AI providers

---

## 2. The Problem We Are Solving

| Pain Point | Reality in India |
|---|---|
| Low health literacy | 300M+ patients cannot read a prescription |
| Language gap | Doctors write in English; patients speak Hindi, Tamil, Telugu, Bengali… |
| No follow-up explanation | Patients forget 50-80% of what a doctor says within minutes |
| Medical jargon | "Viral URI", "Amlodipine 5mg OD", "BP 140/90 mmHg" means nothing to most patients |
| Report anxiety | Lab reports cause panic when no one explains "slightly elevated" vs. critical |
| Prescription errors | Patients take wrong doses because they misread or misunderstood |

**MedSarthi addresses all of these with one unified platform.**

---

## 3. User Roles

| Role | Who They Are | What They Do |
|---|---|---|
| **Patient** | Any patient, any literacy level | Understands prescriptions, reports, medicines, asks questions |
| **Doctor** | Registered clinician | Creates consultations, reviews AI explanations, approves & shares with patient |
| **Guest** | Unregistered visitor | Full guided flow — no login required |

---

## 4. The Two Patient Journeys (Key Design Decision)

> [!TIP]
> **Start your demo here** — this is the most impressive part for judges. Navigate to `http://localhost:3000/patient`.

The `/patient` home screen asks two things:
1. **What language do you prefer?** (11 languages supported)
2. **How would you like help?** — Two distinct journeys:

### Path A — Simple Guided Helper (`/patient/guided`)
**For:** Low-literacy patients, elderly patients, rural patients, anyone who prefers listening over reading.

The journey is a **6-step card flow** narrated by **Dr. Sarthi** — an interactive animated female doctor narrator with 5 poses (greeting, scanning, explaining, listening, celebrating).

**Step-by-step flow:**
| Step | Card | What Happens |
|---|---|---|
| 1 | **Start** | Patient greeted by Dr. Sarthi. Can continue as guest (no login), sign in, or use 1-Click Demo. |
| 2 | **Show Prescription** | Patient takes a photo, uploads an image/PDF, or scans a QR code from their phone. Sample prescription available for demo. |
| 3 | **Check Details** | OCR extracts name, age, gender. Dr. Sarthi reads them aloud. Patient confirms or corrects via keyboard or speech-to-text. |
| 4 | **Medicines Explained** | Dr. Sarthi narrates a simple explanation of each medicine — what it is, why the doctor prescribed it, dose, timing, warnings. |
| 5 | **Ask Questions** | Patient can ask questions by typing or speaking. AI answers are grounded in the prescription and verified knowledge base. Conversation is recorded. |
| 6 | **Review & Rating** | Prescription + Q&A submitted for 24-hour doctor verification. If logged in, patient receives Email/SMS notification. Patient rates the experience. |

### Path B — Detailed Patient Dashboard (`/patient/detailed`)
**For:** Educated patients, tech-comfortable users, those who want full control.

Gives direct access to all 6 patient tools:
- 📋 **Instructions** — 4 Provenance Cards + depth switcher + audio player
- 💊 **Medicines** — Full medicine breakdown
- 📊 **Reports** — OCR-powered lab report analysis
- 🗣️ **Talk** — Consultation-scoped Q&A chat with safety guardrails
- 🔊 **Listen** — Audio summaries
- 📜 **History** — Past consultations

---

## 5. The Doctor Journey

> [!NOTE]
> Navigate to `http://localhost:3000/doctor` and click **1-Click Demo Doctor** to log in as Dr. Priya Mehta.

**Demo credentials:**
- Doctor: `priya.doctor@medsarthi.local` / `DemoDoctor#2026`
- Patient: `ramesh.demo@medsarthi.local` / `DemoPatient#2026`

### Doctor Workflow:

```
New Consultation
      ↓
Write / paste clinical notes OR upload audio/document
      ↓
"Save & Generate Simple Explanation"
      ↓
AI generates 4-category provenance explanation
      ↓
13-Rule Safety Integrity Checker runs (deterministic, no LLM)
      ↓
Side-by-Side Review (source ↔ AI output)
      ↓
  [Pass] → Doctor approves → "Share with Patient"
  [Blocked] → Doctor must Regenerate or edit AI output
      ↓
Patient receives notification (Email/SMS framework)
```

### The Tamper Gate — Live Demo (Impressive for Judges)

1. Open a consultation → Side-by-Side Review
2. **Manually edit** the AI-simplified medication dose in the right panel (e.g., change "1 tablet" to "2 tablets")
3. Watch `integrity_status` flip from **passed ✅** to **blocked 🔴**
4. The **Approve button is disabled** — the doctor cannot approve a tampered explanation
5. Try `POST /api/doctor/consultations/{id}/approve` directly → returns `409 SAFETY_INTEGRITY_BLOCKED`
6. Click **Regenerate** → integrity restores to **passed** → Approve is re-enabled

---

## 6. The 4 Provenance Categories

Every AI explanation is structured into **4 clearly labelled sections** so patients always know the source of information:

| Category | Label | Colour | Meaning |
|---|---|---|---|
| `doctor_provided` | 🩺 Doctor Provided | Blue | Directly from your doctor's clinical notes — immutable |
| `ai_simplified` | ✨ AI Simplified | Teal | AI-rewritten version, integrity-checked against source |
| `general_education` | 📚 General Medical Education | Purple | Verified knowledge base facts (not about your case) |
| `what_is_unknown` | ❓ What Is Unknown | Grey | Explicitly states what the AI cannot tell you |

This architecture **prevents hallucination** from masquerading as doctor instructions.

---

## 7. AI & Technical Architecture

### Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS v4 |
| **Backend** | FastAPI (Python 3.13) · SQLAlchemy 2.0 async · SQLite WAL + FTS5 |
| **Auth** | JWT (Argon2id password hashing) · HTTP-only cookies · CSRF tokens |
| **AI/LLM** | Groq (Llama 3.3 70B) · Gemini · OpenAI · OpenRouter — with privacy-safe failover |
| **OCR** | PyMuPDF + RapidOCR (local, free-tier) · Google Cloud Vision · Azure Document Intelligence |
| **TTS/STT** | Mithi TTS (Indian-language neural voices, local model) · Piper TTS fallback · Deepgram |
| **QR Upload** | Flask + ngrok tunnel (phone-to-PC cross-network upload) · qrcode library |
| **i18n** | Modular JSON dictionaries — English, हिन्दी, Hinglish, Bengali, Marathi, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi |

### Zero-Key Demo Mode

> [!IMPORTANT]
> MedSarthi runs **fully offline with zero external API keys** using `SYNTHETIC_PROTOTYPE_MODE=true`. Everything works for the demo without any paid accounts.

- **LLM:** `DemoClinicalLLMProvider` — deterministic KB-grounded responses
- **OCR:** Local PyMuPDF + RapidOCR
- **TTS:** Mithi v2 Flash (local neural model) + browser Web Speech API fallback
- **Data:** 100% synthetic clinical scenarios, no real patient data

### AI Safety Pipeline (The Most Important Differentiator)

```
Patient Query / Doctor Input
        ↓
 [1] PII Scrubber
     Strips names, phones, emails, Aadhaar, hospital IDs
     Preserves clinical values (doses, dates, lab numbers)
        ↓
 [2] Emergency Detector (pre-LLM)
     Scans for 7 emergency domains (cardiac, respiratory, neurological,
     anaphylaxis, obstetric, poisoning, suicidal) in EN + HI + Hinglish
     → Emergency: immediately shows helpline numbers, skips LLM
        ↓
 [3] Intent Classifier
     Blocks: diagnosis-seeking, prescription requests, dose changes,
     stop/substitute requests, prompt injection attempts
        ↓
 [4] LLM Generation (Groq / Gemini / OpenAI / Demo)
        ↓
 [5] 13-Rule Deterministic Integrity Checker (zero-LLM)
     Compares AI output against source across 13 medical domains:
     medicines, dosages, units, frequency, duration, routes,
     dates, vitals, lab values, negations, allergies, LASA pairs
        ↓
 [6] Provenance Validator
     Verifies all 4 categories present, citations valid, no fabricated sources
        ↓
 [7] Post-LLM Guardrails
     Catches: false reassurance, embedded diagnoses, prescription attempts,
     missing provenance attribution
        ↓
     Patient-Safe Output ✅
```

---

## 8. The 13-Rule Safety Integrity Checker — Deep Dive

> [!CAUTION]
> This is the technical centrepiece of the project. Emphasise this to judges.

The integrity checker is **entirely deterministic — no LLM involved**. It cross-checks AI-simplified output against the original doctor input across 13 rules:

| Rule | Domain | What It Catches |
|---|---|---|
| 01 | Medicine Names | LASA drug confusables (Metformin ↔ Metronidazole, Glipizide ↔ Glyburide) |
| 02 | Dosage Numbers | Word numbers in EN/HI/Hinglish, Devanagari digits, fractions (dedh = 1.5) |
| 03 | Units | mcg vs mg decimal shifts, missing units, unit swaps |
| 04 | Frequency | Once/twice/thrice daily, PRN, SOS — in 3 languages |
| 05 | Duration | Days/weeks/months equivalence, chronic "ongoing" retention |
| 06 | Route of Administration | Eye vs ear drops, oral vs topical, nasal vs inhaled swaps |
| 07 | Dates & Timelines | Follow-up dates, relative timelines ("in 5 days") |
| 08 | Vitals | BP targets (systolic/diastolic), temperature F↔C conversion |
| 09 | Lab Values | Creatinine, glucose, lakh/thousand cell counts, decimal precision |
| 10 | Negations | "Do NOT" flipped to "you can", qualitative swaps (normal↔elevated) |
| 11 | Allergies | Allergy warnings omitted or softened; NKDA parity |
| 12 | Structural Completeness | All medications from source present in output |
| 13 | Emergency Flags | Red-flag follow-up instructions preserved |

**76 tests pass, 0 failures.**

---

## 9. OCR Pipeline — No-Guessing Gate

The OCR pipeline enforces a critical safety rule:

> **If the system is not confident about a field, it marks it `[UNREADABLE]` and blocks explanation generation until a human verifies it.**

- Confidence threshold: `< 0.75` → field marked `[UNREADABLE]`
- Backend returns `409 OCR_VERIFICATION_REQUIRED`
- Patient cannot receive an explanation for an unverified document
- Doctor or patient must manually verify/correct before proceeding

This prevents the system from **guessing** at medication names or dosages — a critical safety requirement.

---

## 10. QR Phone-to-PC Upload Feature

> [!TIP]
> This feature is great for the demo — show it live if you have a phone nearby.

- Backend auto-starts a **Flask upload server** on port 5000
- **ngrok tunnel** creates a public HTTPS URL accessible from any network
- Backend generates a **QR code** displayed in the UI
- Patient scans the QR code on their phone → mobile-friendly upload page opens
- Patient selects prescription images from their phone gallery
- Images upload directly to the PC and are processed by the OCR pipeline
- Works cross-network (phone on mobile data, PC on Wi-Fi)

**Setup:** Set `NGROK_AUTHTOKEN=your_token` in `D:\Projects\Ai-thon\.env`

---

## 11. Multilingual Support — 11 Languages

The platform supports **11 Indian languages** at the UI level, with the AI explanation layer supporting English, Hindi (Devanagari), and Hinglish (Romanised Hindi):

| Language | Script | Code |
|---|---|---|
| English | Latin | `en` |
| हिन्दी (Hindi) | Devanagari | `hi` |
| Hinglish | Latin (Romanised Hindi) | `hi-Latn` |
| বাংলা (Bengali) | Bengali | `bn` |
| मराठी (Marathi) | Devanagari | `mr` |
| தமிழ் (Tamil) | Tamil | `ta` |
| తెలుగు (Telugu) | Telugu | `te` |
| ગુજરાતી (Gujarati) | Gujarati | `gu` |
| ಕನ್ನಡ (Kannada) | Kannada | `kn` |
| മലയാളം (Malayalam) | Malayalam | `ml` |
| ਪੰਜਾਬੀ (Punjabi) | Gurmukhi | `pa` |

**Translation is token-locked:** medicine names, doses, units, and negations are preserved exactly as written — the AI cannot mistranslate `Paracetamol 500 mg` into a different value.

---

## 12. Narrator — Dr. Sarthi

The interactive narrator uses:
- **Mithi TTS v2 Flash** — a local neural text-to-speech model supporting Indian languages and voices
- **5 animated poses:** greeting · scanning · explaining · listening · celebrating
- **Auto-speaks** each step as it loads — no button press needed
- Fallback: **Browser Web Speech API** for environments without the Mithi model
- Voice selection: `charvi` (default), with other Mithi voice options available
- Controls: play/pause, mute, speed (slow/normal/fast)

**Dr. Sarthi reads the patient's extracted details aloud and asks for confirmation.** This design allows completely illiterate patients to use the system by listening.

---

## 13. Privacy & Security Architecture

| Feature | Implementation |
|---|---|
| **PII Scrubbing** | Names, phones, emails, Aadhaar stripped before any external API call |
| **Immutable Doctor Input** | `original_doctor_input` + SHA-256 hash stored at creation; never editable |
| **JWT Auth** | Argon2id password hashing · short-lived access tokens · HTTP-only refresh cookies |
| **CSRF Protection** | Per-request CSRF tokens on state-changing endpoints |
| **Patient Isolation** | Each patient can only see their own consultations (enforced at DB query level) |
| **Zero Training Policy** | `LLM_ALLOW_UNPAID_TRAINING_TIER=false` — no data sent to providers with training rights |
| **Local Storage** | Audio files and uploaded documents stored locally, purged after 24 hours |
| **SQLite WAL** | Write-ahead logging for data integrity under concurrent access |

---

## 14. Database Schema Overview

12 SQLAlchemy models across 3 files:

```
auth.py:
  ├── users                    — Core auth: role, email, phone, Argon2id hash
  ├── patient_profiles         — Demographics, preferences, language, accessibility
  ├── doctor_profiles          — Credentials, specialty, verification status
  └── consent_records          — Explicit patient consent to share data with doctor

clinical.py:
  ├── consultations            — Immutable doctor input + provenance JSON + integrity status
  ├── medical_documents        — OCR results, structured fields, verification status
  ├── audio_records            — STT transcripts, TTS audio, 24h purge schedule
  └── conversations            — Chat sessions with messages (consultation-scoped)

knowledge.py:
  ├── medical_terms            — FTS5-indexed glossary (EN/HI/Hinglish)
  ├── medicine_database        — Drug info, LASA pairs, interaction warnings
  └── anatomical_diagrams      — SVG diagram metadata (digestive, cardiac, respiratory)
```

---

## 15. API Endpoints (11 Routers, 40+ Endpoints)

| Router | Prefix | Key Endpoints |
|---|---|---|
| Health | `/api/health` | `GET /` — system status + DB check |
| Auth | `/api/auth` | `POST /register`, `POST /login`, `POST /logout`, `POST /refresh` |
| Demo | `/api/demo` | `POST /login` — 1-click demo with auto-seed |
| Patients | `/api/patients` | `GET /me`, `PATCH /me`, `GET /me/preferences`, `PATCH /me/preferences` |
| Consent | `/api/consent` | `POST /`, `GET /`, `DELETE /{id}` |
| Explain | `/api/explain` | `POST /document/{id}`, `POST /term`, `POST /medicine`, `POST /more` |
| Chat | `/api/chat` | `POST /`, `GET /conversations/{id}` |
| Documents | `/api/documents` | `POST /upload`, `POST /{id}/extract`, `POST /{id}/verify`, `GET /{id}` |
| Audio | `/api/audio` | `POST /tts`, `POST /stt`, `GET /{id}` |
| Doctor | `/api/doctor` | `GET /patients`, `POST /consultations`, `POST /consultations/{id}/approve`, `POST /consultations/{id}/share` |
| Knowledge | `/api/knowledge` | `GET /search`, `GET /terms/{slug}`, `GET /medicines/{name}` |
| Remote Upload | `/api/remote-upload` | `GET /status`, `POST /start`, `POST /stop` |

---

## 16. Test Coverage

**76 tests, 0 failures** across 5 test modules:

| Module | Tests | What It Covers |
|---|---|---|
| `test_phase1_smoke.py` | 4 | DB tables, FTS5 search, health endpoint, auth lifecycle |
| `test_safety_unit.py` | 22 | All 13 integrity rules + emergency detector + intent classifier + PII scrubber |
| `test_safety_adversarial.py` | 28 | LASA drug pairs, dose injection, unit corruption, negation flip, prompt injection, prohibited intent |
| `test_ai_media_services.py` | 10 | LLM providers, OCR, audio/TTS, translation, KB multilingual search |
| `test_api_integration.py` | 10 | Full 7-step demo flow E2E, QR upload, guided review, notification framework, patient isolation |

**Adversarial tests include:**
- 7 LASA drug pair confusables blocked
- Decimal shift attacks (1mg vs 10mg) blocked
- Prompt injection attempts (`"SYSTEM: ignore all safety rules"`) blocked
- Negation flip attacks (`"Do NOT take" → "you can take"`) blocked
- Dose change requests in Hindi and English blocked
- Self-diagnosis queries blocked in both languages

---

## 17. Demo Script — Recommended Order

### Opening (1 minute)
> *"India has over 1.4 billion people. A majority cannot fully understand their own medical prescriptions. MedSarthi is our answer to that problem."*

### Demo Step 1 — Patient Selector (2 minutes)
1. Open `http://localhost:3000/patient`
2. Show the language selector — click through 3-4 languages to show real localised UI
3. Explain the two patient paths

### Demo Step 2 — Guided Flow (5 minutes)
1. Click **Simple Guided Helper**
2. Dr. Sarthi greets the user — point out the animated narrator
3. Click **Continue Without Login** (default)
4. Click **Try Sample Prescription** — watch OCR extract name/age/gender
5. Dr. Sarthi reads the details aloud — patient clicks "Yes, This is Correct"
6. Show the medicine explanation cards
7. Ask a question by typing or voice: `"Can I take this with food?"`
8. Show the Q&A answer
9. Submit for 24-hour review — show the receipt

### Demo Step 3 — Doctor Dashboard (3 minutes)
1. Navigate to `http://localhost:3000/doctor`
2. Click **1-Click Demo Doctor**
3. Open **New Consultation → Load Judge Demo Scenario**
4. Click **Save & Generate Simple Explanation**
5. Show the 4 Provenance Cards in Side-by-Side Review
6. **Edit a dosage** → show integrity flip to blocked
7. Click **Regenerate** → show it pass
8. Click **Approve → Share with Patient**

### Demo Step 4 — Patient Detailed Dashboard (2 minutes)
1. Navigate to `/patient` → **Detailed Dashboard**
2. Open **Instructions** → show 4 Provenance Cards
3. Switch language from English to Hindi
4. Switch depth from Simple to Deep Dive
5. Click **Explain More** on any section

### Demo Step 5 — QR Upload (optional, 2 minutes)
1. Show the QR code panel in the guided flow
2. If ngrok token is set, show the public URL
3. Demonstrate scanning with a phone

### Closing (1 minute)
> *"MedSarthi is not just an AI chatbot. It is a safety-first, multilingual, accessibility-first communication layer between doctors and patients — with deterministic guardrails, 76 passing tests, and zero real patient data."*

---

## 18. Key Differentiators for Judges

| Feature | Why It Matters |
|---|---|
| **Dual patient journeys** | Serves both illiterate rural patients and educated urban users |
| **Interactive animated narrator** | Genuinely usable by patients with zero literacy |
| **13-rule deterministic integrity checker** | No LLM can silently corrupt medication information |
| **4-category provenance** | Patients always know what came from their doctor vs. AI |
| **11 languages** | True India-scale multilingual support |
| **Runs fully offline** | Zero-key demo mode — no internet or API keys needed |
| **76 adversarial tests** | Safety claims are verified, not just stated |
| **QR cross-network upload** | Patients can send prescriptions from any phone, any network |
| **Patient isolation** | No patient can see another patient's data |
| **Zero training policy** | Patient data never used to train external AI models |

---

## 19. Known Limitations (Be Honest With Judges)

> [!WARNING]
> Acknowledge these honestly — they demonstrate maturity and medical awareness.

1. **Not clinically validated** — This is an educational prototype using synthetic data only. It must not be used for real clinical decisions.
2. **OCR accuracy** — RapidOCR works well on clean images; handwritten prescriptions may hit the No-Guessing Gate frequently.
3. **LLM grounding in demo mode** — The `DemoClinicalLLMProvider` is deterministic but limited to seeded scenarios. Real-world deployment requires Groq/Gemini API keys.
4. **Mithi TTS model size** — The local Mithi v2 Flash model works well for the seeded scenarios but needs warm-up time on first launch.
5. **Notification framework** — The Email/SMS notification system is a framework with mock channels; actual Email/SMS delivery requires Twilio/SendGrid integration.
6. **24-hour review** — This is a framework; the actual doctor review queue and routing logic would need a production backend.
7. **Regulatory compliance** — A real deployment would require DPDP Act (India) compliance, ABHA integration, and clinical validation under relevant medical device regulations.

---

## 20. Quick Start Reference

```powershell
# From D:\Projects\Ai-thon
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health Check | http://localhost:8000/api/health |
| QR Upload Server | http://localhost:5000 (auto-starts) |

**Demo accounts (1-click login available on both portals):**
| Role | Email | Password |
|---|---|---|
| Patient | `ramesh.demo@medsarthi.local` | `DemoPatient#2026` |
| Doctor | `priya.doctor@medsarthi.local` | `DemoDoctor#2026` |

---

## 21. Project Folder Structure (At a Glance)

```
Ai-thon/
├── backend/
│   ├── app/
│   │   ├── core/            config, database, auth, security
│   │   ├── models/          12 SQLAlchemy models
│   │   ├── routes/          11 API routers
│   │   ├── schemas/         Pydantic v2 request/response contracts
│   │   ├── seeds/           Synthetic demo data + medical KB
│   │   └── services/
│   │       ├── safety/      Integrity checker, emergency detector, PII scrubber, provenance validator
│   │       ├── ai/          LLM providers, explanation, translation, chat, prompts
│   │       ├── knowledge/   FTS5 medical knowledge base retriever
│   │       └── media/       OCR, Mithi TTS, QR upload server
│   └── tests/               76 tests across 5 modules
├── frontend/
│   └── src/
│       ├── app/patient/     Guided, Detailed, Instructions, Medicines, Reports, Talk, Listen, History
│       ├── app/doctor/      Dashboard, Patients, Consultations (new + review)
│       ├── components/      Narrator, AudioPlayer, DiagramViewer, EmergencyAlert, QR Panel
│       └── i18n/            11-language dictionaries
├── scripts/dev.ps1           One-command dev runner (Windows 11)
├── .env.example              All configuration variables documented
└── presentation.md           ← You are here
```

---

*MedSarthi — built for AI-thon 2026. Helping patients understand their health, one prescription at a time.*
