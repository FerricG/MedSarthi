"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Compass,
  FileText,
  Languages,
  MessageCircle,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError, type HealthResponseData } from "@/lib/api";

const JUDGE_WALKTHROUGH_STEPS = [
  {
    step: 1,
    title: "7-Step Friendly Onboarding",
    desc: "Experience age-aware defaults (age 64 -> XL text + 0.75x audio), zero jargon, and 'Hear this question'.",
    href: "/onboarding?demo=1",
  },
  {
    step: 2,
    title: "Doctor's Note (Locked Clinical Source)",
    desc: "Inspect Dr. Priya Mehta's immutable note (Acute Nasopharyngitis, Hypertension, Paracetamol, Amlodipine).",
    href: "/patient/instructions",
  },
  {
    step: 3,
    title: "4-Category Provenance & Simple Explanation",
    desc: "See Doctor-Provided, In Simple Words, General Medical Knowledge (with citations), and Unknown items clearly separated.",
    href: "/patient/instructions",
  },
  {
    step: 4,
    title: "One-Tap Hindi / Hinglish Switch",
    desc: "Switch between English, हिन्दी, and Hinglish without losing consultation context or altering dosages.",
    href: "/patient/instructions",
  },
  {
    step: 5,
    title: "Listen with Live Sentence Highlighting",
    desc: "Play audio at 0.75x–1.25x speed with synchronized line-by-line highlighting.",
    href: "/patient/instructions",
  },
  {
    step: 6,
    title: "Progressive 'Why did this happen?' & 'Explain everything'",
    desc: "Tap progressive Explain More buttons or tap underlined medical terms for curated SVG diagrams.",
    href: "/patient/instructions",
  },
  {
    step: 7,
    title: "Ask: 'Kya iska matlab mujhe pneumonia hai?'",
    desc: "Test MedSarthi's grounded Hinglish Q&A safety boundary against the doctor's URI note.",
    href: "/patient/talk?q=Kya%20iska%20matlab%20mujhe%20pneumonia%20hai%3F",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, patientProfile, doctorProfile, isLoading, guestLogin, refreshMe } = useAuth();

  const [health, setHealth] = useState<HealthResponseData | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((data) => {
        setHealth(data);
        setHealthError(false);
      })
      .catch(() => {
        setHealthError(true);
      });
  }, []);

  async function launchDemo(kind: "patient" | "doctor", redirectPath?: string) {
    setDemoError(null);
    setSubmitting(true);
    try {
      await api.demoLogin(kind);
      await refreshMe();
      if (redirectPath) {
        router.push(redirectPath);
      } else {
        router.push(kind === "patient" ? "/patient" : "/doctor");
      }
    } catch (err) {
      setDemoError(
        err instanceof ApiError
          ? err.message
          : "Unable to connect to backend for demo login. Ensure uvicorn is running on port 8000."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function launchGuest(role: "patient" | "doctor" = "patient") {
    setDemoError(null);
    setSubmitting(true);
    try {
      await guestLogin(role);
      router.push(role === "patient" ? "/patient" : "/doctor");
    } catch (err) {
      setDemoError(
        err instanceof ApiError
          ? err.message
          : "Unable to connect to backend for guest session. Ensure uvicorn is running on port 8000."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Live Backend Status Strip */}
      <section className="ms-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <span className="font-bold">{t.auth.backendStatus}:</span>
          {health ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-primary-soft)",
                borderColor: "var(--ms-primary)",
                color: "var(--ms-ink)",
              }}
            >
              {t.auth.statusOnline} • DB {health.db} • OCR {health.ocr_local}
            </span>
          ) : healthError ? (
            <span className="text-sm font-semibold" style={{ color: "var(--ms-danger-ink)" }}>
              {t.auth.statusOffline}
            </span>
          ) : (
            <span className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              {t.auth.statusChecking}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isLoading && user ? (
            <Link
              href={user.role === "patient" ? "/patient" : "/doctor"}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <span>
                {user.role === "patient"
                  ? `Continue as ${patientProfile?.name || "Patient"}`
                  : `Continue as ${doctorProfile?.full_name || "Doctor"}`}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void launchGuest("patient")}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-4 text-sm"
              >
                <span>Use Without Account</span>
              </button>
              <Link href="/login" className="ms-btn-secondary tap-target inline-flex items-center px-4 text-sm">
                {t.nav.signIn}
              </Link>
              <Link href="/register" className="ms-btn-primary tap-target inline-flex items-center px-4 text-sm">
                {t.nav.register}
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Hero: Non-Chatbot Clinical Communication Bridge */}
      <section className="ms-card p-6 sm:p-8 space-y-5">
        <div className="space-y-2.5 max-w-3xl">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
            style={{
              backgroundColor: "var(--ms-primary-soft)",
              borderColor: "var(--ms-primary)",
              color: "var(--ms-ink)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Doctor-Anchored Clinical Communication Bridge — Not a Generic Chatbot</span>
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Understand your doctor&apos;s advice clearly, calmly, and in your own language.
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
            MedSarthi explains and translates only what your doctor provided alongside verified medical
            knowledge—never guessing unreadable prescriptions, never changing dosages, and adapting text
            size and voice playback to your comfort.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-doctor-border)", backgroundColor: "var(--ms-prov-doctor-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <Stethoscope className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>4-Category Provenance</span>
            </div>
            <p className="text-xs">Doctor words, simple AI summary, verified medical facts, and unknowns kept visually separate.</p>
          </div>

          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-ai-border)", backgroundColor: "var(--ms-prov-ai-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>English • हिन्दी • Hinglish</span>
            </div>
            <p className="text-xs">One-tap language switch preserving consultation context and exact medicine numbers.</p>
          </div>

          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-kb-border)", backgroundColor: "var(--ms-prov-kb-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Accessible Voice & WCAG AAA</span>
            </div>
            <p className="text-xs">64px+ touch targets, 0.75x–1.25x audio highlighting, high contrast, and Hinglish voice confirmation.</p>
          </div>

          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-uncertain-border)", backgroundColor: "var(--ms-prov-uncertain-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Deterministic Integrity Gate</span>
            </div>
            <p className="text-xs">Verifies doses, units, frequencies, and negations—and refuses to guess unclear OCR scans.</p>
          </div>
        </div>
      </section>

      {/* 1-Click Judge Demo Flow */}
      <section className="ms-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold">{t.auth.demoSectionTitle}</h2>
            <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              Instant synthetic login (zero external API keys required) or step through the 7-part judge walkthrough.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWalkthrough((v) => !v)}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
          >
            <Compass className="h-5 w-5" aria-hidden="true" />
            <span>{t.auth.guidedDemoBtn}</span>
          </button>
        </div>

        {demoError && (
          <p
            role="alert"
            className="rounded-xl border-2 px-4 py-3 text-sm font-semibold"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            {demoError}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void launchDemo("patient", "/patient")}
            className="ms-btn-primary tap-target-lg flex items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <UserCheck className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-base font-extrabold">{t.auth.demoPatientBtn}</span>
                <span className="block text-xs font-medium opacity-90">
                  Opens 6-action Patient Home with seeded URI + BP consultation &amp; lab report
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void launchGuest("patient")}
            className="ms-btn-secondary tap-target-lg flex items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-base font-extrabold">Use Without Account (Guest)</span>
                <span className="block text-xs font-medium" style={{ color: "var(--ms-ink-muted)" }}>
                  Instant private workspace — upload reports, ask questions &amp; listen with no sign-up
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void launchDemo("doctor", "/doctor")}
            className="ms-btn-secondary tap-target-lg flex items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <Stethoscope className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-base font-extrabold">{t.auth.demoDoctorBtn}</span>
                <span className="block text-xs font-medium" style={{ color: "var(--ms-ink-muted)" }}>
                  Opens Clinician Workspace with integrity check, OCR/audio tools &amp; approve/share
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
        </div>

        {showWalkthrough && (
          <div
            className="rounded-2xl border-2 p-4 sm:p-5 space-y-3"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-primary)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-extrabold">Guided 7-Step Judge Demo Walkthrough</h3>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void launchDemo("patient", "/onboarding?demo=1")}
                className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
              >
                <span>Launch Step 1 Now</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {JUDGE_WALKTHROUGH_STEPS.map((item) => (
                <button
                  key={item.step}
                  type="button"
                  disabled={submitting}
                  onClick={() => void launchDemo("patient", item.href)}
                  className="ms-card tap-target flex flex-col justify-between gap-2 p-3.5 text-left hover:opacity-90"
                >
                  <div className="space-y-1">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold"
                      style={{
                        backgroundColor: "var(--ms-primary-soft)",
                        color: "var(--ms-ink)",
                      }}
                    >
                      Step {item.step}
                    </span>
                    <h4 className="text-sm font-extrabold">{item.title}</h4>
                    <p className="text-xs leading-snug" style={{ color: "var(--ms-ink-muted)" }}>
                      {item.desc}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--ms-primary)" }}>
                    <span>Open step</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Quick Preview of the 6 Patient Capabilities */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: ClipboardList, title: t.patientHome.actions.instructions, desc: t.patientHome.actions.instructionsHint },
          { icon: FileText, title: t.patientHome.actions.report, desc: t.patientHome.actions.reportHint },
          { icon: Pill, title: t.patientHome.actions.medicine, desc: t.patientHome.actions.medicineHint },
          { icon: MessageCircle, title: t.patientHome.actions.talk, desc: t.patientHome.actions.talkHint },
          { icon: Volume2, title: t.patientHome.actions.listen, desc: t.patientHome.actions.listenHint },
          { icon: BookOpen, title: t.patientHome.actions.history, desc: t.patientHome.actions.historyHint },
        ].map((card, i) => {
          const Icon = card.icon;
          async function launchGuest(role: "patient" | "doctor" = "patient") {
    setDemoError(null);
    setSubmitting(true);
    try {
      await guestLogin(role);
      router.push(role === "patient" ? "/patient" : "/doctor");
    } catch (err) {
      setDemoError(
        err instanceof ApiError
          ? err.message
          : "Unable to connect to backend for guest session. Ensure uvicorn is running on port 8000."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
            <div key={i} className="ms-card flex items-start gap-3 p-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  backgroundColor: "var(--ms-primary-soft)",
                  borderColor: "var(--ms-primary)",
                  color: "var(--ms-primary)",
                }}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold">{card.title}</h3>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  {card.desc}
                </p>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
