"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileSearch, FileText, Mic, ShieldCheck } from "lucide-react";
import {
  AudioUploadReview,
  type AudioSummaryResult,
} from "@/components/doctor/AudioUploadReview";
import { ConsultationForm } from "@/components/doctor/ConsultationForm";
import { DocumentOcrReview } from "@/components/doctor/DocumentOcrReview";
import {
  DoctorAuthGate,
  DoctorWorkspaceFooter,
  DoctorWorkspaceHeader,
} from "@/components/doctor/DoctorWorkspaceHeader";
import { SideBySideReview } from "@/components/doctor/SideBySideReview";
import {
  buildConsultationSubmission,
  createEmptyMedication,
  formatLanguageLabel,
  formatReadingComfort,
  getPatientDisplayName,
  normalizeConsultationDetail,
  type ConsultationFormValues,
  type StructuredMedicationRow,
} from "@/components/doctor/doctorHelpers";
import {
  api,
  ApiError,
  type ConsultationDetail,
  type DoctorPatientLinkItem,
  type MedicalDocumentDTO,
  type SupportedLanguage,
} from "@/lib/api";

type WorkspaceTab = "review" | "manual" | "audio" | "document";

function detailToFormValues(c: ConsultationDetail): ConsultationFormValues {
  const sd = c.structured_data || {};
  const meds: StructuredMedicationRow[] =
    Array.isArray(sd.medications) && sd.medications.length > 0
      ? sd.medications.map((m) => ({
          name: m.name || m.medicine_name || "",
          dose: m.dosage_value || (m.dose ? m.dose.replace(/[^\d.]/g, "") : ""),
          unit: m.dosage_unit || "mg",
          frequency: m.frequency || m.frequency_text || "",
          duration: m.duration || m.duration_text || "",
          route: m.route || "oral",
          timing_with_food: m.timing_with_food || "",
          warnings: (m.warnings || m.negations_and_warnings || []).join("; "),
        }))
      : [createEmptyMedication()];

  return {
    patient_id: c.patient_id,
    title: c.title,
    visit_date: c.visit_date || "",
    diagnoses: Array.isArray(sd.diagnoses) ? sd.diagnoses.join(", ") : "",
    symptoms: Array.isArray(sd.symptoms) ? sd.symptoms.join(", ") : "",
    observations: Array.isArray(sd.observations) ? sd.observations.join("; ") : "",
    blood_pressure: sd.vitals?.blood_pressure || "",
    temperature: sd.vitals?.temperature || "",
    medications: meds,
    tests_advised: Array.isArray(sd.tests_advised) ? sd.tests_advised.join(", ") : "",
    allergies: Array.isArray(sd.allergies) ? sd.allergies.join(", ") : "",
    follow_up_date: typeof sd.follow_up_date === "string" ? sd.follow_up_date : "",
    follow_up_note: typeof sd.follow_up === "string" ? sd.follow_up : "",
    doctor_explanation:
      typeof sd.doctor_explanation === "string" ? sd.doctor_explanation : "",
    notes: typeof sd.notes === "string" ? sd.notes : "",
    free_text_raw: c.original_doctor_input,
  };
}

