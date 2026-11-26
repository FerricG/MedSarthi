"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import enDict from "@/i18n/en.json";
import hiDict from "@/i18n/hi.json";
import hiLatnDict from "@/i18n/hi-Latn.json";

export type SupportedLocale = "en" | "hi" | "hi-Latn";
export type I18nDictionary = typeof enDict;

export interface LocaleRegistryItem {
  code: SupportedLocale | string;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
  tier: "mvp" | "extensible";
}

export const SUPPORTED_LOCALES: LocaleRegistryItem[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr", tier: "mvp" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", dir: "ltr", tier: "mvp" },
  { code: "hi-Latn", label: "Hinglish", nativeLabel: "Hinglish (Hindi in English letters)", dir: "ltr", tier: "mvp" },
];

export const EXTENSIBLE_INDIAN_LOCALES: LocaleRegistryItem[] = [
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", dir: "ltr", tier: "extensible" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", dir: "ltr", tier: "extensible" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", dir: "ltr", tier: "extensible" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", dir: "ltr", tier: "extensible" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", dir: "ltr", tier: "extensible" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", dir: "ltr", tier: "extensible" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", dir: "ltr", tier: "extensible" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", dir: "ltr", tier: "extensible" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", dir: "rtl", tier: "extensible" },
];

const DICTIONARIES: Record<SupportedLocale, I18nDictionary> = {
  en: enDict,
  hi: hiDict,
  "hi-Latn": hiLatnDict,
};

const LOCALE_STORAGE_KEY = "medsarthi_locale";

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: I18nDictionary;
  formatMessage: (template: string, vars: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === "en" || saved === "hi" || saved === "hi-Latn") {
        setLocaleState(saved);
      }
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: DICTIONARIES[locale] ?? enDict,
      formatMessage,
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return ctx;
}
