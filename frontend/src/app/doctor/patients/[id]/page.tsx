"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  ClipboardList,
  FilePlus2,
  FileText,
  Pill,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import {
  DoctorAuthGate,
  DoctorWorkspaceFooter,
  DoctorWorkspaceHeader,
} from "@/components/doctor/DoctorWorkspaceHeader";
import {
  fetchPatientMedicationsSafe,
  formatLanguageLabel,
  formatReadingComfort,
  getApprovalBadgeStyle,
  getIntegrityBadgeStyle,
  getPatientDisplayName,
} from "@/components/doctor/doctorHelpers";
import {
  api,
  ApiError,
  type ConsultationSummary,
  type DoctorPatientLinkItem,
  type MedicalDocumentDTO,
  type MedicationListItem,
} from "@/lib/api";

function DoctorPatientDetailContent({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<DoctorPatientLinkItem | null>(null);
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [documents, setDocuments] = useState<MedicalDocumentDTO[]>([]);
  const [medications, setMedications] = useState<MedicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadPatientContext = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [patList, consultList, docList, medList] = await Promise.all([
        api.listDoctorPatients(),
        api.listDoctorConsultations(patientId),
        api.listDocuments(patientId).catch(() => []),
        fetchPatientMedicationsSafe(patientId),
      ]);
      const matched = patList.find((p) => p.patient_id === patientId) ?? null;
      if (!matched) {
        setErrorMsg(
          "This patient is not actively linked to your clinician account. Only consented linked patients are accessible."
        );
      }
      setPatient(matched);
      setConsultations(Array.isArray(consultList) ? consultList : []);
      setDocuments(Array.isArray(docList) ? docList : []);
      setMedications(Array.isArray(medList) ? medList : []);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to load patient context.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadPatientContext();
  }, [loadPatientContext]);

  const patientName = patient ? getPatientDisplayName(patient) : "Patient Context";

  return (
      <div className="space-y-6">
        <DoctorWorkspaceHeader
          title={patientName}
          subtitle="Consented patient communication profile, medication record, uploaded reports, and consultation history."
          backHref="/doctor"
          actions={
            patient ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/doctor/consultations/new?patientId=${encodeURIComponent(patient.patient_id)}&demo=judge-uri`}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-3.5 py-2 text-xs font-extrabold"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Load Judge Demo for Patient</span>
                </Link>
                <Link
                  href={`/doctor/consultations/new?patientId=${encodeURIComponent(patient.patient_id)}`}
                  className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs"
                >
                  <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                  <span>New Consultation</span>
                </Link>
              </div>
            ) : undefined
          }
        />

        {loading ? (
          <div className="ms-card p-8 text-center font-semibold">Loading patient context...</div>
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
              Return to Linked Patients
            </Link>
          </div>
        ) : patient ? (
          <div className="space-y-6">
            {/* Patient Communication Profile & Consent Card */}
            <section className="ms-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Patient Demographics</span>
                </span>
                <p className="text-lg font-extrabold">{patientName}</p>
                <p className="text-xs font-semibold">
                  {patient.age_years != null ? `Age: ${patient.age_years} years` : "Age not provided"}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  Preferred Language
                </span>
                <p className="text-base font-extrabold">
                  {formatLanguageLabel(patient.preferred_language)}
                </p>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  Used as default target when generating explanations
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  Reading Comfort Baseline
                </span>
                <p className="text-base font-extrabold">
                  {formatReadingComfort(patient.reading_comfort_level)}
                </p>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  Presentation setting only (never omits warnings)
                </p>
              </div>

              <div className="space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Consent Link</span>
                </span>
                <p className="text-base font-extrabold uppercase">{patient.consent_status}</p>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  Scope: {patient.consent_scope}
                  {patient.consent_granted_at
                    ? ` • ${new Date(patient.consent_granted_at).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
            </section>

            {/* Medications & Documents Row */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="ms-card space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Pill className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                  <h2 className="text-base font-extrabold">Recorded Medications</h2>
                </div>
                {medications.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                    No shared medications recorded yet. Open a consultation below to view draft
                    medications or create a new consultation.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {medications.map((m, idx) => (
                      <li
                        key={m.id || idx}
                        className="rounded-xl border p-3 text-sm space-y-1"
                        style={{
                          backgroundColor: "var(--ms-surface-alt)",
                          borderColor: "var(--ms-border)",
                        }}
                      >
                        <p className="font-extrabold">
                          {m.medicine_name} — {m.dose}
                        </p>
                        <p className="text-xs font-semibold">
                          {[m.frequency, m.duration, m.route].filter(Boolean).join(" • ")}
                        </p>
                        {m.warnings && m.warnings.length > 0 && (
                          <p className="text-xs font-bold" style={{ color: "var(--ms-danger-ink)" }}>
                            Warnings: {m.warnings.join("; ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="ms-card space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                  <h2 className="text-base font-extrabold">Uploaded Medical Documents</h2>
                </div>
                {documents.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                    No lab reports or prescriptions uploaded for this patient yet.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="rounded-xl border p-3 text-xs space-y-1"
                        style={{
                          backgroundColor: "var(--ms-surface-alt)",
                          borderColor: "var(--ms-border)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-sm">{doc.original_filename}</span>
                          <span className="rounded-full border px-2 py-0.5 font-bold uppercase">
                            {doc.verification_status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p style={{ color: "var(--ms-ink-muted)" }}>
                          Type: {doc.document_type.replace(/_/g, " ")} • Pages: {doc.page_count} •
                          Status: {doc.processing_status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Patient Consultation History */}
            <section className="ms-card space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                  <h2 className="text-base font-extrabold">Consultation History</h2>
                </div>
                <Link
                  href={`/doctor/consultations/new?patientId=${encodeURIComponent(patient.patient_id)}`}
                  className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-3.5 py-2 text-xs"
                >
                  <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                  <span>Add Consultation</span>
                </Link>
              </div>

              {consultations.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                  No consultations recorded for {patientName} yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {consultations.map((c) => {
                    const approvalStyle = getApprovalBadgeStyle(c.approval_status);
                    const integrityStyle = getIntegrityBadgeStyle(c.integrity_status);
                    return (
                      <li
                        key={c.id}
                        className="rounded-xl border-2 p-4 flex flex-wrap items-center justify-between gap-3"
                        style={{ borderColor: "var(--ms-border)" }}
                      >
                        <div className="space-y-1">
                          <h3 className="text-base font-extrabold">{c.title}</h3>
                          <p className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                            {c.visit_date || "No visit date"} • {c.source_type.replace(/_/g, " ")} •{" "}
                            {formatLanguageLabel(c.explanation_language)}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <span
                              className="rounded-full border px-2 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: integrityStyle.bg,
                                borderColor: integrityStyle.border,
                                color: integrityStyle.ink,
                              }}
                            >
                              {integrityStyle.label}
                            </span>
                            <span
                              className="rounded-full border px-2 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: approvalStyle.bg,
                                borderColor: approvalStyle.border,
                                color: approvalStyle.ink,
                              }}
                            >
                              {approvalStyle.label}
                            </span>
                            <span className="rounded-full border px-2 py-0.5 text-xs font-bold">
                              {c.sharing_status === "shared_with_patient" ? "Shared" : "Draft"}
                            </span>
                          </div>
                        </div>

                        <Link
                          href={`/doctor/consultations/${c.id}`}
                          className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold"
                        >
                          <span>Review &amp; Manage</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        <DoctorWorkspaceFooter />
      </div>
  );
}

export default function DoctorPatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params?.id ?? "";

  return (
    <DoctorAuthGate>
      <DoctorPatientDetailContent patientId={patientId} />
    </DoctorAuthGate>
  );
}
