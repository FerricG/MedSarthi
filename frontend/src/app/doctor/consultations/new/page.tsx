"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSearch, FileText, Mic, Sparkles } from "lucide-react";
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
import {
  buildConsultationSubmission,
  createEmptyMedication,
  createJudgeDemoValues,
  formatDateOffset,
  formatLanguageLabel,
  getPatientDisplayName,
  normalizeConsultationDetail,
  parseFreeTextClinicalNote,
  type ConsultationFormValues,
} from "@/components/doctor/doctorHelpers";
import {
  api,
  ApiError,
  type DoctorPatientLinkItem,
  type MedicalDocumentDTO,
  type SupportedLanguage,
} from "@/lib/api";

type InputTab = "manual" | "audio" | "document";

function NewConsultationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPatientParam = searchParams.get("patientId") || "";
  const demoParam = searchParams.get("demo") || "";

  const [activeTab, setActiveTab] = useState<InputTab>("manual");
  const [patients, setPatients] = useState<DoctorPatientLinkItem[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formValues, setFormValues] = useState<ConsultationFormValues>(() => ({
    patient_id: initialPatientParam,
    title: "",
    visit_date: formatDateOffset(0),
    diagnoses: "",
    symptoms: "",
    observations: "",
    blood_pressure: "",
    temperature: "",
    medications: [createEmptyMedication()],
    tests_advised: "",
    allergies: "",
    follow_up_date: "",
    follow_up_note: "",
    doctor_explanation: "",
    notes: "",
    free_text_raw: "",
  }));

  const [sourceType, setSourceType] = useState<
    "doctor_entered" | "doctor_audio" | "doctor_document"
  >("doctor_entered");
  const [transcriptAudioId, setTranscriptAudioId] = useState<string | undefined>(undefined);
  const [attachedDocIds, setAttachedDocIds] = useState<string[]>([]);
  const [attachedContextSummary, setAttachedContextSummary] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [demoAutoApplied, setDemoAutoApplied] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoadingPatients(true);
    setLoadError(null);
    try {
      const list = await api.listDoctorPatients();
      const safeList = Array.isArray(list) ? list : [];
      setPatients(safeList);
      const preferredPatientId =
        initialPatientParam ||
        safeList[0]?.patient_id ||
        "";

      if (demoParam === "judge-uri" && !demoAutoApplied) {
        setFormValues(createJudgeDemoValues(preferredPatientId));
        setDemoAutoApplied(true);
      } else if (preferredPatientId) {
        setFormValues((prev) =>
          prev.patient_id ? prev : { ...prev, patient_id: preferredPatientId }
        );
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load linked patients."
      );
    } finally {
      setLoadingPatients(false);
    }
  }, [initialPatientParam, demoParam, demoAutoApplied]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const selectedPatient =
    patients.find((p) => p.patient_id === formValues.patient_id) ?? null;
  const patientPreferredLang: SupportedLanguage =
    (selectedPatient?.preferred_language as SupportedLanguage) || "en";

  async function handleManualSubmit(
    values: ConsultationFormValues,
    options: { generateAfterSave: boolean }
  ) {
    setSubmitError(null);
    if (!values.patient_id) {
      setSubmitError("Please select a linked patient first.");
      return;
    }
    if (!values.title.trim()) {
      setSubmitError("Please enter a consultation title.");
      return;
    }

    const { original_doctor_input, structured_data } = buildConsultationSubmission(values);
    if (!original_doctor_input.trim()) {
      setSubmitError(
        "Enter clinical details (diagnoses, medications, or notes) before saving."
      );
      return;
    }

    if (attachedDocIds.length > 0) {
      structured_data.document_ids = attachedDocIds;
    }

    setSubmitting(true);
    try {
      const createdRaw = await api.createDoctorConsultation({
        patient_id: values.patient_id,
        title: values.title.trim(),
        visit_date: values.visit_date || undefined,
        source_type: sourceType,
        original_doctor_input,
        transcript_audio_id: transcriptAudioId,
        structured_data,
      });
      const created = normalizeConsultationDetail(createdRaw);

      if (options.generateAfterSave && created.id) {
        try {
          await api.generateDoctorExplanation(created.id, {
            target_language: patientPreferredLang,
            include_visuals: true,
          });
        } catch {
          // Still navigate to the consultation review page where doctor can view/retry
        }
      }

      router.push(`/doctor/consultations/${created.id}`);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Failed to create consultation."
      );
      setSubmitting(false);
    }
  }

  async function handleAudioSummarized(result: AudioSummaryResult) {
    if (result.consultationId) {
      router.push(`/doctor/consultations/${result.consultationId}`);
      return;
    }

    const ss = result.structuredSummary || {};
    const diagList = Array.isArray(ss.diagnoses)
      ? ss.diagnoses.map(String)
      : [];
    const sympList = Array.isArray(ss.symptoms)
      ? ss.symptoms.map(String)
      : [];
    const obsList = Array.isArray(ss.observations)
      ? ss.observations.map(String)
      : [];
    const warnList = Array.isArray(ss.warnings)
      ? ss.warnings.map(String)
      : [];
    const followUpStr = typeof ss.follow_up === "string" ? ss.follow_up : "";

    let updated = parseFreeTextClinicalNote(result.transcriptText, {
      ...formValues,
      title:
        formValues.title ||
        (diagList.length > 0
          ? `Audio Consultation: ${diagList[0]}`
          : "Consultation from Verified Audio Transcript"),
      diagnoses: diagList.join(", ") || formValues.diagnoses,
      symptoms: sympList.join(", ") || formValues.symptoms,
      observations: obsList.join("; ") || formValues.observations,
      follow_up_note: followUpStr || formValues.follow_up_note,
      doctor_explanation:
        result.provenance?.ai_simplified?.summary || formValues.doctor_explanation,
      notes: [result.transcriptText, ...warnList].filter(Boolean).join("\n"),
    });

    if (Array.isArray(ss.medications) && ss.medications.length > 0 && updated.medications.every((m) => !m.name)) {
      updated = parseFreeTextClinicalNote(
        ss.medications.map(String).join("; "),
        updated
      );
    }

    setFormValues(updated);
    setSourceType("doctor_audio");
    setTranscriptAudioId(result.audioId);
    setAttachedContextSummary(
      `Attached verified audio transcript (${result.audioId})${result.audioPurged ? " — raw audio purged" : ""}. Review extracted fields below and save.`
    );
    setActiveTab("manual");
  }

  async function handleDocumentAttached(doc: MedicalDocumentDTO) {
    const rawText = doc.ocr_raw_text || "";
    const fields = doc.ocr_structured_fields || {};

    let updated = parseFreeTextClinicalNote(rawText, {
      ...formValues,
      title:
        formValues.title ||
        `Document Consultation: ${doc.original_filename}`,
    });

    if (Array.isArray(fields.diagnoses) && fields.diagnoses.length > 0 && !updated.diagnoses) {
      updated = {
        ...updated,
        diagnoses: fields.diagnoses.map(String).join(", "),
      };
    }

    const rawLabItems = Array.isArray(fields.tests)
      ? fields.tests
      : Array.isArray(fields.lab_rows)
        ? fields.lab_rows
        : [];
    if (rawLabItems.length > 0) {
      const testSummaries = rawLabItems
        .map((item) => {
          if (item && typeof item === "object") {
            const rec = item as Record<string, unknown>;
            const name = String(rec.test_name ?? rec.name ?? "Test");
            const val = String(rec.value ?? "");
            const unit = String(rec.unit ?? "");
            const ref = rec.reference_range ? ` (${String(rec.reference_range)})` : "";
            return `${name}: ${val} ${unit}${ref}`.trim();
          }
          return String(item);
        })
        .filter(Boolean);
      if (testSummaries.length > 0) {
        updated = {
          ...updated,
          observations: [updated.observations, ...testSummaries]
            .filter(Boolean)
            .join("; "),
        };
      }
    }

    if (Array.isArray(fields.medications) && fields.medications.length > 0) {
      const medLines = fields.medications
        .map((item) => {
          if (item && typeof item === "object") {
            const rec = item as Record<string, unknown>;
            return String(
              rec.raw_line ??
                [rec.name ?? rec.medicine_name, rec.dose].filter(Boolean).join(" ")
            );
          }
          return String(item);
        })
        .filter(Boolean);
      if (medLines.length > 0 && updated.medications.every((m) => !m.name)) {
        updated = parseFreeTextClinicalNote(medLines.join("\n"), updated);
      }
    }

    setFormValues(updated);
    setSourceType("doctor_document");
    setAttachedDocIds((prev) => Array.from(new Set([...prev, doc.id])));
    setAttachedContextSummary(
      `Attached verified OCR document "${doc.original_filename}" (${doc.verification_status.replace(/_/g, " ")}). Review extracted fields below and save.`
    );
    setActiveTab("manual");
  }

  return (
    <div className="space-y-6">
      <DoctorWorkspaceHeader
        title="New Doctor Consultation"
        subtitle="Author via structured manual entry / quick free-text, consultation audio upload & transcript editor, or document upload & OCR verification."
        backHref="/doctor"
        actions={
          <button
            type="button"
            onClick={() => {
              const targetPid =
                formValues.patient_id || patients[0]?.patient_id || "";
              setFormValues(createJudgeDemoValues(targetPid));
              setActiveTab("manual");
              setSourceType("doctor_entered");
              setAttachedContextSummary(
                "Loaded Judge Demo Scenario (URI + Fever & Sore Throat). Click 'Save & Generate Simple Explanation' below."
              );
            }}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs font-extrabold"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Load Judge Demo Scenario (URI + Fever &amp; Sore Throat)</span>
          </button>
        }
      />

      {loadError && (
        <p
          role="alert"
          className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-danger-bg)",
            borderColor: "var(--ms-danger-border)",
            color: "var(--ms-danger-ink)",
          }}
        >
          {loadError}
        </p>
      )}

      {!loadingPatients && patients.length === 0 && (
        <div
          className="rounded-2xl border-2 p-4 text-sm font-semibold"
          style={{
            backgroundColor: "var(--ms-banner-bg)",
            borderColor: "var(--ms-banner-border)",
            color: "var(--ms-banner-ink)",
          }}
        >
          No linked patients found yet. Return to the{" "}
          <Link href="/doctor" className="underline font-extrabold">
            Doctor Dashboard
          </Link>{" "}
          and click <strong>Add / Link Demo Patient</strong> first.
        </div>
      )}

      {/* 3 Streamlined Input Tabs */}
      <div
        role="tablist"
        aria-label="Consultation input methods"
        className="grid gap-2 sm:grid-cols-3"
      >
        {(
          [
            {
              key: "manual",
              label: "1. Manual Entry (Structured + Free-Text)",
              icon: FileText,
            },
            {
              key: "audio",
              label: "2. Consultation Audio & Transcript",
              icon: Mic,
            },
            {
              key: "document",
              label: "3. Document Upload & OCR Verify",
              icon: FileSearch,
            },
          ] as Array<{ key: InputTab; label: string; icon: typeof FileText }>
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
              className="tap-target flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-xs font-extrabold transition-colors sm:text-sm"
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

      {selectedPatient && (
        <div
          className="rounded-xl border px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: "var(--ms-surface-alt)",
            borderColor: "var(--ms-border)",
          }}
        >
          <span>
            Active Patient: <strong>{getPatientDisplayName(selectedPatient)}</strong>
          </span>
          <span>
            Default Target Language:{" "}
            <strong>{formatLanguageLabel(selectedPatient.preferred_language)}</strong>
          </span>
        </div>
      )}

      {activeTab === "manual" && (
        <ConsultationForm
          patients={patients}
          values={formValues}
          onChange={setFormValues}
          onSubmit={handleManualSubmit}
          submitting={submitting}
          errorMsg={submitError}
          attachedContextSummary={attachedContextSummary}
        />
      )}

      {activeTab === "audio" && (
        <AudioUploadReview
          patients={patients}
          patientId={formValues.patient_id}
          onPatientChange={(pid) => setFormValues((prev) => ({ ...prev, patient_id: pid }))}
          defaultLanguage={patientPreferredLang}
          onApplyToConsultation={handleAudioSummarized}
        />
      )}

      {activeTab === "document" && (
        <DocumentOcrReview
          patients={patients}
          patientId={formValues.patient_id}
          onPatientChange={(pid) => setFormValues((prev) => ({ ...prev, patient_id: pid }))}
          onAttachToConsultation={handleDocumentAttached}
        />
      )}

      <DoctorWorkspaceFooter />
    </div>
  );
}

export default function NewDoctorConsultationPage() {
  return (
    <DoctorAuthGate>
      <Suspense fallback={<div className="ms-card p-8 text-center font-semibold">Loading consultation studio...</div>}>
        <NewConsultationContent />
      </Suspense>
    </DoctorAuthGate>
  );
}
