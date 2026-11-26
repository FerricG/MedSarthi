"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Headphones, Languages, Pill, Stethoscope } from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { SUPPORTED_LOCALES, useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import {
  api,
  normalizeProvenance,
  type ConsultationDetail,
  type ConsultationSummary,
  type MedicationListItem,
} from "@/lib/api";

function ListenWorkspace() {
  const { locale } = useI18n();
  const { setLanguage } = useAccessibility();

  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<ConsultationDetail | null>(null);
  const [meds, setMeds] = useState<MedicationListItem[]>([]);
  const [customSummary, setCustomSummary] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadAudioSources() {
      setLoading(true);
      try {
        const [consultList, medList] = await Promise.all([
          api.listConsultations().catch(() => [] as ConsultationSummary[]),
          api.listMedications().catch(() => [] as MedicationListItem[]),
        ]);
        if (!active) return;
        setConsultations(consultList);
        setMeds(medList);
        if (consultList.length > 0) {
          const detail = await api.getConsultation(consultList[0].id);
          if (active) setSelectedDetail(detail);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadAudioSources();
    return () => {
      active = false;
    };
  }, []);

  async function selectConsultation(id: string) {
    setCustomSummary(null);
    setLoading(true);
    try {
      const detail = await api.getConsultation(id);
      setSelectedDetail(detail);
    } finally {
      setLoading(false);
    }
  }

  async function handleLanguageSwitch(nextLang: SupportedLocale) {
    setLanguage(nextLang);
    void api.updatePreferences({ preferred_language: nextLang }).catch(() => {});
    if (!selectedDetail) return;

    setTranslating(true);
    try {
      if (nextLang === "en") {
        setCustomSummary(null);
        return;
      }
      const res = await api.translate({
        consultation_id: selectedDetail.id,
        explanation_payload: normalizeProvenance(selectedDetail.generated_explanation),
        source_language: "en",
        target_language: nextLang,
        mode: "patient_friendly",
        preserve_english_terms: true,
      });
      const prov = normalizeProvenance(res.translated_provenance ?? res.provenance);
      const combined = [
        prov.ai_simplified.summary,
        ...(prov.ai_simplified.steps || []),
      ]
        .filter(Boolean)
        .join(" ");
      setCustomSummary(combined || res.translated_text || null);
    } catch {
      setCustomSummary(null);
    } finally {
      setTranslating(false);
    }
  }

  const narrationText = useMemo(() => {
    if (customSummary) return customSummary;
    if (!selectedDetail?.generated_explanation) return "";
    const prov = normalizeProvenance(selectedDetail.generated_explanation);
    const lines: string[] = [];
    if (prov.ai_simplified.summary) lines.push(prov.ai_simplified.summary);
    if (prov.ai_simplified.steps) lines.push(...prov.ai_simplified.steps);
    for (const u of prov.uncertain_or_missing) {
      lines.push(typeof u === "string" ? u : u.reason);
    }
    return lines.join(" ");
  }, [customSummary, selectedDetail]);

  const medsText = useMemo(() => {
    if (meds.length === 0) return "";
    return meds
      .map(
        (m) =>
          `${m.medicine_name} ${m.dose}: ${m.frequency}. ${
            m.warnings.length > 0 ? m.warnings.join(". ") : ""
          }`
      )
      .join(" ");
  }, [meds]);

  return (
      <div className="space-y-6">
        <header className="ms-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Headphones className="h-7 w-7 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <div>
                <h1 className="text-2xl font-extrabold sm:text-3xl">Listen to my explanation</h1>
                <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                  Tap Play to hear each sentence highlighted calmly at your comfortable speed.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Languages className="h-4 w-4 mr-1" aria-hidden="true" />
              {(
                [
                  { code: "en", label: "English" },
                  { code: "hi", label: "हिन्दी" },
                  { code: "hi-Latn", label: "Hinglish" },
                ] as const
              ).map((opt) => {
                const active = locale === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    disabled={translating}
                    onClick={() => void handleLanguageSwitch(opt.code)}
                    aria-pressed={active}
                    className="tap-target rounded-xl border-2 px-3 py-1 text-xs font-extrabold"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <select
                aria-label="More languages"
                disabled={translating}
                value={locale}
                onChange={(e) => void handleLanguageSwitch(e.target.value as SupportedLocale)}
                className="tap-target rounded-xl border-2 px-2.5 py-1 text-xs font-extrabold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                {SUPPORTED_LOCALES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.nativeLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {consultations.length > 0 && (
            <div className="space-y-1.5 border-t pt-3" style={{ borderColor: "var(--ms-border)" }}>
              <label htmlFor="listen-consult-select" className="block text-xs font-extrabold uppercase">
                Choose Visit Explanation:
              </label>
              <select
                id="listen-consult-select"
                value={selectedDetail?.id || ""}
                onChange={(e) => void selectConsultation(e.target.value)}
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-bold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                {consultations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.visit_date ? `(${c.visit_date})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        {loading || translating ? (
          <div className="ms-card p-8 text-center font-bold">
            {translating ? "Preparing audio in selected language..." : "Loading audio tracks..."}
          </div>
        ) : (
          <div className="space-y-6">
            {selectedDetail && narrationText ? (
              <section className="space-y-2">
                <h2 className="text-lg font-extrabold flex items-center gap-2">
                  <Stethoscope className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                  <span>{selectedDetail.title}</span>
                </h2>
                <AudioPlayer
                  text={narrationText}
                  language={locale}
                  label="Listen to Visit Instructions"
                />
              </section>
            ) : (
              <div className="ms-card p-6 text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                No shared consultation explanation found yet.
              </div>
            )}

            {medsText && (
              <section className="space-y-2">
                <h2 className="text-lg font-extrabold flex items-center gap-2">
                  <Pill className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                  <span>Your Medicine Schedule &amp; Warnings</span>
                </h2>
                <AudioPlayer
                  text={medsText}
                  language={locale}
                  label="Listen to Medicine Reminders"
                />
              </section>
            )}
          </div>
        )}
      </div>
  );
}

export default function PatientListenPage() {
  return (
    <PatientGate>
      <ListenWorkspace />
    </PatientGate>
  );
}
