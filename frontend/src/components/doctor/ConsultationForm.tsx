"use client";

import React, { useMemo, useState } from "react";
import {
  FileText,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  buildConsultationSubmission,
  createEmptyMedication,
  createJudgeDemoValues,
  formatLanguageLabel,
  formatReadingComfort,
  getPatientDisplayName,
  parseFreeTextClinicalNote,
  type ConsultationFormValues,
  type StructuredMedicationRow,
} from "@/components/doctor/doctorHelpers";
import type { DoctorPatientLinkItem } from "@/lib/api";

const UNIT_OPTIONS = ["mg", "mcg", "g", "mL", "IU", "drops", "puff", "tsp", "tablet"];
const ROUTE_OPTIONS = [
  { value: "oral", label: "Oral (By mouth)" },
  { value: "ophthalmic", label: "Ophthalmic (Eye)" },
  { value: "otic", label: "Otic (Ear)" },
  { value: "nasal", label: "Nasal" },
  { value: "sublingual", label: "Sublingual" },
  { value: "inhaled", label: "Inhaled" },
  { value: "topical", label: "Topical (Skin)" },
  { value: "iv", label: "IV" },
  { value: "im", label: "IM" },
  { value: "sc", label: "SC" },
];

export interface ConsultationFormProps {
  patients: DoctorPatientLinkItem[];
  values: ConsultationFormValues;
  onChange: (next: ConsultationFormValues) => void;
  onSubmit: (
    values: ConsultationFormValues,
    options: { generateAfterSave: boolean }
  ) => Promise<void>;
  submitting?: boolean;
  errorMsg?: string | null;
  lockedInput?: boolean;
  isEditingExisting?: boolean;
  attachedContextSummary?: string | null;
}

