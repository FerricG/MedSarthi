"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import enDict from "@/i18n/en.json";
import hiDict from "@/i18n/hi.json";
import hiLatnDict from "@/i18n/hi-Latn.json";

export type SupportedLocale =
  | "en"
  | "hi"
  | "hi-Latn"
  | "bn"
  | "mr"
  | "ta"
  | "te"
  | "gu"
  | "kn"
  | "ml"
  | "pa";
export type I18nDictionary = typeof enDict;

export interface LocaleRegistryItem {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
  tier: "mvp" | "extensible";
}

export const SUPPORTED_LOCALES: LocaleRegistryItem[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr", tier: "mvp" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", dir: "ltr", tier: "mvp" },
  { code: "hi-Latn", label: "Hinglish", nativeLabel: "Hinglish", dir: "ltr", tier: "mvp" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", dir: "ltr", tier: "mvp" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", dir: "ltr", tier: "mvp" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", dir: "ltr", tier: "mvp" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", dir: "ltr", tier: "mvp" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", dir: "ltr", tier: "mvp" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", dir: "ltr", tier: "mvp" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", dir: "ltr", tier: "mvp" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", dir: "ltr", tier: "mvp" },
];

export const EXTENSIBLE_INDIAN_LOCALES: LocaleRegistryItem[] = [];

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function mergeDict(base: I18nDictionary, override?: DeepPartial<I18nDictionary>): I18nDictionary {
  if (!override) return base;
  return {
    ...base,
    ...override,
    nav: { ...base.nav, ...(override.nav || {}) },
    accessibility: { ...base.accessibility, ...(override.accessibility || {}) },
    safety: { ...base.safety, ...(override.safety || {}) },
    auth: { ...base.auth, ...(override.auth || {}) },
    patientHome: {
      ...base.patientHome,
      ...(override.patientHome || {}),
      actions: { ...base.patientHome.actions, ...(override.patientHome?.actions || {}) },
    },
    onboarding: { ...base.onboarding, ...(override.onboarding || {}) },
  } as I18nDictionary;
}

