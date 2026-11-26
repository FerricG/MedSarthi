"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import type { PatientPreferences } from "@/lib/api";

export type FontSizeTier = "medium" | "large" | "xl";
export type AudioSpeed = 0.75 | 0.85 | 1.0 | 1.15 | 1.25;
export type ReadingComfort = "very_simple" | "simple" | "comfortable" | "adaptive";
export type ExplanationDepth = "very_simple" | "simple" | "detailed" | "deep_dive";
export type ResponseFormat = "text" | "audio" | "text_audio" | "visual";

export interface AccessibilityState {
  preferredLanguage: SupportedLocale;
  readingComfortLevel: ReadingComfort;
  explanationDepth: ExplanationDepth;
  preferredResponseFormat: ResponseFormat;
  fontSize: FontSizeTier;
  fontScalePct: number;
  audioSpeed: AudioSpeed;
  highContrast: boolean;
  terminologyPreference: "plain_only" | "plain_plus_medical" | "medical_with_definitions";
  unitsPreference: "metric" | "us_standard" | "both";
  explanationStyle:
    | "conversational"
    | "straightforward"
    | "calm_reassuring"
    | "structured"
    | "step_by_step";
  accessibilityManualOverride: boolean;
}

const STORAGE_KEY = "medsarthi_a11y_prefs";

const DEFAULT_STATE: AccessibilityState = {
  preferredLanguage: "en",
  readingComfortLevel: "simple",
  explanationDepth: "simple",
  preferredResponseFormat: "text_audio",
  fontSize: "large",
  fontScalePct: 115,
  audioSpeed: 1.0,
  highContrast: false,
  terminologyPreference: "plain_plus_medical",
  unitsPreference: "metric",
  explanationStyle: "calm_reassuring",
  accessibilityManualOverride: false,
};

export function computeAgeDefaults(ageYears?: number | null): {
  fontSize: FontSizeTier;
  fontScalePct: number;
  audioSpeed: AudioSpeed;
} {
  if (ageYears == null) {
    return { fontSize: "large", fontScalePct: 115, audioSpeed: 1.0 };
  }
  if (ageYears < 18) {
    return { fontSize: "large", fontScalePct: 115, audioSpeed: 1.0 };
  }
  if (ageYears < 40) {
    return { fontSize: "medium", fontScalePct: 100, audioSpeed: 1.0 };
  }
  if (ageYears < 60) {
    return { fontSize: "large", fontScalePct: 115, audioSpeed: 0.85 };
  }
  return { fontSize: "xl", fontScalePct: 135, audioSpeed: 0.75 };
}

function tierFromScale(scalePct: number): FontSizeTier {
  if (scalePct <= 105) return "medium";
  if (scalePct <= 125) return "large";
  return "xl";
}

interface AccessibilityContextValue {
  prefs: AccessibilityState;
  setLanguage: (lang: SupportedLocale) => void;
  toggleHighContrast: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetToRecommended: (ageYears?: number | null) => void;
  setAudioSpeed: (speed: AudioSpeed) => void;
  updatePrefs: (patch: Partial<AccessibilityState>) => void;
  hydrateFromServer: (serverPrefs: PatientPreferences | null) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { setLocale } = useI18n();
  const [prefs, setPrefs] = useState<AccessibilityState>(DEFAULT_STATE);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AccessibilityState>;
        setPrefs((prev) => ({ ...prev, ...parsed }));
        if (
          parsed.preferredLanguage === "en" ||
          parsed.preferredLanguage === "hi" ||
          parsed.preferredLanguage === "hi-Latn"
        ) {
          setLocale(parsed.preferredLanguage);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [setLocale]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ms-font-scale", (prefs.fontScalePct / 100).toFixed(2));
    root.setAttribute("data-font-size", prefs.fontSize);
    root.setAttribute("data-high-contrast", prefs.highContrast ? "true" : "false");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
  }, [prefs]);

  const setLanguage = useCallback(
    (lang: SupportedLocale) => {
      setLocale(lang);
      setPrefs((prev) => ({ ...prev, preferredLanguage: lang }));
    },
    [setLocale]
  );

  const toggleHighContrast = useCallback(() => {
    setPrefs((prev) => ({
      ...prev,
      highContrast: !prev.highContrast,
      accessibilityManualOverride: true,
    }));
  }, []);

  const increaseFont = useCallback(() => {
    setPrefs((prev) => {
      const nextScale = Math.min(175, prev.fontScalePct + 15);
      return {
        ...prev,
        fontScalePct: nextScale,
        fontSize: tierFromScale(nextScale),
        accessibilityManualOverride: true,
      };
    });
  }, []);

  const decreaseFont = useCallback(() => {
    setPrefs((prev) => {
      const nextScale = Math.max(90, prev.fontScalePct - 15);
      return {
        ...prev,
        fontScalePct: nextScale,
        fontSize: tierFromScale(nextScale),
        accessibilityManualOverride: true,
      };
    });
  }, []);

  const resetToRecommended = useCallback((ageYears?: number | null) => {
    const defaults = computeAgeDefaults(ageYears);
    setPrefs((prev) => ({
      ...prev,
      fontSize: defaults.fontSize,
      fontScalePct: defaults.fontScalePct,
      audioSpeed: defaults.audioSpeed,
      accessibilityManualOverride: false,
    }));
  }, []);

  const setAudioSpeed = useCallback((speed: AudioSpeed) => {
    setPrefs((prev) => ({
      ...prev,
      audioSpeed: speed,
      accessibilityManualOverride: true,
    }));
  }, []);

  const updatePrefs = useCallback((patch: Partial<AccessibilityState>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const hydrateFromServer = useCallback(
    (serverPrefs: PatientPreferences | null) => {
      if (!serverPrefs) return;
      setLocale(serverPrefs.preferred_language);
      setPrefs({
        preferredLanguage: serverPrefs.preferred_language,
        readingComfortLevel: serverPrefs.reading_comfort_level,
        explanationDepth: serverPrefs.explanation_depth,
        preferredResponseFormat: serverPrefs.preferred_response_format,
        fontSize: serverPrefs.font_size,
        fontScalePct: serverPrefs.font_scale_pct,
        audioSpeed: serverPrefs.audio_speed,
        highContrast: serverPrefs.high_contrast,
        terminologyPreference: serverPrefs.terminology_preference,
        unitsPreference: serverPrefs.units_preference,
        explanationStyle: serverPrefs.explanation_style,
        accessibilityManualOverride: serverPrefs.accessibility_manual_override,
      });
    },
    [setLocale]
  );

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      prefs,
      setLanguage,
      toggleHighContrast,
      increaseFont,
      decreaseFont,
      resetToRecommended,
      setAudioSpeed,
      updatePrefs,
      hydrateFromServer,
    }),
    [
      prefs,
      setLanguage,
      toggleHighContrast,
      increaseFont,
      decreaseFont,
      resetToRecommended,
      setAudioSpeed,
      updatePrefs,
      hydrateFromServer,
    ]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error("useAccessibility must be used inside AccessibilityProvider");
  }
  return ctx;
}
