"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Calendar, FileText, History, MessageCircle, Search, Stethoscope } from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { SearchingIndicator } from "@/components/SearchingIndicator";
import { TermLookupModal } from "@/components/TermLookupModal";
import { useI18n } from "@/i18n/I18nProvider";
import {
  api,
  type ConsultationSummary,
  type ConversationSummaryDTO,
  type KBTermResult,
  type MedicalDocumentDTO,
} from "@/lib/api";

function HistoryWorkspace() {
  const { locale } = useI18n();

  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [documents, setDocuments] = useState<MedicalDocumentDTO[]>([]);
  const [conversations, setConversations] = useState<ConversationSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [termQuery, setTermQuery] = useState("");
  const [termResults, setTermResults] = useState<KBTermResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoading(true);
      const [c, d, conv] = await Promise.all([
        api.listConsultations().catch(() => [] as ConsultationSummary[]),
        api.listDocuments().catch(() => [] as MedicalDocumentDTO[]),
        api.listConversations().catch(() => [] as ConversationSummaryDTO[]),
      ]);
      if (!active) return;
      setConsultations(c);
      setDocuments(d);
      setConversations(conv);
      setLoading(false);
    }
    void loadAll();
    return () => {
      active = false;
    };
  }, []);

  async function handleTermSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!termQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchTerms(termQuery.trim(), locale, 8);
      setTermResults(res);
    } catch {
      setTermResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-extrabold sm:text-3xl flex items-center gap-2.5">
            <History className="h-7 w-7" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <span>My previous consultations &amp; word lookup</span>
          </h1>
          <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
            Review past doctor visits, uploaded reports, questions you asked, and look up medical words anytime.
          </p>
        </header>

        {/* Medical Word Lookup */}
        <section className="ms-card p-5 space-y-3">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <BookOpen className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <span>Look up any medical word</span>
          </h2>
          <form onSubmit={(e) => void handleTermSearch(e)} className="flex flex-wrap gap-2">
            <label htmlFor="history-term-search" className="sr-only">
              Search medical word
            </label>
            <input
              id="history-term-search"
              type="search"
              value={termQuery}
              onChange={(e) => setTermQuery(e.target.value)}
              placeholder="Type a word (e.g., Hypertension, HbA1c, Creatinine, Pneumonia)..."
              className="tap-target flex-1 rounded-xl border-2 px-4 py-2.5 text-sm"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
            <button
              type="submit"
              disabled={searching || !termQuery.trim()}
              className="ms-btn-primary tap-target inline-flex items-center justify-center gap-2 px-4 text-sm min-w-[140px]"
            >
              {searching ? (
                <SearchingIndicator label="Searching" compact />
              ) : (
                <>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span>Search Word</span>
                </>
              )}
            </button>
          </form>

          {termResults.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {termResults.map((term) => (
                <button
                  key={term.slug}
                  type="button"
                  onClick={() => setActiveTerm(term.canonical_name)}
                  className="tap-target rounded-xl border-2 px-3.5 py-2 text-sm font-bold"
                  style={{
                    backgroundColor: "var(--ms-primary-soft)",
                    borderColor: "var(--ms-primary)",
                  }}
                >
                  {term.canonical_name}
                </button>
              ))}
            </div>
          )}
        </section>

        {loading ? (
          <div className="ms-card p-8 text-center font-bold">Loading your history...</div>
        ) : (
          <div className="space-y-6">
            {/* Shared Consultations */}
            <section className="space-y-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <Stethoscope className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <span>Doctor Visits ({consultations.length})</span>
              </h2>
              {consultations.length === 0 ? (
                <div className="ms-card p-5 text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                  No previous consultations shared yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {consultations.map((c) => (
                    <Link
                      key={c.id}
                      href={`/patient/instructions/${c.id}`}
                      className="ms-card tap-target-lg flex items-center justify-between gap-3 p-4 hover:opacity-90"
                    >
                      <div className="space-y-1">
                        <span className="block text-base font-extrabold">{c.title}</span>
                        <span className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{c.visit_date || new Date(c.created_at).toLocaleDateString()}</span>
                          {c.doctor_name && <span>• {c.doctor_name}</span>}
                        </span>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Uploaded Reports */}
            <section className="space-y-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <FileText className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <span>Reports &amp; Prescriptions ({documents.length})</span>
              </h2>
              {documents.length === 0 ? (
                <div className="ms-card p-5 text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                  No uploaded reports yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {documents.map((doc) => (
                    <Link
                      key={doc.id}
                      href="/patient/reports"
                      className="ms-card tap-target-lg flex items-center justify-between gap-3 p-4 hover:opacity-90"
                    >
                      <div className="space-y-1">
                        <span className="block text-base font-extrabold break-all">{doc.original_filename}</span>
                        <span className="block text-xs font-semibold capitalize" style={{ color: "var(--ms-ink-muted)" }}>
                          {doc.document_type.replace("_", " ")} • {doc.verification_status.replace("_", " ")}
                        </span>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Past Q&A Threads */}
            <section className="space-y-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <MessageCircle className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <span>Saved Conversations ({conversations.length})</span>
              </h2>
              {conversations.length === 0 ? (
                <div className="ms-card p-5 text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                  No past questions yet. Visit &ldquo;Talk to MedSarthi&rdquo; anytime.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {conversations.map((conv) => (
                    <Link
                      key={conv.id}
                      href="/patient/talk"
                      className="ms-card tap-target-lg flex items-center justify-between gap-3 p-4 hover:opacity-90"
                    >
                      <div className="space-y-1">
                        <span className="block text-base font-extrabold">{conv.title}</span>
                        <span className="block text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                          Updated {new Date(conv.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <TermLookupModal
          initialTerm={activeTerm}
          language={locale}
          onClose={() => setActiveTerm(null)}
        />
      </div>
  );
}

export default function PatientHistoryPage() {
  return (
    <PatientGate>
      <HistoryWorkspace />
    </PatientGate>
  );
}
