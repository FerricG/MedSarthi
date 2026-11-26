"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Globe, HeartHandshake, Sparkles, Volume2 } from "lucide-react";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";

export default function PatientModeSelectorPage() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const { setLanguage } = useAccessibility();
  const { user, patientProfile } = useAuth();
  const [selectedLang, setSelectedLang] = useState<SupportedLocale>(locale);
  const [navigating, setNavigating] = useState<"guided" | "detailed" | null>(null);

  function handleSelectLanguage(code: SupportedLocale) {
    setSelectedLang(code);
    setLocale(code);
    setLanguage(code);
    if (user?.role === "patient") {
      void api.updatePreferences({ preferred_language: code }).catch(() => {});
    }
  }

  async function handleChooseMode(mode: "guided" | "detailed") {
    setNavigating(mode);
    setLocale(selectedLang);
    setLanguage(selectedLang);
    if (user?.role === "patient") {
      try {
        await api.updatePreferences({
          preferred_language: selectedLang,
          reading_comfort_level: mode === "guided" ? "very_simple" : "comfortable",
          explanation_depth: mode === "guided" ? "very_simple" : "detailed",
        });
      } catch {
        // Non-blocking preference sync
      }
    }
    router.push(mode === "guided" ? "/patient/guided" : "/patient/detailed");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="ms-card p-6 sm:p-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
            style={{
              backgroundColor: "var(--ms-primary-soft)",
              borderColor: "var(--ms-primary)",
              color: "var(--ms-ink)",
            }}
          >
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            <span>Patient Welcome</span>
          </span>
          {patientProfile?.name && (
            <span className="text-sm font-bold" style={{ color: "var(--ms-primary)" }}>
              Welcome, {patientProfile.name}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Choose your language &amp; how you want help today
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
          No account is required to start. Pick your preferred language below, then choose either our
          friendly voice-guided cards or the full reading workspace.
        </p>
      </section>

      {/* Step 1: Language Selector (11 Languages) */}
      <section className="ms-card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Globe className="h-6 w-6 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <h2 className="text-xl font-extrabold">1. Which language do you prefer?</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SUPPORTED_LOCALES.map((item) => {
            const active = selectedLang === item.code;
            return (
              <button
                key={item.code}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectLanguage(item.code)}
                className="tap-target-lg flex items-center justify-between gap-2 rounded-2xl border-2 px-4 py-3 text-left transition-colors"
                style={{
                  backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                  color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                <span>
                  <span className="block text-base font-extrabold">{item.nativeLabel}</span>
                  <span className="block text-xs opacity-85">{item.label}</span>
                </span>
                {active && <Check className="h-5 w-5 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2: Two Patient Paths */}
      <section className="space-y-3">
        <h2 className="text-xl font-extrabold px-1">2. How would you like to use MedSarthi?</h2>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Path A: Simple Voice & Picture Guided Flow (Low-literacy / Audio-first) */}
          <button
            type="button"
            disabled={navigating !== null}
            onClick={() => void handleChooseMode("guided")}
            className="ms-card tap-target-lg flex flex-col justify-between gap-5 border-2 p-6 text-left transition-transform hover:-translate-y-0.5"
            style={{
              borderColor: "var(--ms-primary)",
              backgroundColor: "var(--ms-surface)",
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "var(--ms-primary-soft)", color: "var(--ms-primary)" }}
                >
                  <Volume2 className="h-8 w-8" aria-hidden="true" />
                </span>
                <span
                  className="rounded-full px-3 py-1 text-xs font-extrabold"
                  style={{ backgroundColor: "var(--ms-primary)", color: "var(--ms-primary-ink)" }}
                >
                  Voice + Picture Cards
                </span>
              </div>

              <h3 className="text-2xl font-extrabold">Simple Guided Helper</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
                Best if medical words are hard to read or you prefer listening. Our friendly doctor
                narrator guides you one card at a time: take a prescription photo, check your
                details by voice, hear your medicines simply, and ask questions.
              </p>
              <ul className="space-y-1 text-sm font-semibold">
                <li>• Friendly female doctor narrator speaks every step</li>
                <li>• Works without login by default (login optional)</li>
                <li>• Speak or type questions • 24h doctor check</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 text-base font-extrabold" style={{ color: "var(--ms-primary)" }}>
              <span>{navigating === "guided" ? "Opening Guided Helper..." : "Start Guided Helper"}</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </div>
          </button>

          {/* Path B: Detailed / Educated Workspace */}
          <button
            type="button"
            disabled={navigating !== null}
            onClick={() => void handleChooseMode("detailed")}
            className="ms-card tap-target-lg flex flex-col justify-between gap-5 border-2 p-6 text-left transition-transform hover:-translate-y-0.5"
            style={{
              borderColor: "var(--ms-border)",
              backgroundColor: "var(--ms-surface)",
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "var(--ms-surface-alt)", color: "var(--ms-ink)" }}
                >
                  <BookOpen className="h-8 w-8" aria-hidden="true" />
                </span>
                <span
                  className="rounded-full border px-3 py-1 text-xs font-extrabold"
                  style={{ borderColor: "var(--ms-border)" }}
                >
                  Full Reading Workspace
                </span>
              </div>

              <h3 className="text-2xl font-extrabold">Detailed Patient Dashboard</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
                Best if you are comfortable reading medical details yourself. Access all 6 patient
                tools directly: doctor instructions, lab reports, medicine tables, Q&amp;A chat,
                audio player, and visit history.
              </p>
              <ul className="space-y-1 text-sm font-semibold">
                <li>• 4-category provenance &amp; depth controls</li>
                <li>• Full lab report OCR &amp; medical term lookup</li>
                <li>• Self-directed navigation across all tools</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 text-base font-extrabold" style={{ color: "var(--ms-primary)" }}>
              <span>
                <Sparkles className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
                {navigating === "detailed" ? "Opening Dashboard..." : "Open Detailed Dashboard"}
              </span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
