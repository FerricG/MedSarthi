"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import enDict from "@/i18n/en.json";
import hiDict from "@/i18n/hi.json";
import hiLatnDict from "@/i18n/hi-Latn.json";

export type SupportedLocale = "en" | "hi" | "hi-Latn";
export type I18nDictionary = typeof enDict;

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
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

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
