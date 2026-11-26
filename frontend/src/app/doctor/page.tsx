"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Link2,
  Loader2,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  DoctorAuthGate,
  DoctorWorkspaceFooter,
  DoctorWorkspaceHeader,
} from "@/components/doctor/DoctorWorkspaceHeader";
import {
  LANGUAGE_OPTIONS,
  createDoctorPatientRecord,
  formatLanguageLabel,
  formatReadingComfort,
  getApprovalBadgeStyle,
  getIntegrityBadgeStyle,
  getPatientDisplayName,
  linkExistingPatientByIdentifier,
} from "@/components/doctor/doctorHelpers";
import {
  api,
  ApiError,
  type ConsultationSummary,
  type DoctorPatientLinkItem,
  type ReadingComfortLevel,
  type SupportedLanguage,
} from "@/lib/api";

type ConsultFilter = "all" | "draft" | "blocked" | "approved" | "shared";

function DoctorDashboardContent() {
  const [patients, setPatients] = useState<DoctorPatientLinkItem[]>([]);
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [consultFilter, setConsultFilter] = useState<ConsultFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add / Link Demo Patient Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "link">("create");
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("45");
  const [newGender, setNewGender] = useState<"male" | "female" | "other" | "prefer_not_to_say">("prefer_not_to_say");
  const [newLanguage, setNewLanguage] = useState<SupportedLanguage>("hi-Latn");
  const [newComfort, setNewComfort] = useState<ReadingComfortLevel>("simple");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [linkIdentifier, setLinkIdentifier] = useState("ramesh.demo@medsarthi.local");
  const [consentScope, setConsentScope] = useState<"linked_care" | "consultation_only">("linked_care");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async (query = "") => {
    setLoadError(null);
    setLoading(true);
    try {
      const [patList, consultList] = await Promise.all([
        api.listDoctorPatients(query),
        api.listDoctorConsultations(),
      ]);
      setPatients(Array.isArray(patList) ? patList : []);
      setConsultations(Array.isArray(consultList) ? consultList : []);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to load linked patients or consultations from backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData("");
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const patientLookup = useMemo(() => {
    const map = new Map<string, DoctorPatientLinkItem>();
    for (const p of patients) {
      map.set(p.patient_id, p);
    }
    return map;
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      getPatientDisplayName(p).toLowerCase().includes(q)
    );
  }, [patients, searchQuery]);

  const filteredConsultations = useMemo(() => {
    return consultations.filter((c) => {
      if (consultFilter === "blocked") return c.integrity_status === "blocked";
      if (consultFilter === "approved") return c.approval_status === "approved";
      if (consultFilter === "shared") return c.sharing_status === "shared_with_patient";
      if (consultFilter === "draft") {
        return c.approval_status !== "approved";
      }
      return true;
    });
  }, [consultations, consultFilter]);

  const counts = useMemo(() => {
    return {
      patients: patients.length,
      drafts: consultations.filter((c) => c.approval_status !== "approved").length,
      blocked: consultations.filter((c) => c.integrity_status === "blocked").length,
      shared: consultations.filter((c) => c.sharing_status === "shared_with_patient").length,
    };
  }, [patients, consultations]);

  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);
    setModalBusy(true);

    try {
      if (modalMode === "create") {
        if (!newName.trim()) {
          setModalError("Patient name is required.");
          setModalBusy(false);
          return;
        }
        const ageNum = newAge.trim() ? Number(newAge) : undefined;
        await createDoctorPatientRecord({
          name: newName.trim(),
          age_years: Number.isFinite(ageNum) ? ageNum : undefined,
          gender: newGender,
          preferred_language: newLanguage,
          reading_comfort_level: newComfort,
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
        });
        setModalSuccess(`Created and linked synthetic patient "${newName.trim()}".`);
        setNewName("");
        setNewEmail("");
        setNewPhone("");
      } else {
        if (!linkIdentifier.trim()) {
          setModalError("Enter a patient email or phone number to link.");
          setModalBusy(false);
          return;
        }
        await linkExistingPatientByIdentifier(linkIdentifier, consentScope);
        setModalSuccess(`Linked patient "${linkIdentifier.trim()}" cleanly.`);
      }
      await loadWorkspaceData(searchQuery);
    } catch (err) {
      if (
        modalMode === "create" &&
        err instanceof ApiError &&
        (err.status === 404 || err.status === 405)
      ) {
        setModalError(
          "Direct patient creation endpoint is not enabled on this backend instance; switch to 'Link Existing Patient' tab (e.g. ramesh.demo@medsarthi.local)."
        );
      } else {
        setModalError(
          err instanceof ApiError ? err.message : "Failed to add or link patient."
        );
      }
    } finally {
      setModalBusy(false);
    }
  }

  return (
      <div className="space-y-6">
        <DoctorWorkspaceHeader
          title="Doctor Clinical Workspace"
          subtitle="Manage consented patients, author structured/audio/OCR consultations, run deterministic safety integrity checks, and approve patient-ready explanations."
          showQuickDemoLink
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setModalSuccess(null);
                  setModalOpen(true);
                }}
                className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
              >
                <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Add / Link Demo Patient</span>
              </button>

              <Link
                href="/doctor/consultations/new"
                className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>New Consultation</span>
              </Link>
            </div>
          }
        />

        {/* Operational Overview Strip */}
        <section aria-label="Workspace Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="ms-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                Linked Patients
              </p>
              <p className="text-2xl font-extrabold">{counts.patients}</p>
            </div>
            <Users className="h-7 w-7" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          </div>

          <div className="ms-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                Drafts / Pending Approval
              </p>
              <p className="text-2xl font-extrabold">{counts.drafts}</p>
            </div>
            <ClipboardList className="h-7 w-7" style={{ color: "var(--ms-focus)" }} aria-hidden="true" />
          </div>

          <div
            className="ms-card p-4 flex items-center justify-between"
            style={{
              borderColor: counts.blocked > 0 ? "var(--ms-danger-border)" : "var(--ms-border)",
              backgroundColor: counts.blocked > 0 ? "var(--ms-danger-bg)" : "var(--ms-surface)",
            }}
          >
            <div>
              <p className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                Safety Blocked Alerts
              </p>
              <p className="text-2xl font-extrabold">{counts.blocked}</p>
            </div>
            <ShieldAlert
              className="h-7 w-7"
              style={{ color: counts.blocked > 0 ? "var(--ms-danger-border)" : "var(--ms-ink-muted)" }}
              aria-hidden="true"
            />
          </div>

          <div className="ms-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                Shared with Patients
              </p>
              <p className="text-2xl font-extrabold">{counts.shared}</p>
            </div>
            <Send className="h-7 w-7" style={{ color: "var(--ms-prov-doctor-border)" }} aria-hidden="true" />
          </div>
        </section>

        {/* Judge Demo Quick Launch Banner */}
        <section
          className="rounded-2xl border-2 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          style={{
            backgroundColor: "var(--ms-prov-ai-bg)",
            borderColor: "var(--ms-prov-ai-border)",
          }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Sparkles className="h-4 w-4 shrink-0" style={{ color: "var(--ms-prov-ai-border)" }} aria-hidden="true" />
              <span>1-Click Judge Demo Scenario (URI + Fever &amp; Sore Throat)</span>
            </div>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Pre-fills Acute Nasopharyngitis (URI), Fever &amp; Sore Throat, BP 142/88 mmHg,
              Paracetamol 500 mg SOS (max 4 tablets/24h), and Amlodipine 5 mg morning after
              breakfast so you can generate, inspect all 13 safety checks, approve, and share in seconds.
            </p>
          </div>
          <Link
            href="/doctor/consultations/new?demo=judge-uri"
            className="ms-btn-primary tap-target inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Load Judge Demo Scenario</span>
          </Link>
        </section>

        {loadError && (
          <div
            role="alert"
            className="rounded-xl border-2 p-4 text-sm font-bold flex flex-wrap items-center justify-between gap-3"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadWorkspaceData(searchQuery)}
              className="rounded-lg border px-3 py-1.5 text-xs font-extrabold"
              style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-danger-border)" }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Main 2-Column Workspace Grid */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT: Linked Patients Directory */}
          <section
            aria-label="Linked Patients"
            className="ms-card space-y-4 p-4 sm:p-5 lg:col-span-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold">Linked Patients</h2>
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setModalSuccess(null);
                  setModalOpen(true);
                }}
                className="tap-target inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold"
                style={{ borderColor: "var(--ms-border)" }}
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add / Link</span>
              </button>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--ms-ink-muted)" }}
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search linked patients"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter linked patients by name..."
                className="tap-target w-full rounded-xl border-2 pl-9 pr-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm font-semibold">Loading linked patients...</div>
            ) : filteredPatients.length === 0 ? (
              <div
                className="rounded-xl border-2 border-dashed p-5 text-center space-y-2"
                style={{ borderColor: "var(--ms-border)" }}
              >
                <p className="text-sm font-bold">No linked patients match.</p>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  Add a synthetic demo patient or link an existing patient via consent identifier.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredPatients.map((pat) => {
                  const displayName = getPatientDisplayName(pat);
                  return (
                    <li
                      key={pat.patient_id}
                      className="rounded-xl border-2 p-3.5 space-y-2.5"
                      style={{
                        backgroundColor: "var(--ms-surface-alt)",
                        borderColor: "var(--ms-border)",
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/doctor/patients/${pat.patient_id}`}
                            className="text-base font-extrabold underline decoration-dotted underline-offset-4 hover:opacity-80"
                          >
                            {displayName}
                          </Link>
                          <p className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                            {pat.age_years != null ? `Age ${pat.age_years}` : "Age not set"} • Consent:{" "}
                            {pat.consent_status} ({pat.consent_scope})
                          </p>
                        </div>
                        <span
                          className="rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
                          style={{
                            backgroundColor: "var(--ms-primary-soft)",
                            borderColor: "var(--ms-primary)",
                          }}
                        >
                          {formatLanguageLabel(pat.preferred_language)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className="rounded-lg border px-2 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                          }}
                        >
                          Reading Comfort: {formatReadingComfort(pat.reading_comfort_level)}
                        </span>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/doctor/patients/${pat.patient_id}`}
                            className="rounded-lg border px-2.5 py-1 text-xs font-bold hover:opacity-80"
                            style={{
                              backgroundColor: "var(--ms-surface)",
                              borderColor: "var(--ms-border)",
                            }}
                          >
                            Patient Context
                          </Link>
                          <Link
                            href={`/doctor/consultations/new?patientId=${encodeURIComponent(pat.patient_id)}`}
                            className="rounded-lg border px-2.5 py-1 text-xs font-extrabold hover:opacity-90"
                            style={{
                              backgroundColor: "var(--ms-primary)",
                              borderColor: "var(--ms-primary)",
                              color: "var(--ms-primary-ink)",
                            }}
                          >
                            + Consult
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* RIGHT: Active Consultations & Safety Queue */}
          <section
            aria-label="Consultations and Safety Review Queue"
            className="ms-card space-y-4 p-4 sm:p-5 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">Consultations &amp; Review Queue</h2>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter consultations">
                {(
                  [
                    { key: "all", label: "All" },
                    { key: "draft", label: "Draft / Needs Review" },
                    { key: "blocked", label: "Blocked" },
                    { key: "approved", label: "Approved" },
                    { key: "shared", label: "Shared" },
                  ] as Array<{ key: ConsultFilter; label: string }>
                ).map((f) => {
                  const active = consultFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setConsultFilter(f.key)}
                      aria-pressed={active}
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition-colors"
                      style={{
                        backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                        borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                        color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm font-semibold">Loading consultations...</div>
            ) : filteredConsultations.length === 0 ? (
              <div
                className="rounded-xl border-2 border-dashed p-6 text-center space-y-3"
                style={{ borderColor: "var(--ms-border)" }}
              >
                <p className="text-sm font-bold">No consultations found for this filter.</p>
                <Link
                  href="/doctor/consultations/new?demo=judge-uri"
                  className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Create Consultation from Judge Demo Scenario</span>
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredConsultations.map((c) => {
                  const pat = patientLookup.get(c.patient_id);
                  const approvalStyle = getApprovalBadgeStyle(c.approval_status);
                  const integrityStyle = getIntegrityBadgeStyle(c.integrity_status);
                  const isShared = c.sharing_status === "shared_with_patient";

                  return (
                    <li
                      key={c.id}
                      className="rounded-xl border-2 p-4 space-y-3"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor:
                          c.integrity_status === "blocked"
                            ? "var(--ms-danger-border)"
                            : "var(--ms-border)",
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h3 className="text-base font-extrabold">{c.title}</h3>
                          <p className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                            Patient: {pat ? getPatientDisplayName(pat) : c.patient_id}
                            {c.visit_date ? ` • Visit: ${c.visit_date}` : ""}
                            {` • Source: ${c.source_type.replace(/_/g, " ")}`}
                            {` • Target: ${formatLanguageLabel(c.explanation_language)} (${c.explanation_depth.replace(/_/g, " ")})`}
                          </p>
                        </div>

                        <Link
                          href={`/doctor/consultations/${c.id}`}
                          className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-3.5 py-2 text-xs"
                        >
                          <span>Open Review</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
                          style={{
                            backgroundColor: integrityStyle.bg,
                            borderColor: integrityStyle.border,
                            color: integrityStyle.ink,
                          }}
                        >
                          {c.integrity_status === "blocked" ? (
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>{integrityStyle.label}</span>
                        </span>

                        <span
                          className="rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
                          style={{
                            backgroundColor: approvalStyle.bg,
                            borderColor: approvalStyle.border,
                            color: approvalStyle.ink,
                          }}
                        >
                          {approvalStyle.label}
                        </span>

                        <span
                          className="rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
                          style={{
                            backgroundColor: isShared
                              ? "var(--ms-prov-doctor-bg)"
                              : "var(--ms-surface-alt)",
                            borderColor: isShared
                              ? "var(--ms-prov-doctor-border)"
                              : "var(--ms-border)",
                          }}
                        >
                          {isShared ? "Shared with Patient" : "Private Draft"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Add / Link Demo Patient Modal */}
        {modalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-patient-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div
              className="ms-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6 space-y-4"
              style={{ backgroundColor: "var(--ms-surface)" }}
            >
              <div className="flex items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--ms-border)" }}>
                <h2 id="add-patient-modal-title" className="text-lg font-extrabold">
                  Add or Link Demo Patient
                </h2>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setModalOpen(false)}
                  className="tap-target rounded-lg border p-2"
                  style={{ borderColor: "var(--ms-border)" }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalMode("create");
                    setModalError(null);
                  }}
                  aria-pressed={modalMode === "create"}
                  className="tap-target inline-flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-extrabold"
                  style={{
                    backgroundColor:
                      modalMode === "create" ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                    borderColor:
                      modalMode === "create" ? "var(--ms-primary)" : "var(--ms-border)",
                    color: modalMode === "create" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  }}
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <span>Create Synthetic Patient</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalMode("link");
                    setModalError(null);
                  }}
                  aria-pressed={modalMode === "link"}
                  className="tap-target inline-flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-extrabold"
                  style={{
                    backgroundColor:
                      modalMode === "link" ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                    borderColor:
                      modalMode === "link" ? "var(--ms-primary)" : "var(--ms-border)",
                    color: modalMode === "link" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  }}
                >
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  <span>Link Existing Patient</span>
                </button>
              </div>

              <form onSubmit={(e) => void handleModalSubmit(e)} className="space-y-3.5">
                {modalMode === "create" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="modal-pat-name" className="mb-1 block text-xs font-extrabold uppercase">
                          Patient Name (Synthetic) *
                        </label>
                        <input
                          id="modal-pat-name"
                          type="text"
                          required
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="e.g., Sunita Devi"
                          className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        />
                      </div>

                      <div>
                        <label htmlFor="modal-pat-age" className="mb-1 block text-xs font-extrabold uppercase">
                          Age (Years)
                        </label>
                        <input
                          id="modal-pat-age"
                          type="number"
                          min={1}
                          max={120}
                          value={newAge}
                          onChange={(e) => setNewAge(e.target.value)}
                          className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor="modal-pat-gender" className="mb-1 block text-xs font-extrabold uppercase">
                          Gender
                        </label>
                        <select
                          id="modal-pat-gender"
                          value={newGender}
                          onChange={(e) =>
                            setNewGender(
                              e.target.value as "male" | "female" | "other" | "prefer_not_to_say"
                            )
                          }
                          className="tap-target w-full rounded-xl border-2 px-2 py-2 text-xs font-semibold"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        >
                          <option value="prefer_not_to_say">Prefer not to say</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="modal-pat-lang" className="mb-1 block text-xs font-extrabold uppercase">
                          Preferred Language
                        </label>
                        <select
                          id="modal-pat-lang"
                          value={newLanguage}
                          onChange={(e) => setNewLanguage(e.target.value as SupportedLanguage)}
                          className="tap-target w-full rounded-xl border-2 px-2 py-2 text-xs font-semibold"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        >
                          {LANGUAGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label} ({opt.native})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="modal-pat-comfort" className="mb-1 block text-xs font-extrabold uppercase">
                          Reading Comfort
                        </label>
                        <select
                          id="modal-pat-comfort"
                          value={newComfort}
                          onChange={(e) => setNewComfort(e.target.value as ReadingComfortLevel)}
                          className="tap-target w-full rounded-xl border-2 px-2 py-2 text-xs font-semibold"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        >
                          <option value="very_simple">Very Simple</option>
                          <option value="simple">Simple</option>
                          <option value="comfortable">Comfortable</option>
                          <option value="adaptive">Adaptive</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="modal-pat-email" className="mb-1 block text-xs font-bold">
                          Synthetic Email (Optional)
                        </label>
                        <input
                          id="modal-pat-email"
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="sunita.demo@medsarthi.local"
                          className="tap-target w-full rounded-xl border-2 px-3 py-2 text-xs"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        />
                      </div>

                      <div>
                        <label htmlFor="modal-pat-phone" className="mb-1 block text-xs font-bold">
                          Synthetic Phone (Optional)
                        </label>
                        <input
                          id="modal-pat-phone"
                          type="text"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          placeholder="+919800000099"
                          className="tap-target w-full rounded-xl border-2 px-3 py-2 text-xs"
                          style={{
                            backgroundColor: "var(--ms-surface)",
                            borderColor: "var(--ms-border)",
                            color: "var(--ms-ink)",
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label htmlFor="modal-link-ident" className="mb-1 block text-xs font-extrabold uppercase">
                        Existing Patient Email or Phone *
                      </label>
                      <input
                        id="modal-link-ident"
                        type="text"
                        required
                        value={linkIdentifier}
                        onChange={(e) => setLinkIdentifier(e.target.value)}
                        placeholder="ramesh.demo@medsarthi.local"
                        className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                        style={{
                          backgroundColor: "var(--ms-surface)",
                          borderColor: "var(--ms-border)",
                          color: "var(--ms-ink)",
                        }}
                      />
                    </div>

                    <div>
                      <label htmlFor="modal-link-scope" className="mb-1 block text-xs font-extrabold uppercase">
                        Consent Scope
                      </label>
                      <select
                        id="modal-link-scope"
                        value={consentScope}
                        onChange={(e) =>
                          setConsentScope(e.target.value as "linked_care" | "consultation_only")
                        }
                        className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                        style={{
                          backgroundColor: "var(--ms-surface)",
                          borderColor: "var(--ms-border)",
                          color: "var(--ms-ink)",
                        }}
                      >
                        <option value="linked_care">Linked Care (Consultations &amp; History)</option>
                        <option value="consultation_only">Consultation Only</option>
                      </select>
                    </div>
                  </>
                )}

                {modalError && (
                  <p
                    role="alert"
                    className="rounded-xl border-2 px-3 py-2 text-xs font-bold"
                    style={{
                      backgroundColor: "var(--ms-danger-bg)",
                      borderColor: "var(--ms-danger-border)",
                      color: "var(--ms-danger-ink)",
                    }}
                  >
                    {modalError}
                  </p>
                )}

                {modalSuccess && (
                  <p
                    role="status"
                    className="rounded-xl border-2 px-3 py-2 text-xs font-bold"
                    style={{
                      backgroundColor: "var(--ms-prov-doctor-bg)",
                      borderColor: "var(--ms-prov-doctor-border)",
                    }}
                  >
                    {modalSuccess}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="ms-btn-secondary tap-target px-4 py-2 text-xs font-bold"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={modalBusy}
                    className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs"
                  >
                    {modalBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    <span>
                      {modalBusy
                        ? "Submitting..."
                        : modalMode === "create"
                          ? "Create & Link Patient"
                          : "Send / Activate Link"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <DoctorWorkspaceFooter />
      </div>
  );
}

export default function DoctorDashboardPage() {
  return (
    <DoctorAuthGate>
      <DoctorDashboardContent />
    </DoctorAuthGate>
  );
}
