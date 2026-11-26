"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Globe,
  Languages,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { IntegrityNotice } from "@/components/IntegrityNotice";
import { ProvenanceCards } from "@/components/ProvenanceCards";
import {
  DEPTH_OPTIONS,
  INTEGRITY_RULE_CATALOG,
  LANGUAGE_OPTIONS,
  formatLanguageLabel,
  getApprovalBadgeStyle,
  getIntegrityBadgeStyle,
  normalizeConsultationDetail,
} from "@/components/doctor/doctorHelpers";
import {
  api,
  ApiError,
  normalizeIntegrityReport,
  normalizeProvenance,
  type ConsultationDetail,
  type ExplanationDepth,
  type SupportedLanguage,
} from "@/lib/api";

export interface SideBySideReviewProps {
  consultation: ConsultationDetail;
  patientPreferredLanguage?: SupportedLanguage;
  onUpdated: (updated: ConsultationDetail) => void;
}

export function SideBySideReview({
  consultation,
  patientPreferredLanguage,
  onUpdated,
}: SideBySideReviewProps) {
  const initialLang = (
    (consultation.explanation_language as SupportedLanguage) ||
    patientPreferredLanguage ||
    "en"
  ) as SupportedLanguage;
  const initialDepth = (
    (consultation.explanation_depth as ExplanationDepth) || "simple"
  ) as ExplanationDepth;

  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(initialLang);
  const [targetDepth, setTargetDepth] = useState<ExplanationDepth>(initialDepth);
  const [reviewNote, setReviewNote] = useState("");

  const [isEditingOutput, setIsEditingOutput] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [amendmentReason, setAmendmentReason] = useState("");

  const [busyAction, setBusyAction] = useState<
    "idle" | "generating" | "saving_edit" | "approving" | "sharing"
  >("idle");
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setTargetLanguage(
      ((consultation.explanation_language as SupportedLanguage) ||
        patientPreferredLanguage ||
        "en") as SupportedLanguage
    );
    setTargetDepth(((consultation.explanation_depth as ExplanationDepth) || "simple") as ExplanationDepth);
  }, [
    consultation.id,
    consultation.explanation_language,
    consultation.explanation_depth,
    patientPreferredLanguage,
  ]);

  const normalizedExplanation = consultation.generated_explanation
    ? normalizeProvenance(consultation.generated_explanation)
    : null;
  const hasExplanation = Boolean(
    normalizedExplanation &&
      (normalizedExplanation.ai_simplified.summary?.trim() ||
        (normalizedExplanation.ai_simplified.steps?.length ?? 0) > 0 ||
        normalizedExplanation.doctor_provided.length > 0)
  );

  const normalizedIntegrity = normalizeIntegrityReport(
    consultation.integrity_report,
    consultation.integrity_status
  );
  const effectiveIntegrityStatus = normalizedIntegrity.status;
  const isBlocked = effectiveIntegrityStatus === "blocked";
  const isApproved = consultation.approval_status === "approved";
  const isShared = consultation.sharing_status === "shared_with_patient";

  function openInlineEditor() {
    const ai = normalizedExplanation?.ai_simplified;
    setEditSummary(ai?.summary ?? "");
    setEditSteps(ai?.steps ? [...ai.steps] : []);
    setAmendmentReason("");
    setIsEditingOutput(true);
    setFeedbackMsg(null);
    setErrorMsg(null);
  }

  async function runGenerate(lang: SupportedLanguage, depth: ExplanationDepth) {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusyAction("generating");
    try {
      const raw = await api.generateDoctorExplanation(consultation.id, {
        target_language: lang,
        explanation_depth: depth,
        include_visuals: true,
      });
      const next = normalizeConsultationDetail(raw, {
        ...consultation,
        explanation_language: lang,
        explanation_depth: depth,
        original_input_locked_at:
          consultation.original_input_locked_at || new Date().toISOString(),
      });
      onUpdated(next);
      setIsEditingOutput(false);
      setFeedbackMsg(
        `Generated ${formatLanguageLabel(lang)} explanation (${depth.replace("_", " ")}) and ran 13-rule Safety Integrity Checker.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Failed to generate patient explanation."
      );
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleSaveInlineEdit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusyAction("saving_edit");
    try {
      const cleanedSteps = editSteps.map((s) => s.trim()).filter(Boolean);
      const raw = await api.updateDoctorConsultation(consultation.id, {
        edited_explanation: {
          ai_simplified: {
            summary: editSummary.trim(),
            steps: cleanedSteps,
            language: targetLanguage,
            reading_level: targetDepth,
          },
        },
        amendment_reason: amendmentReason.trim() || "Doctor inline clarification edit",
      });
      const next = normalizeConsultationDetail(raw, consultation);
      onUpdated(next);
      setIsEditingOutput(false);
      setFeedbackMsg(
        "Saved edited explanation and immediately re-ran the deterministic Integrity Checker."
      );
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to save edited output.");
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleApprove() {
    if (isBlocked || !hasExplanation) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusyAction("approving");
    try {
      const raw = await api.approveDoctorConsultation(
        consultation.id,
        reviewNote.trim() || undefined
      );
      const next = normalizeConsultationDetail(raw, {
        ...consultation,
        approval_status: "approved",
      });
      onUpdated(next);
      setFeedbackMsg(
        "Consultation explanation approved by clinician. You may now click Share with Patient."
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Unable to approve consultation. Verify integrity checks pass first."
      );
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleShare(target: "shared_with_patient" | "revoked") {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusyAction("sharing");
    try {
      const raw = await api.shareDoctorConsultation(consultation.id, target);
      const next = normalizeConsultationDetail(raw, {
        ...consultation,
        sharing_status: target,
      });
      onUpdated(next);
      setFeedbackMsg(
        target === "shared_with_patient"
          ? "Shared with Patient! Immediately visible in Patient's \"Understand my doctor's instructions\"."
          : "Sharing revoked — hidden from Patient view."
      );
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to update sharing status.");
    } finally {
      setBusyAction("idle");
    }
  }

  async function handleQuickLanguageSwitch(nextLang: SupportedLanguage) {
    setTargetLanguage(nextLang);
    if (hasExplanation) {
      await runGenerate(nextLang, targetDepth);
    }
  }

  const approvalStyle = getApprovalBadgeStyle(consultation.approval_status);
  const integrityStyle = getIntegrityBadgeStyle(effectiveIntegrityStatus);
  const sd = consultation.structured_data || {};
  const meds = Array.isArray(sd.medications) ? sd.medications : [];
  const diagnoses = Array.isArray(sd.diagnoses) ? sd.diagnoses : [];
  const symptoms = Array.isArray(sd.symptoms) ? sd.symptoms : [];
  const observations = Array.isArray(sd.observations) ? sd.observations : [];
  const allergies = Array.isArray(sd.allergies) ? sd.allergies : [];
  const testsAdvised = Array.isArray(sd.tests_advised) ? sd.tests_advised : [];
  const vitalsEntries =
    sd.vitals && typeof sd.vitals === "object" ? Object.entries(sd.vitals) : [];

  return (
    <div className="space-y-5">
      {/* Generation & Delivery Configuration Bar */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold">
              Generate, Safety-Check, Approve &amp; Share
            </h2>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Target defaults to the patient&apos;s preference (
              {formatLanguageLabel(patientPreferredLanguage ?? targetLanguage)}). Every generation
              locks the original note and runs all 13 deterministic safety integrity checks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-3 py-1 text-xs font-extrabold"
              style={{
                backgroundColor: approvalStyle.bg,
                borderColor: approvalStyle.border,
                color: approvalStyle.ink,
              }}
            >
              {approvalStyle.label}
            </span>
            <span
              className="rounded-full border px-3 py-1 text-xs font-extrabold"
              style={{
                backgroundColor: integrityStyle.bg,
                borderColor: integrityStyle.border,
                color: integrityStyle.ink,
              }}
            >
              {integrityStyle.label}
            </span>
            <span
              className="rounded-full border px-3 py-1 text-xs font-extrabold"
              style={{
                backgroundColor: isShared ? "var(--ms-prov-doctor-bg)" : "var(--ms-surface-alt)",
                borderColor: isShared ? "var(--ms-prov-doctor-border)" : "var(--ms-border)",
              }}
            >
              {isShared ? "Shared with Patient" : "Private Draft"}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          <div>
            <label htmlFor="review-target-lang" className="mb-1.5 block text-xs font-extrabold uppercase">
              Target Patient Language
            </label>
            <div className="relative">
              <select
                id="review-target-lang"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value as SupportedLanguage)}
                className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.native})
                    {patientPreferredLanguage === opt.value ? " — Patient Default" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="review-target-depth" className="mb-1.5 block text-xs font-extrabold uppercase">
              Explanation Depth
            </label>
            <select
              id="review-target-depth"
              value={targetDepth}
              onChange={(e) => setTargetDepth(e.target.value as ExplanationDepth)}
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              {DEPTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.hint}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              disabled={busyAction !== "idle"}
              onClick={() => void runGenerate(targetLanguage, targetDepth)}
              className="ms-btn-primary tap-target flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm"
            >
              {busyAction === "generating" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {busyAction === "generating"
                  ? "Generating & Checking..."
                  : hasExplanation
                    ? "Regenerate Simple Explanation"
                    : "Generate Simple Explanation"}
              </span>
            </button>
          </div>
        </div>
      </section>

      {feedbackMsg && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-prov-doctor-bg)",
            borderColor: "var(--ms-prov-doctor-border)",
          }}
        >
          {feedbackMsg}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-danger-bg)",
            borderColor: "var(--ms-danger-border)",
            color: "var(--ms-danger-ink)",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Side-by-Side Comparison Workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (5 cols): Immutable Original Doctor Input + Structured Meds */}
        <section
          aria-label="Immutable Original Doctor Input"
          className="ms-card space-y-4 p-4 sm:p-5 lg:col-span-5"
          style={{
            backgroundColor: "var(--ms-prov-doctor-bg)",
            borderColor: "var(--ms-prov-doctor-border)",
            borderLeftWidth: "8px",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-extrabold">Immutable Original Doctor Input</h3>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-prov-doctor-border)",
              }}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{consultation.original_input_locked_at ? "Locked Source" : "Source Record"}</span>
            </span>
          </div>

          {consultation.original_input_hash && (
            <div
              className="rounded-lg border px-3 py-1.5 text-xs font-mono"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink-muted)",
              }}
              title={consultation.original_input_hash}
            >
              SHA-256: {consultation.original_input_hash.slice(0, 20)}…
              {consultation.original_input_locked_at &&
                ` • Locked ${new Date(consultation.original_input_locked_at).toLocaleString()}`}
            </div>
          )}

          <div
            className="rounded-xl border-2 p-3.5 text-sm leading-relaxed whitespace-pre-wrap font-medium"
            style={{
              backgroundColor: "var(--ms-surface)",
              borderColor: "var(--ms-border)",
            }}
          >
            {consultation.original_doctor_input}
          </div>

          {/* Structured Clinical Summary */}
          <div className="space-y-3 pt-1 text-xs">
            {vitalsEntries.length > 0 && (
              <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
                <span className="block font-extrabold uppercase mb-1">Recorded Vitals</span>
                <div className="flex flex-wrap gap-2">
                  {vitalsEntries.map(([k, v]) => (
                    <span key={k} className="rounded-md border px-2 py-0.5 font-bold" style={{ borderColor: "var(--ms-border)" }}>
                      {k.replace(/_/g, " ")}: {v}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {diagnoses.length > 0 && (
              <div className="rounded-xl border p-3" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
                <span className="block font-extrabold uppercase mb-1">Diagnoses</span>
                <p className="font-semibold">{diagnoses.join(" • ")}</p>
              </div>
            )}

            {(symptoms.length > 0 || observations.length > 0) && (
              <div className="rounded-xl border p-3 space-y-1.5" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
                {symptoms.length > 0 && (
                  <p>
                    <strong>Symptoms:</strong> {symptoms.join(", ")}
                  </p>
                )}
                {observations.length > 0 && (
                  <p>
                    <strong>Observations:</strong> {observations.join("; ")}
                  </p>
                )}
              </div>
            )}

            {meds.length > 0 && (
              <div className="rounded-xl border p-3 space-y-2" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
                <span className="block font-extrabold uppercase">
                  Structured Medications &amp; Warnings
                </span>
                <ul className="space-y-2">
                  {meds.map((m, idx) => {
                    const medName = m.name || m.medicine_name || "Medication";
                    const dose =
                      m.dose || [m.dosage_value, m.dosage_unit].filter(Boolean).join(" ");
                    const freq = m.frequency || m.frequency_text || "";
                    const dur = m.duration || m.duration_text || "";
                    const warns = m.warnings || m.negations_and_warnings || [];
                    return (
                      <li
                        key={idx}
                        className="rounded-lg border p-2.5 space-y-1"
                        style={{
                          backgroundColor: "var(--ms-surface-alt)",
                          borderColor: "var(--ms-border)",
                        }}
                      >
                        <p className="font-extrabold text-sm">
                          {medName} {dose ? `— ${dose}` : ""}
                        </p>
                        <p className="font-medium">
                          {[freq, dur, m.route, m.timing_with_food].filter(Boolean).join(" • ")}
                        </p>
                        {warns.length > 0 && (
                          <p
                            className="font-bold"
                            style={{ color: "var(--ms-danger-ink)" }}
                          >
                            Warning: {warns.join("; ")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(allergies.length > 0 || testsAdvised.length > 0 || sd.follow_up || sd.follow_up_date) && (
              <div className="rounded-xl border p-3 space-y-1.5" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
                {allergies.length > 0 && (
                  <p style={{ color: "var(--ms-danger-ink)" }}>
                    <strong>Allergies:</strong> {allergies.join(", ")}
                  </p>
                )}
                {testsAdvised.length > 0 && (
                  <p>
                    <strong>Tests Advised:</strong> {testsAdvised.join(", ")}
                  </p>
                )}
                {(sd.follow_up || sd.follow_up_date) && (
                  <p>
                    <strong>Follow-up:</strong>{" "}
                    {[sd.follow_up, sd.follow_up_date].filter(Boolean).join(" • ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN (7 cols): Integrity Gate + Provenance Explanation + Inline Editor + Approve/Share */}
        <section
          aria-label="AI-Generated Patient Explanation and Safety Review"
          className="space-y-4 lg:col-span-7"
        >
          {/* Integrity Notice showing flagged mismatches */}
          <IntegrityNotice
            report={normalizedIntegrity}
            status={effectiveIntegrityStatus}
            showDetailsByDefault
          />

          {/* Explicit 13 Deterministic Field Checks Matrix */}
          {hasExplanation && (
            <div className="ms-card p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wide">
                  13 Deterministic Safety Integrity Checks (Zero-LLM Rule Engine)
                </h3>
                <span className="text-xs font-bold" style={{ color: "var(--ms-ink-muted)" }}>
                  Evaluated: {normalizedIntegrity.rules_evaluated ?? 13} rules
                </span>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {INTEGRITY_RULE_CATALOG.map((rule) => {
                  const matchedMismatch = normalizedIntegrity.mismatches.find(
                    (mm) =>
                      mm.category === rule.category ||
                      mm.field.toLowerCase().includes(rule.category)
                  );
                  const flagBroken = rule.flagKey
                    ? normalizedIntegrity[rule.flagKey] === false
                    : false;
                  const isFlagged = Boolean(matchedMismatch || flagBroken);
                  const isUnchecked = effectiveIntegrityStatus === "unchecked";

                  return (
                    <div
                      key={rule.num}
                      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: isUnchecked
                          ? "var(--ms-surface-alt)"
                          : isFlagged
                            ? "var(--ms-danger-bg)"
                            : "var(--ms-prov-doctor-bg)",
                        borderColor: isUnchecked
                          ? "var(--ms-border)"
                          : isFlagged
                            ? "var(--ms-danger-border)"
                            : "var(--ms-prov-doctor-border)",
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        {isUnchecked ? (
                          <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : isFlagged ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {rule.num}. {rule.label}
                        </span>
                      </span>
                      <span className="font-extrabold uppercase text-[10px]">
                        {isUnchecked ? "Pending" : isFlagged ? "Flagged" : "Verified"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review Controls Toolbar */}
          {hasExplanation && (
            <div className="ms-card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAction !== "idle"}
                    onClick={isEditingOutput ? () => setIsEditingOutput(false) : openInlineEditor}
                    className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold"
                  >
                    {isEditingOutput ? (
                      <>
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span>Cancel Edit</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                        <span>Edit Output</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={busyAction !== "idle"}
                    onClick={() => void runGenerate(targetLanguage, targetDepth)}
                    className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${busyAction === "generating" ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    <span>Regenerate</span>
                  </button>

                  <div className="inline-flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1" style={{ borderColor: "var(--ms-border)" }}>
                    <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <label htmlFor="quick-change-lang" className="text-xs font-extrabold">
                      Change Language:
                    </label>
                    <select
                      id="quick-change-lang"
                      disabled={busyAction !== "idle"}
                      value={targetLanguage}
                      onChange={(e) =>
                        void handleQuickLanguageSwitch(e.target.value as SupportedLanguage)
                      }
                      className="bg-transparent py-1 text-xs font-extrabold"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.native})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Inline Editor for ai_simplified summary & steps */}
              {isEditingOutput && (
                <form
                  onSubmit={(e) => void handleSaveInlineEdit(e)}
                  className="rounded-2xl border-2 p-4 space-y-3"
                  style={{
                    backgroundColor: "var(--ms-prov-ai-bg)",
                    borderColor: "var(--ms-prov-ai-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-extrabold">
                      Edit Patient-Facing Summary &amp; Steps (Re-runs Integrity Checker)
                    </h4>
                  </div>

                  <div>
                    <label htmlFor="edit-ai-summary" className="mb-1 block text-xs font-extrabold uppercase">
                      Simplified Summary
                    </label>
                    <textarea
                      id="edit-ai-summary"
                      rows={4}
                      required
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full rounded-xl border-2 p-3 text-sm leading-relaxed"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-border)",
                        color: "var(--ms-ink)",
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase">Patient Action Steps</span>
                      <button
                        type="button"
                        onClick={() => setEditSteps((prev) => [...prev, ""])}
                        className="rounded-lg border px-2.5 py-1 text-xs font-bold inline-flex items-center gap-1"
                        style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Add Step</span>
                      </button>
                    </div>
                    {editSteps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="mt-2.5 text-xs font-extrabold">{idx + 1}.</span>
                        <input
                          type="text"
                          aria-label={`Step ${idx + 1}`}
                          value={step}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditSteps((prev) =>
                              prev.map((item, i) => (i === idx ? val : item))
                            );
                          }}
                          className="tap-target flex-1 rounded-xl border-2 px-3 py-2 text-sm"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        />
                        <button
                          type="button"
                          aria-label={`Remove step ${idx + 1}`}
                          onClick={() =>
                            setEditSteps((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="tap-target rounded-xl border px-2.5 text-xs font-bold"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-danger-border)",
                            color: "var(--ms-danger-ink)",
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label htmlFor="edit-amendment-reason" className="mb-1 block text-xs font-bold">
                      Amendment Note (Optional)
                    </label>
                    <input
                      id="edit-amendment-reason"
                      type="text"
                      value={amendmentReason}
                      onChange={(e) => setAmendmentReason(e.target.value)}
                      placeholder="e.g., Restored exact dosage limit / clarified morning timing"
                      className="tap-target w-full rounded-xl border-2 px-3 py-2 text-xs"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-border)",
                        color: "var(--ms-ink)",
                      }}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={busyAction !== "idle"}
                      className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs"
                    >
                      {busyAction === "saving_edit" && (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      <span>
                        {busyAction === "saving_edit"
                          ? "Saving & Re-checking..."
                          : "Save Edits & Re-Run Integrity Check"}
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* Approval & Sharing Safety Gate */}
              <div
                className="rounded-xl border-2 p-3.5 space-y-3"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: isBlocked ? "var(--ms-danger-border)" : "var(--ms-border)",
                }}
              >
                {isBlocked && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border-2 p-3 text-xs font-bold"
                    style={{
                      backgroundColor: "var(--ms-danger-bg)",
                      borderColor: "var(--ms-danger-border)",
                      color: "var(--ms-danger-ink)",
                    }}
                  >
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-extrabold">
                        Approve Disabled — Safety Integrity Status is BLOCKED
                      </p>
                      <p className="mt-0.5 font-medium">
                        The deterministic Integrity Checker detected a critical mismatch (medicine,
                        dosage, unit, frequency, duration, route, negation, or warning) between your
                        original note and the explanation. Use <strong>Edit Output</strong> or{" "}
                        <strong>Regenerate</strong> to resolve all blocked issues before approving.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex-1">
                    <label htmlFor="doctor-review-note" className="mb-1 block text-xs font-bold">
                      Clinician Sign-off Note (Optional)
                    </label>
                    <input
                      id="doctor-review-note"
                      type="text"
                      disabled={isApproved}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="e.g., Reviewed doses and follow-up precautions"
                      className="tap-target w-full rounded-xl border-2 px-3 py-2 text-xs"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-border)",
                        color: "var(--ms-ink)",
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={
                        busyAction !== "idle" ||
                        !hasExplanation ||
                        isBlocked ||
                        isApproved
                      }
                      title={
                        isBlocked
                          ? "Approve disabled while integrity_status is blocked"
                          : isApproved
                            ? "Already approved"
                            : "Sign off and approve explanation"
                      }
                      onClick={() => void handleApprove()}
                      className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-50"
                    >
                      {busyAction === "approving" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{isApproved ? "Approved" : "Approve"}</span>
                    </button>

                    {!isShared ? (
                      <button
                        type="button"
                        disabled={
                          busyAction !== "idle" ||
                          !isApproved ||
                          isBlocked
                        }
                        title={
                          !isApproved
                            ? "Approve explanation first before sharing with patient"
                            : "Share approved explanation with patient"
                        }
                        onClick={() => void handleShare("shared_with_patient")}
                        className="tap-target inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-extrabold disabled:opacity-50"
                        style={{
                          backgroundColor: isApproved
                            ? "var(--ms-prov-doctor-border)"
                            : "var(--ms-surface)",
                          borderColor: "var(--ms-prov-doctor-border)",
                          color: isApproved ? "#FFFFFF" : "var(--ms-ink)",
                        }}
                      >
                        {busyAction === "sharing" ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>Share with Patient</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction !== "idle"}
                        onClick={() => void handleShare("revoked")}
                        className="tap-target inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-bold"
                        style={{
                          backgroundColor: "var(--ms-surface)",
                          borderColor: "var(--ms-danger-border)",
                          color: "var(--ms-danger-ink)",
                        }}
                      >
                        <span>Revoke Share</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Patient-Facing 4-Category Provenance Preview */}
          {hasExplanation && normalizedExplanation ? (
            <ProvenanceCards
              provenance={normalizedExplanation}
              highlightedTerms={consultation.highlighted_terms}
            />
          ) : (
            <div className="ms-card p-8 text-center space-y-3">
              <Sparkles
                className="mx-auto h-8 w-8"
                style={{ color: "var(--ms-primary)" }}
                aria-hidden="true"
              />
              <h3 className="text-base font-extrabold">No Patient Explanation Generated Yet</h3>
              <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                Choose a target language and explanation depth above, then click{" "}
                <strong>Generate Simple Explanation</strong> to preview the 4-category provenance
                output and run the 13-rule Safety Integrity Checker.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