export function ConsultationForm({
  patients,
  values,
  onChange,
  onSubmit,
  submitting = false,
  errorMsg,
  lockedInput = false,
  isEditingExisting = false,
  attachedContextSummary,
}: ConsultationFormProps) {
  const [freeTextOpen, setFreeTextOpen] = useState(false);
  const [parseFeedback, setParseFeedback] = useState<string | null>(null);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.patient_id === values.patient_id) ?? null,
    [patients, values.patient_id]
  );

  const previewSubmission = useMemo(() => buildConsultationSubmission(values), [values]);

  function setField<K extends keyof ConsultationFormValues>(
    key: K,
    val: ConsultationFormValues[K]
  ) {
    onChange({ ...values, [key]: val });
  }

  function updateMedication(
    idx: number,
    patch: Partial<StructuredMedicationRow>
  ) {
    const next = values.medications.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    onChange({ ...values, medications: next });
  }

  function addMedication() {
    onChange({ ...values, medications: [...values.medications, createEmptyMedication()] });
  }

  function removeMedication(idx: number) {
    const remaining = values.medications.filter((_, i) => i !== idx);
    onChange({
      ...values,
      medications: remaining.length > 0 ? remaining : [createEmptyMedication()],
    });
  }

  function handleParseFreeText() {
    if (!values.free_text_raw.trim()) return;
    const parsed = parseFreeTextClinicalNote(values.free_text_raw, values);
    onChange(parsed);
    setParseFeedback(
      "Extracted structured diagnoses, vitals, medications, and follow-up below. Please review and confirm every field."
    );
  }

  function handleLoadDemo() {
    const targetPid =
      values.patient_id || patients[0]?.patient_id || "";
    onChange(createJudgeDemoValues(targetPid));
    setParseFeedback(
      "Loaded Judge Demo Scenario (URI + Fever & Sore Throat + Hypertension). Review fields and click Save & Generate Explanation."
    );
  }

  async function handleFormSubmit(e: React.FormEvent, generateAfterSave: boolean) {
    e.preventDefault();
    await onSubmit(values, { generateAfterSave });
  }

  return (
    <form
      onSubmit={(e) => void handleFormSubmit(e, true)}
      className="space-y-5"
      aria-label="Structured consultation clinical entry form"
    >
      {/* Top Action Strip: Demo Preset + Quick Free-Text Mode Toggle */}
      <div
        className="ms-card flex flex-wrap items-center justify-between gap-3 p-4"
        style={{ backgroundColor: "var(--ms-surface-alt)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={lockedInput || submitting}
            onClick={handleLoadDemo}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-3.5 py-2 text-xs font-extrabold"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Load Judge Demo Scenario (URI + Fever &amp; Sore Throat)</span>
          </button>

          <button
            type="button"
            disabled={lockedInput}
            onClick={() => setFreeTextOpen((v) => !v)}
            aria-expanded={freeTextOpen}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-3.5 py-2 text-xs font-extrabold"
          >
            <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{freeTextOpen ? "Hide Quick Free-Text Mode" : "Quick Free-Text Mode"}</span>
          </button>
        </div>

        {lockedInput && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
            style={{
              backgroundColor: "var(--ms-prov-doctor-bg)",
              borderColor: "var(--ms-prov-doctor-border)",
            }}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Original doctor input locked</span>
          </span>
        )}
      </div>

      {attachedContextSummary && (
        <div
          role="status"
          className="rounded-xl border-2 px-4 py-3 text-xs font-semibold"
          style={{
            backgroundColor: "var(--ms-prov-doctor-bg)",
            borderColor: "var(--ms-prov-doctor-border)",
          }}
        >
          {attachedContextSummary}
        </div>
      )}

      {/* Quick Free-Text Mode Drawer */}
      {freeTextOpen && (
        <section
          aria-label="Quick Free-Text Mode"
          className="ms-card space-y-3 p-4"
          style={{
            backgroundColor: "var(--ms-prov-ai-bg)",
            borderColor: "var(--ms-prov-ai-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold">Quick Free-Text Clinical Note</h3>
              <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                Paste or type rapid clinical shorthand (e.g., BP, diagnoses, meds, doses, follow-up)
                and extract into the structured fields below for verification.
              </p>
            </div>
            <button
              type="button"
              disabled={lockedInput || !values.free_text_raw.trim()}
              onClick={handleParseFreeText}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs"
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              <span>Extract into Structured Fields</span>
            </button>
          </div>

          <label htmlFor="doc-free-text" className="sr-only">
            Quick Free-Text Clinical Note
          </label>
          <textarea
            id="doc-free-text"
            rows={4}
            disabled={lockedInput}
            value={values.free_text_raw}
            onChange={(e) => setField("free_text_raw", e.target.value)}
            placeholder="Example: BP 142/88 mmHg. Diagnoses: Acute Nasopharyngitis (URI), Hypertension. Symptoms: Fever, Sore throat. Rx: Paracetamol 500 mg SOS max 4 tablets in 24 hours; Amlodipine 5 mg once daily after breakfast — do NOT stop abruptly. Follow up in 5 days or sooner if fever > 102 F."
            className="w-full rounded-xl border-2 p-3 text-sm leading-relaxed"
            style={{
              backgroundColor: "var(--ms-surface)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          />
        </section>
      )}

      {parseFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border-2 px-4 py-2.5 text-xs font-bold"
          style={{
            backgroundColor: "var(--ms-primary-soft)",
            borderColor: "var(--ms-primary)",
            color: "var(--ms-ink)",
          }}
        >
          {parseFeedback}
        </div>
      )}

      {/* Patient Selection & Visit Header */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-extrabold">1. Patient Context &amp; Visit Details</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="consult-patient" className="mb-1.5 block text-xs font-extrabold uppercase">
              Linked Patient *
            </label>
            <select
              id="consult-patient"
              required
              disabled={isEditingExisting || lockedInput}
              value={values.patient_id}
              onChange={(e) => setField("patient_id", e.target.value)}
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              <option value="">Select linked patient...</option>
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {getPatientDisplayName(p)}
                  {p.age_years != null ? ` (${p.age_years} yrs)` : ""} —{" "}
                  {formatLanguageLabel(p.preferred_language)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="consult-title" className="mb-1.5 block text-xs font-extrabold uppercase">
              Consultation Title *
            </label>
            <input
              id="consult-title"
              type="text"
              required
              disabled={lockedInput}
              value={values.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g., OPD Follow-up: Fever & Cough"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="consult-visit-date" className="mb-1.5 block text-xs font-extrabold uppercase">
              Visit Date
            </label>
            <input
              id="consult-visit-date"
              type="date"
              disabled={lockedInput}
              value={values.visit_date}
              onChange={(e) => setField("visit_date", e.target.value)}
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        </div>

        {selectedPatient && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
            }}
          >
            <span className="font-extrabold">Patient Communication Baseline:</span>
            <span className="rounded-md border px-2 py-0.5" style={{ backgroundColor: "var(--ms-surface)" }}>
              Language: {formatLanguageLabel(selectedPatient.preferred_language)}
            </span>
            <span className="rounded-md border px-2 py-0.5" style={{ backgroundColor: "var(--ms-surface)" }}>
              Reading Comfort: {formatReadingComfort(selectedPatient.reading_comfort_level)}
            </span>
            {selectedPatient.age_years != null && (
              <span className="rounded-md border px-2 py-0.5" style={{ backgroundColor: "var(--ms-surface)" }}>
                Age: {selectedPatient.age_years}
              </span>
            )}
          </div>
        )}
      </section>

      {/* Clinical Findings */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-extrabold">2. Diagnoses, Symptoms &amp; Observations</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="consult-diagnoses" className="mb-1.5 block text-xs font-extrabold uppercase">
              Diagnoses (comma or line separated)
            </label>
            <textarea
              id="consult-diagnoses"
              rows={2}
              disabled={lockedInput}
              value={values.diagnoses}
              onChange={(e) => setField("diagnoses", e.target.value)}
              placeholder="e.g., Acute Nasopharyngitis (Upper Respiratory Infection), Hypertension"
              className="w-full rounded-xl border-2 p-2.5 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="consult-symptoms" className="mb-1.5 block text-xs font-extrabold uppercase">
              Patient Symptoms
            </label>
            <textarea
              id="consult-symptoms"
              rows={2}
              disabled={lockedInput}
              value={values.symptoms}
              onChange={(e) => setField("symptoms", e.target.value)}
              placeholder="e.g., Fever, Sore throat, Body ache"
              className="w-full rounded-xl border-2 p-2.5 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label htmlFor="consult-observations" className="mb-1.5 block text-xs font-extrabold uppercase">
              Clinical Observations
            </label>
            <input
              id="consult-observations"
              type="text"
              disabled={lockedInput}
              value={values.observations}
              onChange={(e) => setField("observations", e.target.value)}
              placeholder="e.g., Mild pharyngeal congestion, chest clear"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="consult-bp" className="mb-1.5 block text-xs font-extrabold uppercase">
              Blood Pressure (Vitals)
            </label>
            <input
              id="consult-bp"
              type="text"
              disabled={lockedInput}
              value={values.blood_pressure}
              onChange={(e) => setField("blood_pressure", e.target.value)}
              placeholder="142/88 mmHg"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="consult-temp" className="mb-1.5 block text-xs font-extrabold uppercase">
              Temperature (Optional)
            </label>
            <input
              id="consult-temp"
              type="text"
              disabled={lockedInput}
              value={values.temperature}
              onChange={(e) => setField("temperature", e.target.value)}
              placeholder="e.g., 100.8 F"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        </div>
      </section>

      {/* Structured Medications Builder */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold">3. Structured Medications &amp; Warnings</h2>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Exact doses, units, frequency, duration, route, and warnings are checked
              deterministically by the Safety Integrity Checker.
            </p>
          </div>
          <button
            type="button"
            disabled={lockedInput}
            onClick={addMedication}
            className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Medication</span>
          </button>
        </div>

        <div className="space-y-3">
          {values.medications.map((med, idx) => (
            <div
              key={idx}
              className="rounded-xl border-2 p-3.5 space-y-3"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wide">
                  Medication #{idx + 1}
                </span>
                {values.medications.length > 1 && (
                  <button
                    type="button"
                    disabled={lockedInput}
                    onClick={() => removeMedication(idx)}
                    className="tap-target inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-danger-border)",
                      color: "var(--ms-danger-ink)",
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor={`med-name-${idx}`} className="mb-1 block text-xs font-bold">
                    Medicine Name
                  </label>
                  <input
                    id={`med-name-${idx}`}
                    type="text"
                    disabled={lockedInput}
                    value={med.name}
                    onChange={(e) => updateMedication(idx, { name: e.target.value })}
                    placeholder="e.g., Paracetamol"
                    className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`med-dose-${idx}`} className="mb-1 block text-xs font-bold">
                      Dose
                    </label>
                    <input
                      id={`med-dose-${idx}`}
                      type="text"
                      disabled={lockedInput}
                      value={med.dose}
                      onChange={(e) => updateMedication(idx, { dose: e.target.value })}
                      placeholder="500"
                      className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-border)",
                        color: "var(--ms-ink)",
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor={`med-unit-${idx}`} className="mb-1 block text-xs font-bold">
                      Unit
                    </label>
                    <select
                      id={`med-unit-${idx}`}
                      disabled={lockedInput}
                      value={med.unit}
                      onChange={(e) => updateMedication(idx, { unit: e.target.value })}
                      className="tap-target w-full rounded-xl border-2 px-2 py-2 text-sm"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-border)",
                        color: "var(--ms-ink)",
                      }}
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor={`med-freq-${idx}`} className="mb-1 block text-xs font-bold">
                    Frequency / Schedule
                  </label>
                  <input
                    id={`med-freq-${idx}`}
                    type="text"
                    disabled={lockedInput}
                    value={med.frequency}
                    onChange={(e) => updateMedication(idx, { frequency: e.target.value })}
                    placeholder="Once daily / BD / SOS"
                    className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  />
                </div>

                <div>
                  <label htmlFor={`med-dur-${idx}`} className="mb-1 block text-xs font-bold">
                    Duration
                  </label>
                  <input
                    id={`med-dur-${idx}`}
                    type="text"
                    disabled={lockedInput}
                    value={med.duration}
                    onChange={(e) => updateMedication(idx, { duration: e.target.value })}
                    placeholder="5 days / Continue regularly"
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
                  <label htmlFor={`med-route-${idx}`} className="mb-1 block text-xs font-bold">
                    Route
                  </label>
                  <select
                    id={`med-route-${idx}`}
                    disabled={lockedInput}
                    value={med.route}
                    onChange={(e) => updateMedication(idx, { route: e.target.value })}
                    className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  >
                    {ROUTE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`med-timing-${idx}`} className="mb-1 block text-xs font-bold">
                    Food / Timing Note
                  </label>
                  <input
                    id={`med-timing-${idx}`}
                    type="text"
                    disabled={lockedInput}
                    value={med.timing_with_food}
                    onChange={(e) => updateMedication(idx, { timing_with_food: e.target.value })}
                    placeholder="After breakfast / Before meals"
                    className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  />
                </div>

                <div>
                  <label htmlFor={`med-warn-${idx}`} className="mb-1 block text-xs font-bold">
                    Warnings &amp; Negations (Do NOT ...)
                  </label>
                  <input
                    id={`med-warn-${idx}`}
                    type="text"
                    disabled={lockedInput}
                    value={med.warnings}
                    onChange={(e) => updateMedication(idx, { warnings: e.target.value })}
                    placeholder="e.g., Do NOT exceed 4 tablets in 24 hours"
                    className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tests, Allergies, Follow-up & Notes */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-extrabold">
          4. Tests Advised, Allergies, Follow-up &amp; Clinical Notes
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="consult-tests" className="mb-1.5 block text-xs font-extrabold uppercase">
              Tests Advised
            </label>
            <input
              id="consult-tests"
              type="text"
              disabled={lockedInput}
              value={values.tests_advised}
              onChange={(e) => setField("tests_advised", e.target.value)}
              placeholder="e.g., CBC if fever persists, Home BP tracking"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="consult-allergies" className="mb-1.5 block text-xs font-extrabold uppercase">
              Known Drug Allergies
            </label>
            <input
              id="consult-allergies"
              type="text"
              disabled={lockedInput}
              value={values.allergies}
              onChange={(e) => setField("allergies", e.target.value)}
              placeholder="e.g., Penicillin (leave blank if none recorded)"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="consult-fu-date" className="mb-1.5 block text-xs font-extrabold uppercase">
              Follow-up Date
            </label>
            <input
              id="consult-fu-date"
              type="date"
              disabled={lockedInput}
              value={values.follow_up_date}
              onChange={(e) => setField("follow_up_date", e.target.value)}
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="consult-fu-note" className="mb-1.5 block text-xs font-extrabold uppercase">
              Follow-up &amp; Return Precautions
            </label>
            <input
              id="consult-fu-note"
              type="text"
              disabled={lockedInput}
              value={values.follow_up_note}
              onChange={(e) => setField("follow_up_note", e.target.value)}
              placeholder="e.g., 5 days (or sooner if fever > 102 F or breathing difficulty)"
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="consult-doc-expl" className="mb-1.5 block text-xs font-extrabold uppercase">
              Doctor Explanation to Patient
            </label>
            <textarea
              id="consult-doc-expl"
              rows={3}
              disabled={lockedInput}
              value={values.doctor_explanation}
              onChange={(e) => setField("doctor_explanation", e.target.value)}
              placeholder="Plain guidance you gave the patient during the visit..."
              className="w-full rounded-xl border-2 p-2.5 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="consult-notes" className="mb-1.5 block text-xs font-extrabold uppercase">
              Additional Clinical Notes
            </label>
            <textarea
              id="consult-notes"
              rows={3}
              disabled={lockedInput}
              value={values.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Supportive care, hydration, or clinical context..."
              className="w-full rounded-xl border-2 p-2.5 text-sm"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        </div>
      </section>

      {/* Immutable Source Preview */}
      <section
        className="rounded-2xl border-2 p-4 space-y-2"
        style={{
          backgroundColor: "var(--ms-prov-doctor-bg)",
          borderColor: "var(--ms-prov-doctor-border)",
        }}
      >
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase">
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Composed Immutable Doctor Record Preview (Locked on Generation)</span>
        </div>
        <p className="text-xs leading-relaxed font-medium">
          {previewSubmission.original_doctor_input ||
            "Enter diagnoses, medications, or clinical notes above to preview the immutable doctor source."}
        </p>
      </section>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-danger-bg)",
            borderColor: "var(--ms-danger-border)",
            color: "var(--ms-danger-ink)",
          }}
        >
          {errorMsg}
        </p>
      )}

      {!lockedInput && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={(e) => void handleFormSubmit(e, false)}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{submitting ? "Saving..." : isEditingExisting ? "Save Structured Edits" : "Save Draft Consultation"}</span>
          </button>

          {!isEditingExisting && (
            <button
              type="submit"
              disabled={submitting}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{submitting ? "Creating & Generating..." : "Save & Generate Simple Explanation"}</span>
            </button>
          )}
        </div>
      )}
    </form>
  );
}
