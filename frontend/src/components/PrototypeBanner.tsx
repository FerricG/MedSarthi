"use client";

import React from "react";
import { AlertTriangle, Contrast, Globe, HeartPulse, Minus, Plus, RotateCcw } from "lucide-react";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { type SupportedLocale, useI18n } from "@/i18n/I18nProvider";

const LOCALE_OPTIONS: { code: SupportedLocale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "hi-Latn", label: "Hinglish" },
];

export function PrototypeSafetyBanner() {
  const { t } = useI18n();

  return (
    <div
      role="region"
      aria-label={t.safety.prototypeBannerTitle}
      className="border-b-2 px-4 py-2.5 text-sm"
      style={{
        backgroundColor: "var(--ms-banner-bg)",
        borderColor: "var(--ms-banner-border)",
        color: "var(--ms-banner-ink)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="leading-snug">
          <strong className="font-bold">{t.safety.prototypeBannerTitle}:</strong>{" "}
          <span>{t.safety.prototypeBannerBody}</span>
        </p>
      </div>
    </div>
  );
}

export function AccessibilityTopBar() {
  const { t, locale } = useI18n();
  const {
    prefs,
    setLanguage,
    toggleHighContrast,
    increaseFont,
    decreaseFont,
    resetToRecommended,
  } = useAccessibility();
  const { patientProfile } = useAuth();

  return (
    <header
      className="border-b-2 px-4 py-3"
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border-2"
            style={{
              backgroundColor: "var(--ms-primary-soft)",
              borderColor: "var(--ms-primary)",
              color: "var(--ms-primary)",
            }}
          >
            <HeartPulse className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-xl font-extrabold tracking-tight">{t.appName}</span>
            <span className="block text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              {t.tagline}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Language Switcher */}
          <div className="flex items-center gap-1.5 rounded-xl border-2 px-2 py-1" style={{ borderColor: "var(--ms-border)" }}>
            <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
            <label htmlFor="ms-lang-select" className="sr-only">
              {t.languages.label}
            </label>
            <select
              id="ms-lang-select"
              value={locale}
              onChange={(e) => setLanguage(e.target.value as SupportedLocale)}
              className="tap-target bg-transparent px-1 font-semibold focus:outline-none"
              style={{ color: "var(--ms-ink)" }}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code} style={{ color: "#0F172A", backgroundColor: "#FFFFFF" }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font Scale Controls */}
          <div
            className="flex items-center gap-1 rounded-xl border-2 px-1.5 py-1"
            style={{ borderColor: "var(--ms-border)" }}
            role="group"
            aria-label={t.accessibility.fontSize}
          >
            <button
              type="button"
              onClick={decreaseFont}
              className="tap-target flex items-center justify-center rounded-lg px-2.5 font-bold hover:opacity-80"
              aria-label={t.accessibility.decreaseFont}
              title={t.accessibility.decreaseFont}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1 text-sm">A-</span>
            </button>
            <span className="px-1.5 text-sm font-bold" aria-live="polite">
              {prefs.fontScalePct}%
            </span>
            <button
              type="button"
              onClick={increaseFont}
              className="tap-target flex items-center justify-center rounded-lg px-2.5 font-bold hover:opacity-80"
              aria-label={t.accessibility.increaseFont}
              title={t.accessibility.increaseFont}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1 text-sm">A+</span>
            </button>
            <button
              type="button"
              onClick={() => resetToRecommended(patientProfile?.age_years)}
              className="tap-target flex items-center justify-center rounded-lg px-2 text-xs font-semibold hover:opacity-80"
              aria-label={t.accessibility.resetFont}
              title={t.accessibility.resetFont}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* High Contrast WCAG AAA Toggle */}
          <button
            type="button"
            onClick={toggleHighContrast}
            aria-pressed={prefs.highContrast}
            className="tap-target flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-bold"
            style={{
              backgroundColor: prefs.highContrast ? "var(--ms-primary)" : "var(--ms-surface-alt)",
              color: prefs.highContrast ? "var(--ms-primary-ink)" : "var(--ms-ink)",
              borderColor: "var(--ms-border)",
            }}
          >
            <Contrast className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {prefs.highContrast ? t.accessibility.highContrastOn : t.accessibility.highContrastOff}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function PrototypeSafetyFooter() {
  const { t } = useI18n();

  return (
    <footer
      className="mt-auto border-t-2 px-4 py-4 text-sm"
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
        color: "var(--ms-ink-muted)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{t.safety.prototypeFooter}</p>
        <p className="text-xs font-semibold" style={{ color: "var(--ms-danger-ink)" }}>
          {t.safety.emergencyNote}
        </p>
      </div>
    </footer>
  );
}
