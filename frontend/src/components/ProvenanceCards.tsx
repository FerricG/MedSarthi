"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Sparkles,
  Stethoscope,
  Volume2,
} from "lucide-react";
import { speakTextWithMithi, stopActiveMithiNarration } from "@/components/AudioPlayer";
import { useI18n } from "@/i18n/I18nProvider";
import {
  normalizeProvenance,
  type DoctorProvidedItem,
  type GeneralEducationItem,
  type ProvenancePayload,
  type UncertainOrMissingItem,
} from "@/lib/api";

const KNOWN_MEDICAL_TERMS = [
  "Acute Nasopharyngitis",
  "Upper Respiratory Infection",
  "Hypertension",
  "Pneumonia",
  "Serum Creatinine",
  "Creatinine",
  "HbA1c",
  "Fasting Plasma Glucose",
  "Paracetamol",
  "Amlodipine",
  "Azithromycin",
  "Metformin",
  "Amoxicillin",
  "Cefixime",
  "Fever",
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithTermLinks(
  text: string,
  extraTerms: string[],
  onTermClick?: (term: string) => void
): React.ReactNode {
  if (!onTermClick || !text) return text;
  const terms = Array.from(new Set([...extraTerms, ...KNOWN_MEDICAL_TERMS]))
    .filter((t) => t.trim().length >= 3)
    .sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;

  const pattern = new RegExp(`\\b(${terms.map(escapeRegExp).join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;

  return parts.map((part, idx) => {
    const matched = terms.find((term) => term.toLowerCase() === part.toLowerCase());
    if (!matched) {
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    }
    return (
      <button
        key={idx}
        type="button"
        onClick={() => onTermClick(part)}
        className="mx-0.5 inline-flex items-center rounded-md border-b-2 px-1 py-0.5 font-bold underline decoration-dotted underline-offset-4 hover:opacity-85"
        style={{
          backgroundColor: "var(--ms-primary-soft)",
          borderColor: "var(--ms-primary)",
          color: "var(--ms-ink)",
        }}
        title={`Tap to see what "${part}" means`}
      >
        {part}
      </button>
    );
  });
}

function getCitations(item: GeneralEducationItem) {
  if (item.citations && item.citations.length > 0) {
    return item.citations;
  }
  if (item.source_name && item.source_url) {
    return [{ source_name: item.source_name, source_url: item.source_url }];
  }
  return [];
}

export interface ProvenanceCardsProps {
  provenance: ProvenancePayload | unknown;
  originalDoctorInput?: string | null;
  highlightedTerms?: string[];
  onTermClick?: (term: string) => void;
  onDiagramClick?: (diagramId: string) => void;
  onAskDoctorClick?: (question: string) => void;
  headingMode?: "default" | "three_part_explain_everything";
  compact?: boolean;
  enableNarrator?: boolean;
}

export function ProvenanceCards({
  provenance,
  originalDoctorInput,
  highlightedTerms = [],
  onTermClick,
  onDiagramClick,
  onAskDoctorClick,
  headingMode = "default",
  compact = false,
  enableNarrator = false,
}: ProvenanceCardsProps) {
  const { t, locale } = useI18n();
  const data = normalizeProvenance(provenance);
  const [activeVoiceSection, setActiveVoiceSection] = useState<string | null>(null);

  function handleSpeakSection(sectionId: string, text: string) {
    if (activeVoiceSection === sectionId) {
      stopActiveMithiNarration();
      setActiveVoiceSection(null);
      return;
    }
    setActiveVoiceSection(sectionId);
    speakTextWithMithi(
      text,
      locale,
      1.0,
      "charvi",
      () => setActiveVoiceSection(null),
      () => setActiveVoiceSection(null)
    );
  }

  const doctorItems: DoctorProvidedItem[] = data.doctor_provided.map((item) =>
    typeof item === "string" ? { text: item } : item
  );
  const uncertainItems: UncertainOrMissingItem[] = data.uncertain_or_missing.map((item) =>
    typeof item === "string" ? { reason: item } : item
  );

  const isThreePart = headingMode === "three_part_explain_everything";
  const pad = compact ? "p-3.5" : "p-5";
  const hasSimplified =
    Boolean(data.ai_simplified.summary?.trim()) ||
    Boolean(data.ai_simplified.steps && data.ai_simplified.steps.length > 0);

  return (
    <div className="space-y-4">
      {/* 1. Doctor-Provided Information (Always visually distinct: Teal/Solid Left Border + Stethoscope) */}
      {(doctorItems.length > 0 || originalDoctorInput) && (
        <section
          aria-label={t.provenance.doctorProvided}
          className={`rounded-2xl border-2 border-l-8 ${pad} space-y-3`}
          style={{
            backgroundColor: "var(--ms-prov-doctor-bg)",
            borderColor: "var(--ms-prov-doctor-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Stethoscope className="h-5 w-5 shrink-0" style={{ color: "var(--ms-prov-doctor-border)" }} aria-hidden="true" />
              <h3 className="text-base font-extrabold">
                {isThreePart ? `1. ${t.provenance.doctorProvided}` : t.provenance.doctorProvided}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {enableNarrator && (
                <button
                  type="button"
                  onClick={() => {
                    const text = (originalDoctorInput || "") + " " + doctorItems.map((d) => d.text).join(". ");
                    handleSpeakSection("doctor", text || "Doctor provided information.");
                  }}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                  aria-pressed={activeVoiceSection === "doctor"}
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{activeVoiceSection === "doctor" ? "Stop" : "Listen Doctor Advice"}</span>
                </button>
              )}
              {originalDoctorInput && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-prov-doctor-border)",
                    color: "var(--ms-ink)",
                  }}
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.provenance.lockedSource}</span>
                </span>
              )}
            </div>
          </div>

          {originalDoctorInput && (
            <div
              className="rounded-xl border p-3.5 text-sm leading-relaxed"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
              }}
            >
              <p className="whitespace-pre-wrap font-medium">
                {renderWithTermLinks(originalDoctorInput, highlightedTerms, onTermClick)}
              </p>
            </div>
          )}

          {doctorItems.length > 0 && (
            <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">
              {doctorItems.map((item, idx) => (
                <li key={idx} className="font-medium">
                  {renderWithTermLinks(item.text, highlightedTerms, onTermClick)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 2. AI Simplified Explanation (Blue/Cyan Dashed Border + Sparkles) */}
      {hasSimplified && headingMode === "default" && (
        <section
          aria-label={t.provenance.aiSimplified}
          className={`rounded-2xl border-2 border-dashed ${pad} space-y-3`}
          style={{
            backgroundColor: "var(--ms-prov-ai-bg)",
            borderColor: "var(--ms-prov-ai-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 shrink-0" style={{ color: "var(--ms-prov-ai-border)" }} aria-hidden="true" />
              <h3 className="text-base font-extrabold">{t.provenance.aiSimplified}</h3>
            </div>
            <div className="flex items-center gap-2">
              {enableNarrator && (
                <button
                  type="button"
                  onClick={() => {
                    const text = (data.ai_simplified.summary || "") + ". " + (data.ai_simplified.steps || []).join(". ");
                    handleSpeakSection("simplified", text || "Simple explanation of your doctor's instructions.");
                  }}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                  aria-pressed={activeVoiceSection === "simplified"}
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{activeVoiceSection === "simplified" ? "Stop" : "Listen Simple Guide"}</span>
                </button>
              )}
              {data.ai_simplified.reading_level && (
                <span
                  className="rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-prov-ai-border)",
                  }}
                >
                  {data.ai_simplified.reading_level.replace("_", " ")}
                </span>
              )}
            </div>
          </div>

          {data.ai_simplified.summary && (
            <p className="text-base leading-relaxed font-medium">
              {renderWithTermLinks(data.ai_simplified.summary, highlightedTerms, onTermClick)}
            </p>
          )}

          {data.ai_simplified.steps && data.ai_simplified.steps.length > 0 && (
            <ol className="space-y-2.5 pt-1">
              {data.ai_simplified.steps.map((step, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 rounded-xl border p-3 text-base leading-relaxed"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                    style={{
                      backgroundColor: "var(--ms-primary)",
                      color: "var(--ms-primary-ink)",
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span className="font-medium">
                    {renderWithTermLinks(step, highlightedTerms, onTermClick)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* 3. General Medical Knowledge (Slate/Indigo Solid Border + BookOpen + Citations) */}
      {data.general_education.length > 0 && (
        <section
          aria-label={t.provenance.generalEducation}
          className={`rounded-2xl border-2 ${pad} space-y-3`}
          style={{
            backgroundColor: "var(--ms-prov-kb-bg)",
            borderColor: "var(--ms-prov-kb-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 shrink-0" style={{ color: "var(--ms-prov-kb-border)" }} aria-hidden="true" />
              <h3 className="text-base font-extrabold">
                {isThreePart ? `2. ${t.provenance.generalEducation}` : t.provenance.generalEducation}
              </h3>
            </div>
            {enableNarrator && (
              <button
                type="button"
                onClick={() => {
                  const text = data.general_education.map((g) => g.text).join(". ");
                  handleSpeakSection("knowledge", text || "General medical knowledge.");
                }}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                aria-pressed={activeVoiceSection === "knowledge"}
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{activeVoiceSection === "knowledge" ? "Stop" : "Listen Knowledge"}</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {data.general_education.map((item, idx) => {
              const citations = getCitations(item);
              return (
                <article
                  key={idx}
                  className="rounded-xl border p-3.5 space-y-2"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <h4 className="text-base font-bold">
                    {renderWithTermLinks(item.topic, highlightedTerms, onTermClick)}
                  </h4>
                  <p className="text-sm leading-relaxed">
                    {renderWithTermLinks(item.text, highlightedTerms, onTermClick)}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {citations.map((cit, cIdx) => (
                      <a
                        key={cIdx}
                        href={cit.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-target inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold underline underline-offset-2 hover:opacity-85"
                        style={{
                          backgroundColor: "var(--ms-surface-alt)",
                          borderColor: "var(--ms-border)",
                          color: "var(--ms-ink)",
                        }}
                      >
                        <span>
                          {t.provenance.infoSource}: {cit.source_name}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ))}
                    {item.diagram_id && onDiagramClick && (
                      <button
                        type="button"
                        onClick={() => onDiagramClick(item.diagram_id!)}
                        className="tap-target inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold hover:opacity-85"
                        style={{
                          backgroundColor: "var(--ms-primary-soft)",
                          borderColor: "var(--ms-primary)",
                          color: "var(--ms-ink)",
                        }}
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>View Simple Diagram</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Needs Clarification / Unknown (Amber Dotted/Thick Border + AlertTriangle) */}
      {uncertainItems.length > 0 && (
        <section
          aria-label={t.provenance.uncertainOrMissing}
          className={`rounded-2xl border-2 border-dotted ${pad} space-y-3`}
          style={{
            backgroundColor: "var(--ms-prov-uncertain-bg)",
            borderColor: "var(--ms-prov-uncertain-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                className="h-5 w-5 shrink-0"
                style={{ color: "var(--ms-prov-uncertain-border)" }}
                aria-hidden="true"
              />
              <h3 className="text-base font-extrabold">
                {isThreePart ? `3. ${t.provenance.uncertainOrMissing}` : t.provenance.uncertainOrMissing}
              </h3>
            </div>
            {enableNarrator && (
              <button
                type="button"
                onClick={() => {
                  const text = uncertainItems.map((u) => u.reason).join(". ");
                  handleSpeakSection("uncertain", text || "Unclear or missing details.");
                }}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                aria-pressed={activeVoiceSection === "uncertain"}
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{activeVoiceSection === "uncertain" ? "Stop" : "Listen Warnings"}</span>
              </button>
            )}
          </div>

          <ul className="space-y-2.5">
            {uncertainItems.map((item, idx) => {
              const question = item.suggested_doctor_question || item.suggested_question;
              return (
                <li
                  key={idx}
                  className="rounded-xl border p-3.5 text-sm leading-relaxed space-y-1.5"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-prov-uncertain-border)",
                  }}
                >
                  {item.field && (
                    <span className="inline-block rounded bg-black/5 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                      {item.field.replace(/_/g, " ")}
                    </span>
                  )}
                  <p className="font-medium">{item.reason}</p>
                  {question && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <p className="text-xs font-bold" style={{ color: "var(--ms-ink-muted)" }}>
                        {t.provenance.askDoctorPrompt}: &ldquo;{question}&rdquo;
                      </p>
                      {onAskDoctorClick && (
                        <button
                          type="button"
                          onClick={() => onAskDoctorClick(question)}
                          className="tap-target rounded-lg border px-3 py-1 text-xs font-bold"
                          style={{ borderColor: "var(--ms-border)" }}
                        >
                          Ask MedSarthi about this
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
