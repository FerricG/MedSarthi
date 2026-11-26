"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, Contrast, Globe, HeartPulse, Minus, Plus, RotateCcw } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";

const LOCALE_OPTIONS = SUPPORTED_LOCALES.map((item) => ({
  code: item.code,
  label: item.nativeLabel,
}));

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
  const { user, patientProfile } = useAuth();

  function persistPatch(patch: Record<string, unknown>) {
    if (user?.role === "patient") {
      void api.updatePreferences(patch).catch(() => {
        // Local preferences remain updated optimistically even if offline
      });
    }
  }

  function handleLanguageSwitch(nextLang: SupportedLocale) {
    setLanguage(nextLang);
    persistPatch({ preferred_language: nextLang });
  }

  function handleIncreaseFont() {
    increaseFont();
    const nextScale = Math.min(175, prefs.fontScalePct + 15);
    const nextSize = nextScale <= 105 ? "medium" : nextScale <= 125 ? "large" : "xl";
    persistPatch({ font_scale_pct: nextScale, font_size: nextSize });
  }

  function handleDecreaseFont() {
    decreaseFont();
    const nextScale = Math.max(90, prefs.fontScalePct - 15);
    const nextSize = nextScale <= 105 ? "medium" : nextScale <= 125 ? "large" : "xl";
    persistPatch({ font_scale_pct: nextScale, font_size: nextSize });
  }

  function handleResetFont() {
    resetToRecommended(patientProfile?.age_years);
    persistPatch({ reset_accessibility_to_recommended: true });
  }

  function handleToggleContrast() {
    toggleHighContrast();
    persistPatch({ high_contrast: !prefs.highContrast });
  }

  return (
    <header
      className="border-b-2 px-4 py-3"
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={user?.role === "patient" ? "/patient" : user?.role === "doctor" ? "/doctor" : "/"} className="flex items-center gap-2.5">
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
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Language Pills + Full 11-Language Selector */}
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 p-1"
              style={{ borderColor: "var(--ms-border)" }}
              role="group"
              aria-label={t.languages.label}
            >
              <Globe className="ml-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {LOCALE_OPTIONS.slice(0, 3).map((opt) => {
                const active = locale === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => handleLanguageSwitch(opt.code)}
                    aria-pressed={active}
                    className="tap-target rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "transparent",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <select
                aria-label="More Indian languages"
                value={locale}
                onChange={(e) => handleLanguageSwitch(e.target.value as SupportedLocale)}
                className="tap-target rounded-lg border px-2 py-1 text-xs font-bold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                {LOCALE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
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
                onClick={handleDecreaseFont}
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
                onClick={handleIncreaseFont}
                className="tap-target flex items-center justify-center rounded-lg px-2.5 font-bold hover:opacity-80"
                aria-label={t.accessibility.increaseFont}
                title={t.accessibility.increaseFont}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="ml-1 text-sm">A+</span>
              </button>
              <button
                type="button"
                onClick={handleResetFont}
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
              onClick={handleToggleContrast}
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

        {/* Role-aware navigation bar when signed in */}
        <Navbar />
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
