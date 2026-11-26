"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Calendar, HelpCircle, Languages, MessageCircle, Sparkles, Stethoscope } from "lucide-react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DiagramViewer } from "@/components/DiagramViewer";
import { IntegrityNotice } from "@/components/IntegrityNotice";
import { ProvenanceCards } from "@/components/ProvenanceCards";
import { TermLookupModal } from "@/components/TermLookupModal";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  normalizeProvenance,
  type ConsultationDetail,
  type ConsultationSummary,
  type ExplainMoreTrigger,
  type ExplanationDepth,
  type ProvenancePayload,
} from "@/lib/api";

const EXPLAIN_MORE_BUTTONS: {
  trigger: ExplainMoreTrigger;
  label: string;
  hiLabel: string;
  hinglishLabel: string;
}[] = [
  {
    trigger: "word_meaning",
    label: "What does this word mean?",
    hiLabel: "इस शब्द का क्या अर्थ है?",
    hinglishLabel: "Is shabd ka kya matlab hai?",
  },
  {
    trigger: "causes_mechanism",
    label: "Why did this happen?",
    hiLabel: "यह क्यों हुआ?",
    hinglishLabel: "Yeh kyun hua?",
  },
  {
    trigger: "organ_function",
    label: "What does this part of the body do?",
    hiLabel: "शरीर का यह हिस्सा क्या करता है?",
    hinglishLabel: "Body ka yeh hissa kya karta hai?",
  },
  {
    trigger: "test_purpose",
    label: "Why did the doctor order this test?",
    hiLabel: "डॉक्टर ने यह जांच क्यों बताई?",
    hinglishLabel: "Doctor ne yeh test kyun likha?",
  },
  {
    trigger: "medicine_purpose",
    label: "Why did the doctor give this medicine?",
    hiLabel: "डॉक्टर ने यह दवा क्यों दी?",
    hinglishLabel: "Doctor ne yeh dawa kyun di?",
  },
  {
    trigger: "common_symptoms",
    label: "What are common symptoms?",
    hiLabel: "इसके सामान्य लक्षण क्या हैं?",
    hinglishLabel: "Iske aam lakshan kya hain?",
  },
  {
    trigger: "more_detail",
    label: "Explain in more detail",
    hiLabel: "थोड़ा और विस्तार से समझाएं",
    hinglishLabel: "Thoda aur detail mein samjhayein",
  },
  {
    trigger: "explain_everything",
    label: "Explain everything",
    hiLabel: "सब कुछ 3 भागों में समझाएं",
    hinglishLabel: "Sab kuch 3 hisson mein samjhayein",
  },
];

const DEPTH_OPTIONS: { id: ExplanationDepth; label: string }[] = [
  { id: "very_simple", label: "Very Simple" },
  { id: "simple", label: "Simple" },
  { id: "detailed", label: "Detailed" },
  { id: "deep_dive", label: "Deep Dive" },
];

export interface ConsultationViewerProps {
  initialConsultationId?: string;
}

