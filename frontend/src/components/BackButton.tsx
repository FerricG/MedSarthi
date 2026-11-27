"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { useAppNavigation } from "@/contexts/NavigationContext";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";

const BACK_LABELS: Record<SupportedLocale, string> = {
  en: "Back",
  hi: "वापस",
  "hi-Latn": "Wapas",
  bn: "ফিরে যান",
  mr: "मागे",
  ta: "பின்னால்",
  te: "వెనుకకు",
  gu: "પાછા",
  kn: "ಹಿಂದೆ",
  ml: "തിരികെ",
  pa: "ਵਾਪਸ",
};

export interface BackButtonProps {
  variant?: "header" | "page" | "inline";
  label?: string;
  className?: string;
  forceShow?: boolean;
}

export function BackButton({
  variant = "page",
  label,
  className,
  forceShow = false,
}: BackButtonProps) {
  const { goBack, canGoBack, previousPageTitle } = useAppNavigation();
  const { locale } = useI18n();

  if (!canGoBack && !forceShow) {
    return null;
  }

  const localizedText = label || BACK_LABELS[locale] || "Back";
  const accessibleTitle = `Go back to ${previousPageTitle}`;

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={goBack}
        title={accessibleTitle}
        aria-label={accessibleTitle}
        className={
          className ||
          "tap-target inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs sm:text-sm font-extrabold transition-all hover:scale-105 active:scale-95 shadow-sm"
        }
        style={{
          backgroundColor: "var(--ms-surface-alt)",
          borderColor: "var(--ms-border)",
          color: "var(--ms-ink)",
        }}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{localizedText}</span>
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={goBack}
        title={accessibleTitle}
        aria-label={accessibleTitle}
        className={
          className ||
          "tap-target inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-all hover:opacity-90"
        }
        style={{
          backgroundColor: "var(--ms-surface)",
          borderColor: "var(--ms-border)",
          color: "var(--ms-ink)",
        }}
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{localizedText}</span>
      </button>
    );
  }

  // Default "page" variant
  return (
    <button
      type="button"
      onClick={goBack}
      title={accessibleTitle}
      aria-label={accessibleTitle}
      className={
        className ||
        "ms-btn-secondary tap-target inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
      }
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{localizedText}</span>
    </button>
  );
}