function DoctorConsultationReviewContent({ consultationId }: { consultationId: string }) {
  const [consultation, setConsultation] = useState<ConsultationDetail | null>(null);
  const [patients, setPatients] = useState<DoctorPatientLinkItem[]>([]);
  const [formValues, setFormValues] = useState<ConsultationFormValues | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("review");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingStructured, setSavingStructured] = useState(false);
  const [structuredErr, setStructuredErr] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const loadConsultation = useCallback(async () => {
    if (!consultationId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [rawConsult, patList] = await Promise.all([
        api.getDoctorConsultation(consultationId),
        api.listDoctorPatients().catch(() => []),
      ]);
      const normalized = normalizeConsultationDetail(rawConsult);
      setConsultation(normalized);
      setFormValues(detailToFormValues(normalized));
      setPatients(Array.isArray(patList) ? patList : []);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Unable to load consultation record."
      );
    } finally {
      setLoading(false);
    }
  }, [consultationId]);

  useEffect(() => {
    void loadConsultation();
  }, [loadConsultation]);

  const patient =
    patients.find((p) => p.patient_id === consultation?.patient_id) ?? null;
  const patientPreferredLang: SupportedLanguage =
    (patient?.preferred_language as SupportedLanguage) ||
    ((consultation?.explanation_language as SupportedLanguage) || "en");

  async function handleSaveStructuredEdits(
    values: ConsultationFormValues,
    _opts: { generateAfterSave: boolean }
  ) {
    if (!consultation) return;
    setStructuredErr(null);
    setSavingStructured(true);
    try {
      const { structured_data } = buildConsultationSubmission(values);
      const raw = await api.updateDoctorConsultation(consultation.id, {
        title: values.title.trim(),
        structured_data,
        amendment_reason: "Doctor updated structured clinical metadata",
      });
      const updated = normalizeConsultationDetail(raw, consultation);
      setConsultation(updated);
      setFormValues(detailToFormValues(updated));
      setStatusBanner("Structured consultation fields updated.");
      setActiveTab("review");
    } catch (err) {
      setStructuredErr(
        err instanceof ApiError ? err.message : "Unable to update consultation fields."
      );
    } finally {
      setSavingStructured(false);
    }
  }

  async function handleAudioAttached(result: AudioSummaryResult) {
    if (!consultation) return;
    setStatusBanner(
      `Consultation audio (${result.audioId}) transcribed and summarized. Review updated details in Side-by-Side Review.`
    );
    await loadConsultation();
    setActiveTab("review");
  }

  async function handleDocumentAttached(doc: MedicalDocumentDTO) {
    if (!consultation) return;
    const existingDocIds = Array.isArray(consultation.structured_data?.document_ids)
      ? (consultation.structured_data.document_ids as string[])
      : [];
    const nextDocIds = Array.from(new Set([...existingDocIds, doc.id]));
    try {
      const raw = await api.updateDoctorConsultation(consultation.id, {
        structured_data: {
          ...(consultation.structured_data || {}),
          document_ids: nextDocIds,
        },
        amendment_reason: `Attached verified OCR document ${doc.original_filename}`,
      });
      const updated = normalizeConsultationDetail(raw, consultation);
      setConsultation(updated);
      setStatusBanner(
        `Verified document "${doc.original_filename}" attached to consultation.`
      );
      setActiveTab("review");
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Failed to link verified document."
      );
    }
  }

  return (
      <div className="space-y-6">
        <DoctorWorkspaceHeader
          title={consultation?.title || "Consultation Review & Safety Gate"}
          subtitle="Side-by-side comparison of immutable doctor source against AI patient explanation, with 13-rule Integrity Check, Edit, Regenerate, Language Switch, Approve & Share."
          backHref="/doctor"
        />

        {loading ? (
          <div className="ms-card p-8 text-center font-semibold">
            Loading consultation and safety checks...
          </div>
        ) : errorMsg ? (
          <div
            role="alert"
            className="ms-card p-6 space-y-3"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            <p className="font-bold">{errorMsg}</p>
            <Link
              href="/doctor"
              className="ms-btn-secondary tap-target inline-flex items-center px-4 py-2 text-xs"
            >
              Return to Doctor Dashboard
            </Link>
          </div>
        ) : consultation ? (
          <>
            {/* Linked Patient Context Strip */}
            <section className="ms-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span>
                  Patient:{" "}
                  {patient ? (
                    <Link
                      href={`/doctor/patients/${patient.patient_id}`}
                      className="font-extrabold underline"
                    >
                      {getPatientDisplayName(patient)}
                    </Link>
                  ) : (
                    <strong>{consultation.patient_id}</strong>
                  )}
                </span>
                {patient?.age_years != null && <span>• Age {patient.age_years}</span>}
                {patient && (
                  <span>
                    • Preference: {formatLanguageLabel(patient.preferred_language)} /{" "}
                    {formatReadingComfort(patient.reading_comfort_level)}
                  </span>
                )}
                {consultation.visit_date && <span>• Visit: {consultation.visit_date}</span>}
              </div>

              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                }}
              >
                <span>Source: {consultation.source_type.replace(/_/g, " ")}</span>
              </span>
            </section>

            {statusBanner && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border-2 px-4 py-3 text-xs font-bold"
                style={{
                  backgroundColor: "var(--ms-primary-soft)",
                  borderColor: "var(--ms-primary)",
                }}
              >
                {statusBanner}
              </div>
            )}

            {/* Workspace Mode Tabs */}
            <div
              role="tablist"
              aria-label="Consultation review and source input tabs"
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {(
                [
                  { key: "review", label: "Side-by-Side Review & Gate", icon: ShieldCheck },
                  { key: "manual", label: "Structured Clinical Form", icon: FileText },
                  { key: "audio", label: "Audio Upload & Transcript", icon: Mic },
                  { key: "document", label: "Document OCR Verification", icon: FileSearch },
                ] as Array<{ key: WorkspaceTab; label: string; icon: typeof ShieldCheck }>
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.key)}
                    className="tap-target flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs font-extrabold transition-colors"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === "review" && (
              <SideBySideReview
                consultation={consultation}
                patientPreferredLanguage={patientPreferredLang}
                onUpdated={(updated) => {
                  setConsultation(updated);
                  setFormValues(detailToFormValues(updated));
                }}
              />
            )}

            {activeTab === "manual" && formValues && (
              <ConsultationForm
                patients={patients}
                values={formValues}
                onChange={setFormValues}
                onSubmit={handleSaveStructuredEdits}
                submitting={savingStructured}
                errorMsg={structuredErr}
                isEditingExisting
                lockedInput={Boolean(consultation.original_input_locked_at)}
              />
            )}

            {activeTab === "audio" && (
              <AudioUploadReview
                patientId={consultation.patient_id}
                consultationId={consultation.id}
                defaultLanguage={patientPreferredLang}
                onApplyToConsultation={handleAudioAttached}
              />
            )}

            {activeTab === "document" && (
              <DocumentOcrReview
                patientId={consultation.patient_id}
                consultationId={consultation.id}
                onAttachToConsultation={handleDocumentAttached}
              />
            )}
          </>
        ) : null}

        <DoctorWorkspaceFooter />
      </div>
  );
}

export default function DoctorConsultationReviewPage() {
  const params = useParams<{ id: string }>();
  const consultationId = params?.id ?? "";

  return (
    <DoctorAuthGate>
      <DoctorConsultationReviewContent consultationId={consultationId} />
    </DoctorAuthGate>
  );
}
