"use client";

import React from "react";
import { PhoneCall, ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { EmergencyGuidance } from "@/lib/api";

const CLIENT_EMERGENCY_PATTERNS = [
  /\b(chest\s*pain|severe\s*chest|heart\s*attack|cannot\s*breathe|can't\s*breathe|trouble\s*breathing|shortness\s*of\s*breath|heavy\s*bleeding|unconscious|fainted|seizure|stroke|facial\s*droop|slurred\s*speech|suicid|kill\s*myself|overdose)\b/i,
  /\b(seene\s*mein\s*dard|chhati\s*mein\s*dard|saans\s*lene\s*mein\s*(takleef|dikkat|mushkil)|tez\s*khoon|behosh)\b/i,
  /(सीने में दर्द|सांस लेने में कठिनाई|सांस फूलना|बेहोश|भारी रक्तस्राव)/,
];

const NEGATION_PREFIX_PATTERN = /\b(no|not|without|never|denied|nahi|nahin)\s+$/i;

export function detectClientEmergencyKeywords(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  for (const re of CLIENT_EMERGENCY_PATTERNS) {
    const match = re.exec(normalized);
    if (match) {
      const prefix = normalized.slice(Math.max(0, match.index - 24), match.index);
      if (!NEGATION_PREFIX_PATTERN.test(prefix)) {
        return true;
      }
    }
  }
  return false;
}

export interface EmergencyAlertProps {
  guidance?: EmergencyGuidance | null;
  visible?: boolean;
  onDismiss?: () => void;
}

export function EmergencyAlert({ guidance, visible = true, onDismiss }: EmergencyAlertProps) {
  const { t } = useI18n();
  if (!visible) return null;

  const title = guidance?.banner_title || t.safety.emergencyBannerTitle;
  const body = guidance?.banner_message || t.safety.emergencySeekCare;
  const helplines =
    guidance?.helplines && guidance.helplines.length > 0
      ? guidance.helplines
      : [
          { label: "National Emergency", number: "112" },
          { label: "Ambulance", number: "108" },
        ];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border-4 p-5 shadow-md space-y-3"
      style={{
        backgroundColor: "var(--ms-danger-bg)",
        borderColor: "var(--ms-danger-border)",
        color: "var(--ms-danger-ink)",
      }}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-7 w-7 shrink-0" aria-hidden="true" />
        <div className="space-y-1.5">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <p className="text-base font-semibold leading-relaxed">{body}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {helplines.map((line) => (
          <a
            key={line.number}
            href={`tel:${line.number}`}
            className="tap-target-lg inline-flex items-center gap-2 rounded-xl border-2 px-5 py-3 text-base font-extrabold"
            style={{
              backgroundColor: "var(--ms-danger-border)",
              borderColor: "var(--ms-danger-border)",
              color: "#FFFFFF",
            }}
          >
            <PhoneCall className="h-5 w-5" aria-hidden="true" />
            <span>
              {line.label}: {line.number}
            </span>
          </a>
        ))}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="tap-target rounded-xl border-2 px-4 py-2 text-sm font-bold"
            style={{
              backgroundColor: "var(--ms-surface)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-ink)",
            }}
          >
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
}
