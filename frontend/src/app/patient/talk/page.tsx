"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ExternalLink,
  FlaskConical,
  Globe,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Zap,
} from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { AudioPlayer } from "@/components/AudioPlayer";
import { EmergencyAlert, detectClientEmergencyKeywords } from "@/components/EmergencyAlert";
import { ProvenanceCards } from "@/components/ProvenanceCards";
import { TermLookupModal } from "@/components/TermLookupModal";
import { VisualArtifactViewer } from "@/components/VisualArtifactViewer";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { SUPPORTED_LOCALES, useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  type ChatMessageDTO,
  type ConsultationSummary,
  type EmergencyGuidance,
} from "@/lib/api";

const STARTER_CHIPS = [
  "Kya iska matlab mujhe pneumonia hai?",
  "Can I stop my blood pressure medicine if I feel fine?",
  "Why did the doctor give Paracetamol?",
  "What does Acute Nasopharyngitis mean?",
];

function TalkWorkspace() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("q") || "";
  const initialConsultId = searchParams?.get("consultationId") || "";

  const { locale } = useI18n();
  const { setLanguage } = useAccessibility();

  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [selectedConsultId, setSelectedConsultId] = useState<string>(initialConsultId);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);

  const [inputText, setInputText] = useState(initialQuery);
  const [sending, setSending] = useState(false);
  const [researchMode, setResearchMode] = useState<"normal" | "web_research" | "deep_research">("normal");
  const [requestVisual, setRequestVisual] = useState<boolean>(true);
  const [emergencyState, setEmergencyState] = useState<EmergencyGuidance | null>(null);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [consultList, history] = await Promise.all([
          api.listConsultations().catch(() => [] as ConsultationSummary[]),
          api.getChatHistory().catch(() => ({ conversation_id: null, messages: [] as ChatMessageDTO[] })),
        ]);
        if (!active) return;
        setConsultations(consultList);
        if (!initialConsultId && consultList.length > 0) {
          setSelectedConsultId(consultList[0].id);
        }
        if (history.conversation_id) {
          setConversationId(history.conversation_id);
        }
        if (history.messages && history.messages.length > 0) {
          setMessages(history.messages);
        }
      } catch {
        // Non-fatal
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, [initialConsultId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function submitQuestion(
    questionText: string,
    opts?: {
      modality?: "text" | "voice";
      audioId?: string | null;
      sttConfirmed?: boolean;
      depthOverride?: "very_simple" | "simple";
    }
  ) {
    const trimmed = questionText.trim();
    if (!trimmed) return;

    if (detectClientEmergencyKeywords(trimmed)) {
      setEmergencyState({
        is_emergency: true,
        banner_message:
          "Urgent symptoms detected. Please call emergency services (112 or 108) or go to the nearest hospital emergency department immediately.",
      });
    }

    setSending(true);
    setErrorMsg(null);
    if (!opts?.depthOverride) {
      setInputText("");
    }

    const optimisticUser: ChatMessageDTO = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId || "pending",
      sender_role: "patient",
      input_modality: opts?.modality ?? "text",
      message_text: trimmed,
      language: locale,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await api.sendChat({
        conversation_id: conversationId,
        message_text: trimmed,
        input_modality: opts?.modality ?? "text",
        source_audio_id: opts?.audioId ?? undefined,
        stt_confirmed: opts?.sttConfirmed ?? true,
        context_consultation_id: selectedConsultId || undefined,
        target_language: locale,
        depth_override: opts?.depthOverride,
        research_mode: researchMode,
        generate_visual: requestVisual,
      });

      setConversationId(res.conversation_id);
      if (
        res.assistant_message.emergency_flag_triggered ||
        res.assistant_message.emergency_guidance?.is_emergency
      ) {
        setEmergencyState(
          res.assistant_message.emergency_guidance ?? {
            is_emergency: true,
            banner_message:
              "Urgent medical symptoms mentioned. Call 112 / 108 or visit the nearest emergency room right away.",
          }
        );
      }
      setMessages((prev) => [...prev, res.assistant_message]);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not send message right now.");
    } finally {
      setSending(false);
    }
  }

  function handleLanguageSwitch(next: SupportedLocale) {
    setLanguage(next);
    void api.updatePreferences({ preferred_language: next }).catch(() => {});
  }

  return (
    <div className="space-y-5">
      {/* Context & Language Bar (Preserves active thread!) */}
      <section className="ms-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">Talk to MedSarthi</h1>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Ask follow-up questions grounded in your doctor&apos;s instructions—never diagnoses or changes doses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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
                  onClick={() => handleLanguageSwitch(opt.code)}
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
              value={locale}
              onChange={(e) => handleLanguageSwitch(e.target.value as SupportedLocale)}
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

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Stethoscope className="h-4 w-4 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <label htmlFor="chat-context-select" className="text-xs font-extrabold uppercase">
            Asking about:
          </label>
          <select
            id="chat-context-select"
            value={selectedConsultId}
            onChange={(e) => setSelectedConsultId(e.target.value)}
            className="tap-target flex-1 rounded-xl border-2 px-3 py-1.5 text-sm font-bold"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          >
            <option value="">General Health Word / Question</option>
            {consultations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.visit_date ? `(${c.visit_date})` : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Emergency Red-Flag Alert */}
      {emergencyState && (
        <EmergencyAlert
          guidance={emergencyState}
          onDismiss={() => setEmergencyState(null)}
        />
      )}

      {/* Quick Starter Chips (Including Judge Demo Step 7 Question) */}
      <section className="space-y-2">
        <p className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
          Quick Questions You Can Tap:
        </p>
        <div className="flex flex-wrap gap-2">
          {STARTER_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={sending}
              onClick={() => void submitQuestion(chip)}
              className="tap-target rounded-xl border-2 px-3.5 py-2 text-left text-xs font-bold hover:opacity-90"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-primary)",
                color: "var(--ms-ink)",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </section>

      {/* Conversation Feed */}
      <section className="ms-card p-4 sm:p-5 space-y-4 min-h-[260px]" aria-live="polite">
        {messages.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-base font-bold">Ask a question using the big microphone or typing below.</p>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Supports English, हिन्दी, and Hinglish (e.g., &ldquo;Kya iska matlab mujhe pneumonia hai?&rdquo;).
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isPatient = msg.sender_role === "patient";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isPatient ? "items-end" : "items-start"} space-y-2`}
              >
                {isPatient ? (
                  <div
                    className="max-w-xl rounded-2xl border-2 px-4 py-3 text-base font-bold"
                    style={{
                      backgroundColor: "var(--ms-primary)",
                      borderColor: "var(--ms-primary)",
                      color: "var(--ms-primary-ink)",
                    }}
                  >
                    {msg.input_modality === "voice" && (
                      <span className="mb-1 block text-[11px] font-extrabold uppercase opacity-80">
                        Voice Question
                      </span>
                    )}
                    <p>{msg.message_text}</p>
                  </div>
                ) : (
                  <div
                    className="w-full space-y-3 rounded-2xl border-2 p-4"
                    style={{
                      borderColor: "var(--ms-border)",
                      backgroundColor: "var(--ms-surface-alt)",
                    }}
                  >
                    {msg.provenance_blocks ? (
                      <ProvenanceCards
                        provenance={msg.provenance_blocks}
                        onTermClick={(term) => setActiveTerm(term)}
                        compact
                      />
                    ) : (
                      <p className="text-base font-medium leading-relaxed">{msg.message_text}</p>
                    )}

                    {/* AI-Generated Visual Explanation */}
                    {msg.visual_artifact && (
                      <div className="pt-2">
                        <VisualArtifactViewer visual={msg.visual_artifact} />
                      </div>
                    )}

                    {/* Trusted Citations & Web Research Evidence */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/20 p-3 space-y-2 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-teal-900 dark:text-teal-200">
                          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Verified Citations &amp; Trusted Sources</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((c, cIdx) => (
                            <a
                              key={cIdx}
                              href={c.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-neutral-900 text-teal-950 dark:text-teal-100 hover:border-teal-400 dark:hover:border-teal-600 transition-colors shadow-xs"
                            >
                              <span className="font-semibold">{c.source_name}</span>
                              <ExternalLink className="h-3 w-3 text-neutral-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Deep Research Subtopics */}
                    {msg.research_meta?.subtopics && msg.research_meta.subtopics.length > 0 && (
                      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 p-2.5 text-xs space-y-1">
                        <span className="font-bold text-neutral-600 dark:text-neutral-400">
                          Explored Subtopics:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.research_meta.subtopics.map((st, stIdx) => (
                            <span
                              key={stIdx}
                              className="px-2 py-0.5 rounded-md bg-neutral-200/60 dark:bg-neutral-800 text-[11px] font-medium"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() =>
                          void submitQuestion(
                            `Please explain your last answer even more simply: ${msg.message_text.slice(0, 120)}`,
                            { depthOverride: "very_simple" }
                          )
                        }
                        className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Explain simpler</span>
                      </button>
                    </div>

                    <AudioPlayer
                      text={
                        msg.provenance_blocks?.ai_simplified?.summary || msg.message_text
                      }
                      language={locale}
                      messageId={msg.id}
                      label="Listen"
                      compact
                      showTranscriptLines={false}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
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

      {/* Voice + Text Input Bar */}
      <section className="ms-card p-5 space-y-4">
        {/* Research & Visual Intelligence Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border-2 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase text-teal-900 dark:text-teal-200">Mode:</span>
            <div className="inline-flex rounded-xl p-1 bg-neutral-200/70 dark:bg-neutral-800 gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setResearchMode("normal")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  researchMode === "normal"
                    ? "bg-white dark:bg-neutral-900 text-teal-700 dark:text-teal-300 shadow-sm font-bold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Normal</span>
              </button>
              <button
                type="button"
                onClick={() => setResearchMode("web_research")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  researchMode === "web_research"
                    ? "bg-white dark:bg-neutral-900 text-teal-700 dark:text-teal-300 shadow-sm font-bold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Web Research</span>
              </button>
              <button
                type="button"
                onClick={() => setResearchMode("deep_research")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  researchMode === "deep_research"
                    ? "bg-white dark:bg-neutral-900 text-teal-700 dark:text-teal-300 shadow-sm font-bold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                <span>Deep Research</span>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-neutral-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requestVisual}
              onChange={(e) => setRequestVisual(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4"
            />
            <ImageIcon className="h-4 w-4 text-teal-600" />
            <span>AI Visual Diagrams</span>
          </label>
        </div>

        <VoiceInputButton
          language={locale}
          disabled={sending}
          onConfirmedTranscript={(confirmed, meta) => {
            void submitQuestion(confirmed, {
              modality: "voice",
              audioId: meta.audioId,
              sttConfirmed: meta.wasConfirmed,
            });
          }}
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuestion(inputText, { modality: "text" });
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="chat-input" className="sr-only">
            Type your health question
          </label>
          <input
            id="chat-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your question in English, हिन्दी, or Hinglish..."
            className="tap-target-lg flex-1 rounded-2xl border-2 px-4 py-3 text-base"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          />
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="ms-btn-primary tap-target-lg inline-flex items-center justify-center gap-2 px-6 disabled:opacity-50"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
            <span>{sending ? "Checking..." : "Ask MedSarthi"}</span>
          </button>
        </form>
      </section>

      <TermLookupModal
        initialTerm={activeTerm}
        language={locale}
        onClose={() => setActiveTerm(null)}
      />
    </div>
  );
}

export default function PatientTalkPage() {
  return (
    <PatientGate>
      <Suspense fallback={<div className="ms-card p-8 text-center font-bold">Loading chat...</div>}>
        <TalkWorkspace />
      </Suspense>
    </PatientGate>
  );
}