const REGIONAL_OVERRIDES: Partial<Record<SupportedLocale, DeepPartial<I18nDictionary>>> = {
  bn: {
    nav: { patientHome: "হোম", instructions: "ডাক্তারের পরামর্শ", reports: "রিপোর্ট", medicines: "ওষুধ", talk: "প্রশ্ন করুন", listen: "শুনুন", history: "ইতিহাস", settings: "সেটিংস", signIn: "সাইন ইন", register: "অ্যাকাউন্ট খুলুন" },
    patientHome: { greeting: "আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?", subtitle: "সহজভাবে শুরু করতে নিচের যেকোনো একটি বড় বোতামে ট্যাপ করুন।", welcomePrefix: "স্বাগতম," },
  },
  mr: {
    nav: { patientHome: "मुख्य पान", instructions: "डॉक्टरांचा सल्ला", reports: "रिपोर्ट", medicines: "औषधे", talk: "प्रश्न विचारा", listen: "ऐका", history: "इतिहास", settings: "सेटिंग्ज", signIn: "साइन इन", register: "खाते उघडा" },
    patientHome: { greeting: "आज मी तुम्हाला कशी मदत करू शकते?", subtitle: "सुरू करण्यासाठी खालील एका मोठ्या बटनावर टॅप करा.", welcomePrefix: "स्वागत आहे," },
  },
  ta: {
    nav: { patientHome: "முகப்பு", instructions: "மருத்துவர் அறிவுரை", reports: "அறிக்கைகள்", medicines: "மருந்துகள்", talk: "கேள்வி கேளுங்கள்", listen: "கேளுங்கள்", history: "வரலாறு", settings: "அமைப்புகள்", signIn: "உள்நுழைக", register: "பதிவு செய்க" },
    patientHome: { greeting: "இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?", subtitle: "தொடங்க கீழே உள்ள ஒரு பெரிய பொத்தானைத் தட்டவும்.", welcomePrefix: "நல்வரவு," },
  },
  te: {
    nav: { patientHome: "హోమ్", instructions: "డాక్టర్ సూచనలు", reports: "రిపోర్టులు", medicines: "మందులు", talk: "ప్రశ్న అడగండి", listen: "వినండి", history: "చరిత్ర", settings: "సెట్టింగ్‌లు", signIn: "సైన్ ఇన్", register: "నమోదు" },
    patientHome: { greeting: "ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?", subtitle: "ప్రారంభించడానికి క్రింది పెద్ద బటన్‌పై నొక్కండి.", welcomePrefix: "స్వాగతం," },
  },
  gu: {
    nav: { patientHome: "હોમ", instructions: "ડૉક્ટરની સલાહ", reports: "રિપોર્ટ", medicines: "દવાઓ", talk: "પ્રશ્ન પૂછો", listen: "સાંભળો", history: "ઇતિહાસ", settings: "સેટિંગ્સ", signIn: "સાઇન ઇન", register: "નોંધણી" },
    patientHome: { greeting: "આજે હું તમને કેવી રીતે મદદ કરી શકું?", subtitle: "શરૂ કરવા માટે નીચેના મોટા બટન પર ટૅપ કરો.", welcomePrefix: "સ્વાગત છે," },
  },
  kn: {
    nav: { patientHome: "ಮುಖಪುಟ", instructions: "ವೈದ್ಯರ ಸಲಹೆ", reports: "ವರದಿಗಳು", medicines: "ಔಷಧಿಗಳು", talk: "ಪ್ರಶ್ನೆ ಕೇಳಿ", listen: "ಕೇಳಿ", history: "ಇತಿಹಾಸ", settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು", signIn: "ಸೈನ್ ಇನ್", register: "ನೋಂದಣಿ" },
    patientHome: { greeting: "ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?", subtitle: "ಪ್ರಾರಂಭಿಸಲು ಕೆಳಗಿನ ದೊಡ್ಡ ಬಟನ್ ಟ್ಯಾಪ್ ಮಾಡಿ.", welcomePrefix: "ಸ್ವಾಗತ," },
  },
  ml: {
    nav: { patientHome: "ഹോം", instructions: "ഡോക്ടറുടെ നിർദ്ദേശം", reports: "റിപ്പോർട്ടുകൾ", medicines: "മരുന്നുകൾ", talk: "ചോദ്യം ചോദിക്കൂ", listen: "കേൾക്കൂ", history: "ചരിത്രം", settings: "സെറ്റിംഗുകൾ", signIn: "സൈൻ ഇൻ", register: "രജിസ്റ്റർ" },
    patientHome: { greeting: "ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?", subtitle: "ആരംഭിക്കാൻ താഴെയുള്ള വലിയ ബട്ടണിൽ ടാപ്പ് ചെയ്യുക.", welcomePrefix: "സ്വാഗതം," },
  },
  pa: {
    nav: { patientHome: "ਮੁੱਖ ਪੰਨਾ", instructions: "ਡਾਕਟਰ ਦੀ ਸਲਾਹ", reports: "ਰਿਪੋਰਟਾਂ", medicines: "ਦਵਾਈਆਂ", talk: "ਸਵਾਲ ਪੁੱਛੋ", listen: "ਸੁਣੋ", history: "ਇਤਿਹਾਸ", settings: "ਸੈਟਿੰਗਾਂ", signIn: "ਸਾਈਨ ਇਨ", register: "ਰਜਿਸਟਰ" },
    patientHome: { greeting: "ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੀ ਹਾਂ?", subtitle: "ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਵੱਡੇ ਬਟਨ ਤੇ ਟੈਪ ਕਰੋ।", welcomePrefix: "ਜੀ ਆਇਆਂ ਨੂੰ," },
  },
};

const DICTIONARIES: Record<SupportedLocale, I18nDictionary> = {
  en: enDict,
  hi: hiDict,
  "hi-Latn": hiLatnDict,
  bn: mergeDict(enDict, REGIONAL_OVERRIDES.bn),
  mr: mergeDict(enDict, REGIONAL_OVERRIDES.mr),
  ta: mergeDict(enDict, REGIONAL_OVERRIDES.ta),
  te: mergeDict(enDict, REGIONAL_OVERRIDES.te),
  gu: mergeDict(enDict, REGIONAL_OVERRIDES.gu),
  kn: mergeDict(enDict, REGIONAL_OVERRIDES.kn),
  ml: mergeDict(enDict, REGIONAL_OVERRIDES.ml),
  pa: mergeDict(enDict, REGIONAL_OVERRIDES.pa),
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
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY) as SupportedLocale | null;
      if (saved && saved in DICTIONARIES) {
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
