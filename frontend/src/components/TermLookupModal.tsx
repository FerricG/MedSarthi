"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Search, Volume2, X } from "lucide-react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DiagramViewer } from "@/components/DiagramViewer";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import { api, type KBTermResult } from "@/lib/api";

export interface TermLookupModalProps {
  initialTerm: string | null;
  contextSnippet?: string;
  language?: SupportedLocale;
  onClose: () => void;
}

export function TermLookupModal({
  initialTerm,
  contextSnippet,
  language,
  onClose,
}: TermLookupModalProps) {
  const { locale, t } = useI18n();
  const activeLang = language ?? locale;

  const [query, setQuery] = useState(initialTerm ?? "");
  const [termData, setTermData] = useState<KBTermResult | null>(null);
  const [fallbackSummary, setFallbackSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTerm) return;
    setQuery(initialTerm);
    void lookupTerm(initialTerm, activeLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTerm, activeLang]);

  useEffect(() => {
    if (!initialTerm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [initialTerm, onClose]);

  async function lookupTerm(term: string, lang: SupportedLocale) {
    const trimmed = term.trim();
    if (!trimmed) return;
    setLoading(true);
    setErrorMsg(null);
    setFallbackSummary(null);
    try {
      const matches = await api.searchTerms(trimmed, lang, 3);
      if (matches && matches.length > 0) {
        const best = matches[0];
        try {
          const full = await api.getTerm(best.slug, lang);
          setTermData(full);
          return;
        } catch {
          setTermData(best);
          return;
        }
      }
      const explained = await api.explainTerm({
        term: trimmed,
        context_snippet: contextSnippet,
        target_language: lang,
      });
      if (explained.kb_entry) {
        setTermData(explained.kb_entry);
      } else if (explained.term_card) {
        const tc = explained.term_card;
        const firstSrc = tc.verified_source?.[0];
        setTermData({
          canonical_name: tc.term,
          slug: tc.term.toLowerCase().replace(/\s+/g, "-"),
          entry_type: "term",
          aliases: [],
          body_system: tc.body_part_or_system ?? null,
          pronunciation: tc.pronunciation ?? null,
          simple_en: tc.selected_language_explanation || tc.simple_definition,
          detailed_en: tc.detailed_explanation ?? null,
          hinglish_explanation: tc.hinglish_explanation,
          usage_example: tc.usage_example ?? null,
          related_slugs: tc.related_terms ?? [],
          curated_diagram_key: explained.visual_diagrams?.[0]?.id ?? null,
          source_name: firstSrc?.source_name ?? "",
          source_url: firstSrc?.source_url ?? "",
        });
      } else {
        setTermData(null);
        setFallbackSummary(
          explained.provenance?.ai_simplified?.summary ||
            "Ask your doctor or pharmacist for details on this specific word."
        );
      }
    } catch {
      setErrorMsg("Could not look up this word right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!initialTerm) return null;

  const langEntry = termData?.translations?.[activeLang];
  const hinglishEntry = termData?.translations?.["hi-Latn"];
  const title = langEntry?.name || termData?.localized_name || termData?.canonical_name || query;
  const simpleText =
    langEntry?.simple || termData?.localized_simple || termData?.simple_en || fallbackSummary || "";
  const detailedText =
    langEntry?.detailed || termData?.localized_detailed || termData?.detailed_en || "";
  const diagramKey =
    termData?.curated_diagram_key ||
    (termData?.metadata_json?.curated_diagram_key as string | undefined) ||
    null;
  const usageExample =
    termData?.usage_example ||
    (termData?.metadata_json?.usage_example as string | undefined) ||
    null;
  const whenToAsk =
    termData?.when_to_ask_doctor ||
    (termData?.metadata_json?.when_to_ask_doctor as string | undefined) ||
    null;
  const relatedSlugs =
    termData?.related_slugs ||
    (termData?.metadata_json?.related_slugs as string[] | undefined) ||
    [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="term-modal-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 p-5 shadow-xl space-y-4"
        style={{
          backgroundColor: "var(--ms-surface)",
          borderColor: "var(--ms-border)",
          color: "var(--ms-ink)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-6 w-6 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <div>
              <h2 id="term-modal-title" className="text-xl font-extrabold">
                {title}
              </h2>
              {termData?.pronunciation && (
                <p className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                  Pronounced: {termData.pronunciation}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close medical word explanation"
            className="tap-target flex items-center justify-center rounded-xl border-2 px-3"
            style={{ borderColor: "var(--ms-border)" }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search another word directly inside modal */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookupTerm(query, activeLang);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search another medical word..."
            className="tap-target flex-1 rounded-xl border-2 px-3.5 py-2 text-sm"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          />
          <button type="submit" className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-4 text-sm">
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Look up</span>
          </button>
        </form>

        {loading ? (
          <div className="rounded-xl border p-6 text-center text-sm font-semibold">
            Looking up trusted medical explanation...
          </div>
        ) : errorMsg ? (
          <div
            role="alert"
            className="rounded-xl border-2 p-4 text-sm font-semibold"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            {errorMsg}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Simple Everyday Meaning */}
            {simpleText && (
              <div
                className="rounded-xl border-2 p-4 space-y-2"
                style={{
                  backgroundColor: "var(--ms-prov-ai-bg)",
                  borderColor: "var(--ms-prov-ai-border)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide">
                    Simple Everyday Meaning
                  </span>
                  {termData?.body_system && (
                    <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize">
                      Body system: {termData.body_system}
                    </span>
                  )}
                </div>
                <p className="text-base font-medium leading-relaxed">{simpleText}</p>
              </div>
            )}

            {/* Hinglish Explanation when helpful */}
            {activeLang !== "hi-Latn" &&
              (hinglishEntry?.simple || termData?.hinglish_explanation) && (
                <div
                  className="rounded-xl border p-3.5 text-sm space-y-1"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <span className="text-xs font-extrabold uppercase">In Hinglish:</span>
                  <p className="font-medium">
                    {hinglishEntry?.simple || termData?.hinglish_explanation}
                  </p>
                </div>
              )}

            {/* Audio Listen */}
            {simpleText && (
              <AudioPlayer
                text={`${title}. ${simpleText}`}
                language={activeLang}
                label={t.audio.listen}
                compact
                showTranscriptLines={false}
              />
            )}

            {/* Detailed Explanation Toggle */}
            {detailedText && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowDetailed((v) => !v)}
                  className="ms-btn-secondary tap-target px-4 text-sm"
                >
                  {showDetailed ? "Hide deeper details" : "Show more medical detail"}
                </button>
                {showDetailed && (
                  <p
                    className="rounded-xl border p-4 text-sm leading-relaxed"
                    style={{
                      backgroundColor: "var(--ms-surface-alt)",
                      borderColor: "var(--ms-border)",
                    }}
                  >
                    {detailedText}
                  </p>
                )}
              </div>
            )}

            {/* Usage Example */}
            {usageExample && (
              <div
                className="rounded-xl border p-3.5 text-sm space-y-1"
                style={{ borderColor: "var(--ms-border)" }}
              >
                <span className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  Example in a Doctor&apos;s Note
                </span>
                <p className="italic font-medium">{usageExample}</p>
              </div>
            )}

            {/* When to Ask Doctor */}
            {whenToAsk && (
              <div
                className="rounded-xl border-2 p-3.5 text-sm space-y-1"
                style={{
                  backgroundColor: "var(--ms-prov-uncertain-bg)",
                  borderColor: "var(--ms-prov-uncertain-border)",
                }}
              >
                <span className="text-xs font-extrabold uppercase">When to Ask Your Doctor</span>
                <p className="font-medium">{whenToAsk}</p>
              </div>
            )}

            {/* Related Curated SVG Diagram */}
            {diagramKey && <DiagramViewer diagramId={diagramKey} language={activeLang} compact />}

            {/* Related Terms */}
            {relatedSlugs.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  Related Medical Words
                </span>
                <div className="flex flex-wrap gap-2">
                  {relatedSlugs.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => {
                        const readable = slug.replace(/-/g, " ");
                        setQuery(readable);
                        void lookupTerm(readable, activeLang);
                      }}
                      className="tap-target rounded-xl border-2 px-3 py-1.5 text-xs font-bold capitalize"
                      style={{
                        backgroundColor: "var(--ms-surface-alt)",
                        borderColor: "var(--ms-border)",
                      }}
                    >
                      {slug.replace(/-/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Verified Source Attribution */}
            {termData?.source_name && termData?.source_url && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                <a
                  href={termData.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-target inline-flex items-center gap-1.5 font-bold underline"
                >
                  <Volume2 className="hidden" aria-hidden="true" />
                  <span>
                    {t.provenance.infoSource}: {termData.source_name}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                {termData.last_reviewed_at && (
                  <span style={{ color: "var(--ms-ink-muted)" }}>
                    Reviewed: {new Date(termData.last_reviewed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