export function ConsultationViewer({ initialConsultationId }: ConsultationViewerProps) {
  const { locale } = useI18n();
  const { prefs, setLanguage, updatePrefs } = useAccessibility();

  const [list, setList] = useState<ConsultationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConsultationId ?? null);
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [activeProvenance, setActiveProvenance] = useState<ProvenancePayload | null>(null);
  const [activeDepth, setActiveDepth] = useState<ExplanationDepth>(prefs.explanationDepth);

  const [loading, setLoading] = useState(true);
  const [adapting, setAdapting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [explainMoreLoading, setExplainMoreLoading] = useState<ExplainMoreTrigger | null>(null);
  const [explainMoreResult, setExplainMoreResult] = useState<{
    trigger: ExplainMoreTrigger;
    provenance: ProvenancePayload;
    diagramId?: string;
  } | null>(null);

  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadList() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const items = await api.listConsultations();
        if (!mounted) return;
        setList(items);
        if (!initialConsultationId && items.length > 0) {
          setSelectedId(items[0].id);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg(
            err instanceof ApiError ? err.message : "Could not load your consultations."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadList();
    return () => {
      mounted = false;
    };
  }, [initialConsultationId]);

  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    async function loadDetail() {
      setLoading(true);
      setErrorMsg(null);
      setExplainMoreResult(null);
      try {
        const res = await api.getConsultation(selectedId!);
        if (!mounted) return;
        setDetail(res);
        const norm = normalizeProvenance(res.generated_explanation);
        setActiveProvenance(norm);
        const firstDiagram = norm.general_education.find((g) => g.diagram_id)?.diagram_id;
        if (firstDiagram) {
          setActiveDiagramId(firstDiagram);
        } else if (res.visual_diagrams && res.visual_diagrams.length > 0) {
          setActiveDiagramId(res.visual_diagrams[0].id);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg(err instanceof ApiError ? err.message : "Could not open consultation details.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadDetail();
    return () => {
      mounted = false;
    };
  }, [selectedId]);

  async function handleLanguageOrDepthSwitch(
    nextLang: SupportedLocale,
    nextDepth: ExplanationDepth = activeDepth
  ) {
    if (!detail) return;
    setLanguage(nextLang);
    setActiveDepth(nextDepth);
    updatePrefs({ preferredLanguage: nextLang, explanationDepth: nextDepth });
    void api
      .updatePreferences({ preferred_language: nextLang, explanation_depth: nextDepth })
      .catch(() => {});

    setAdapting(true);
    setErrorMsg(null);
    const depthChanged = nextDepth !== activeDepth || nextDepth !== (detail.explanation_depth as ExplanationDepth);
    try {
      if (!depthChanged && nextLang !== "en") {
        const translated = await api.translate({
          consultation_id: detail.id,
          explanation_payload: normalizeProvenance(detail.generated_explanation),
          source_language: "en",
          target_language: nextLang,
          mode: "patient_friendly",
          preserve_english_terms: true,
        });
        if (translated.translated_provenance || translated.provenance) {
          setActiveProvenance(
            normalizeProvenance(translated.translated_provenance ?? translated.provenance)
          );
          return;
        }
        if (translated.translated_text) {
          const base = normalizeProvenance(detail.generated_explanation);
          setActiveProvenance({
            ...base,
            ai_simplified: {
              ...base.ai_simplified,
              summary: translated.translated_text,
              language: nextLang,
              reading_level: nextDepth,
            },
          });
          return;
        }
      }

      const explained = await api.explain({
        source_type: "consultation",
        consultation_id: detail.id,
        raw_text: detail.original_doctor_input,
        target_language: nextLang,
        explanation_depth: nextDepth,
        include_visuals: true,
      });
      setActiveProvenance(normalizeProvenance(explained.provenance));
    } catch {
      // Fallback gracefully to original explanation if translation endpoint is offline
      if (detail.generated_explanation) {
        setActiveProvenance(normalizeProvenance(detail.generated_explanation));
      }
    } finally {
      setAdapting(false);
    }
  }

  async function handleExplainMore(trigger: ExplainMoreTrigger) {
    if (trigger === "word_meaning") {
      const firstDiag = detail?.structured_data?.diagnoses?.[0] || "Acute Nasopharyngitis";
      setActiveTerm(firstDiag);
      return;
    }
    if (!detail) return;
    setExplainMoreLoading(trigger);
    try {
      const res = await api.explainMore({
        consultation_id: detail.id,
        source_text: detail.original_doctor_input,
        trigger,
        target_depth: trigger === "more_detail" ? "detailed" : activeDepth,
        target_language: locale,
      });
      const norm = normalizeProvenance(res.provenance);
      const diagram =
        res.visual_diagrams?.[0]?.id ||
        norm.general_education.find((g) => g.diagram_id)?.diagram_id;
      setExplainMoreResult({ trigger, provenance: norm, diagramId: diagram });
      if (trigger === "organ_function" && diagram) {
        setActiveDiagramId(diagram);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not generate extra details.");
    } finally {
      setExplainMoreLoading(null);
    }
  }

  const audioNarrationText = useMemo(() => {
    if (!activeProvenance) return "";
    const parts: string[] = [];
    if (activeProvenance.ai_simplified.summary) {
      parts.push(activeProvenance.ai_simplified.summary);
    }
    if (activeProvenance.ai_simplified.steps) {
      parts.push(...activeProvenance.ai_simplified.steps);
    }
    if (activeProvenance.uncertain_or_missing.length > 0) {
      for (const item of activeProvenance.uncertain_or_missing) {
        parts.push(typeof item === "string" ? item : item.reason);
      }
    }
    return parts.join(" ");
  }, [activeProvenance]);

  if (loading && !detail) {
    return (
      <div className="ms-card p-8 text-center font-bold">
        Loading your doctor&apos;s instructions...
      </div>
    );
  }

  if (!loading && list.length === 0 && !detail) {
    return (
      <section className="ms-card p-6 sm:p-8 space-y-4 text-center">
        <h1 className="text-2xl font-extrabold">No shared consultations yet</h1>
        <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
          Once your doctor approves and shares your visit note, it will appear here. You can also upload a report or prescription.
        </p>
        <Link href="/patient/reports" className="ms-btn-primary tap-target inline-flex items-center px-5">
          Upload a Report or Prescription
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Consultation Picker if multiple consultations exist */}
      {list.length > 1 && !initialConsultationId && (
        <div className="ms-card p-4 space-y-2">
          <label htmlFor="consult-picker" className="block text-xs font-extrabold uppercase">
            Choose a shared consultation
          </label>
          <select
            id="consult-picker"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-bold"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          >
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.visit_date ? `(${c.visit_date})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {detail && (
        <>
          {/* Visit Header + One-Tap Language Switch */}
          <section className="ms-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold" style={{ color: "var(--ms-ink-muted)" }}>
                  {detail.visit_date && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      {detail.visit_date}
                    </span>
                  )}
                  {detail.doctor_name && (
                    <span className="inline-flex items-center gap-1">
                      <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                      {detail.doctor_name}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-extrabold sm:text-3xl">{detail.title}</h1>
              </div>

              <Link
                href={`/patient/talk?consultationId=${encodeURIComponent(detail.id)}`}
                className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span>Ask about this visit</span>
              </Link>
            </div>

            {/* One-tap In-Place Language Switch & Depth Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--ms-border)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase">
                  <Languages className="h-4 w-4" aria-hidden="true" />
                  <span>Understand in:</span>
                </span>
                {(
                  [
                    { code: "en", label: "English" },
                    { code: "hi", label: "हिंदी में समझें" },
                    { code: "hi-Latn", label: "Understand in Hinglish" },
                  ] as const
                ).map((opt) => {
                  const active = locale === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      disabled={adapting}
                      onClick={() => void handleLanguageOrDepthSwitch(opt.code)}
                      aria-pressed={active}
                      className="tap-target rounded-xl border-2 px-3.5 py-1.5 text-sm font-extrabold"
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
              </div>

              {/* Adaptive Depth Control */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  Detail:
                </span>
                {DEPTH_OPTIONS.map((d) => {
                  const active = activeDepth === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={adapting}
                      onClick={() => void handleLanguageOrDepthSwitch(locale, d.id)}
                      aria-pressed={active}
                      className="tap-target rounded-lg border-2 px-2.5 py-1 text-xs font-bold"
                      style={{
                        backgroundColor: active ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                        borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                        color: "var(--ms-ink)",
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {adapting && (
              <p className="text-sm font-bold" style={{ color: "var(--ms-primary)" }} aria-live="polite">
                Updating explanation and verifying doses &amp; warnings...
              </p>
            )}
          </section>

          {errorMsg && (
            <p
              role="alert"
              className="rounded-xl border-2 px-4 py-3 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-danger-bg)",
                borderColor: "var(--ms-danger-border)",
                color: "var(--ms-danger-ink)",
              }}
            >
              {errorMsg}
            </p>
          )}

          {/* Deterministic Safety Integrity Status */}
          <IntegrityNotice report={detail.integrity_report} status={detail.integrity_status} />

          {/* Audio Player with Live Sentence Highlighting */}
          {audioNarrationText && (
            <AudioPlayer
              text={audioNarrationText}
              language={locale}
              label="Listen to my doctor's instructions"
            />
          )}

          {/* Tappable Medical Word Hint */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>Tip: Tap any highlighted medical word below to see its simple meaning and picture.</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveTerm("Acute Nasopharyngitis")}
              className="underline font-bold"
              style={{ color: "var(--ms-primary)" }}
            >
              Open Medical Word Lookup
            </button>
          </div>

          {/* 4-Category Provenance Cards */}
          {activeProvenance && (
            <ProvenanceCards
              provenance={activeProvenance}
              originalDoctorInput={detail.original_doctor_input}
              highlightedTerms={detail.highlighted_terms}
              onTermClick={(term) => setActiveTerm(term)}
              onDiagramClick={(diagramId) => setActiveDiagramId(diagramId)}
            />
          )}

          {/* 8-Trigger Progressive "Explain More" Bar */}
          <section className="ms-card p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <div>
                <h2 className="text-xl font-extrabold">Explain More</h2>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  Tap any question below to learn more step-by-step without feeling overwhelmed.
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {EXPLAIN_MORE_BUTTONS.map((btn) => {
                const label =
                  locale === "hi"
                    ? btn.hiLabel
                    : locale === "hi-Latn"
                      ? btn.hinglishLabel
                      : btn.label;
                const isBusy = explainMoreLoading === btn.trigger;
                const isSelected = explainMoreResult?.trigger === btn.trigger;
                return (
                  <button
                    key={btn.trigger}
                    type="button"
                    disabled={Boolean(explainMoreLoading)}
                    onClick={() => void handleExplainMore(btn.trigger)}
                    className="tap-target-lg flex items-center gap-2 rounded-xl border-2 px-3.5 py-3 text-left text-sm font-bold transition-colors"
                    style={{
                      backgroundColor: isSelected ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: isSelected ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      borderColor: isSelected ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{isBusy ? "Preparing..." : label}</span>
                  </button>
                );
              })}
            </div>

            {explainMoreResult && (
              <div className="space-y-4 border-t pt-4" style={{ borderColor: "var(--ms-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-extrabold">
                    {explainMoreResult.trigger === "explain_everything"
                      ? "Complete 3-Part Breakdown"
                      : "Closer Explanation"}
                  </h3>
                </div>

                {explainMoreResult.provenance.ai_simplified.summary && (
                  <AudioPlayer
                    text={explainMoreResult.provenance.ai_simplified.summary}
                    language={locale}
                    label="Listen to this answer"
                    compact
                  />
                )}

                <ProvenanceCards
                  provenance={explainMoreResult.provenance}
                  headingMode={
                    explainMoreResult.trigger === "explain_everything"
                      ? "three_part_explain_everything"
                      : "default"
                  }
                  onTermClick={(term) => setActiveTerm(term)}
                  onDiagramClick={(diagramId) => setActiveDiagramId(diagramId)}
                />
              </div>
            )}
          </section>

          {/* Curated Verified SVG Diagram */}
          {activeDiagramId && (
            <DiagramViewer diagramId={activeDiagramId} language={locale} />
          )}
        </>
      )}

      {/* Medical Terminology Modal */}
      <TermLookupModal
        initialTerm={activeTerm}
        contextSnippet={detail?.original_doctor_input}
        language={locale}
        onClose={() => setActiveTerm(null)}
      />
    </div>
  );
}
