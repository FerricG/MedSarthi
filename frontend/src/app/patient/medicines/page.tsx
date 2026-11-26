"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Lock,
  Pill,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DiagramViewer } from "@/components/DiagramViewer";
import { ProvenanceCards } from "@/components/ProvenanceCards";
import { useI18n } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  type KBTermResult,
  type MedicationListItem,
  type MedicineExplanationResult,
} from "@/lib/api";

function MedicinesWorkspace() {
  const { t, locale } = useI18n();

  const [meds, setMeds] = useState<MedicationListItem[]>([]);
  const [selectedMed, setSelectedMed] = useState<MedicationListItem | null>(null);
  const [explained, setExplained] = useState<MedicineExplanationResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KBTermResult[]>([]);

  const [loading, setLoading] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadMeds() {
      setLoading(true);
      try {
        const items = await api.listMedications();
        if (!active) return;
        setMeds(items);
        if (items.length > 0) {
          setSelectedMed(items[0]);
          void explainSelected(items[0]);
        }
      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof ApiError ? err.message : "Could not load your medicines.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadMeds();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function explainSelected(med: MedicationListItem, langOverride = locale) {
    setSelectedMed(med);
    setExplaining(true);
    setErrorMsg(null);
    try {
      const raw = await api.explainMedicine({
        medicine_name: med.medicine_name,
        doctor_dosage_instruction: med.locked_instruction,
        consultation_id: med.consultation_id ?? undefined,
        target_language: langOverride,
      });
      const mp = raw.medication_parts ?? {};
      const provGen = raw.provenance?.general_education ?? [];
      const citationsFromProv = provGen.flatMap((g) =>
        g.citations?.length
          ? g.citations
          : g.source_name && g.source_url
            ? [{ source_name: g.source_name, source_url: g.source_url }]
            : []
      );
      setExplained({
        ...raw,
        drug_class: raw.drug_class ?? mp.drug_category,
        what_it_is:
          raw.what_it_is ??
          mp.what_it_is ??
          raw.provenance?.ai_simplified?.summary ??
          "Prescribed medicine",
        common_purposes: raw.common_purposes ?? mp.common_uses ?? "",
        how_it_works: raw.how_it_works ?? mp.general_mechanism ?? "",
        why_prescribed_for_you:
          raw.why_prescribed_for_you ??
          mp.prescribed_reason ??
          "Ask your doctor if the specific reason was not written on your note.",
        common_side_effects: raw.common_side_effects ?? mp.common_side_effects ?? [],
        serious_warnings:
          raw.serious_warnings ?? raw.red_flag_side_effects ?? mp.warnings ?? [],
        precautions: raw.precautions ?? mp.precautions ?? [],
        food_and_interactions: raw.food_and_interactions ?? mp.food_and_interactions,
        adherence_guidance: raw.adherence_guidance ?? mp.adherence_importance ?? "",
        questions_for_doctor: raw.questions_for_doctor ?? mp.questions_for_doctor ?? [],
        citations: raw.citations ?? citationsFromProv,
        diagram: raw.diagram ?? raw.visual_diagrams?.[0] ?? null,
      });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not explain this medicine.");
    } finally {
      setExplaining(false);
    }
  }

  async function handleSearchMedicine(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await api.searchMedicines(searchQuery.trim(), locale, 5);
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    }
  }

  return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Understand my medicine</h1>
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-2xl border-2 p-4 text-sm font-bold"
            style={{
              backgroundColor: "var(--ms-prov-uncertain-bg)",
              borderColor: "var(--ms-prov-uncertain-border)",
            }}
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--ms-prov-uncertain-border)" }} aria-hidden="true" />
            <span>{t.safety.medicineProhibition}</span>
          </div>
        </header>

        {/* Prescribed Medicines List */}
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">Your Prescribed Medicines</h2>
          {loading ? (
            <div className="ms-card p-6 text-center text-sm font-bold">Loading your medicines...</div>
          ) : meds.length === 0 ? (
            <div className="ms-card p-6 text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              No shared prescription medicines found yet. You can still search any medicine below to learn general information.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {meds.map((med, idx) => {
                const active = selectedMed?.medicine_name === med.medicine_name && selectedMed?.dose === med.dose;
                return (
                  <button
                    key={`${med.medicine_name}-${idx}`}
                    type="button"
                    onClick={() => void explainSelected(med)}
                    className="ms-card tap-target-lg flex items-start gap-3 p-4 text-left"
                    style={{
                      backgroundColor: active ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <Pill className="mt-1 h-6 w-6 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                    <div className="space-y-1">
                      <span className="block text-lg font-extrabold">
                        {med.medicine_name} {med.dose}
                      </span>
                      <span className="block text-sm font-semibold">{med.frequency}</span>
                      {med.warnings.length > 0 && (
                        <span className="block text-xs font-bold" style={{ color: "var(--ms-danger-ink)" }}>
                          Warning: {med.warnings[0]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Search General Medicine KB */}
        <section className="ms-card p-4 space-y-3">
          <form onSubmit={(e) => void handleSearchMedicine(e)} className="flex flex-wrap gap-2">
            <label htmlFor="med-search" className="sr-only">
              Search a medicine name
            </label>
            <input
              id="med-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Look up any medicine (e.g., Metformin, Azithromycin, Paracetamol)..."
              className="tap-target flex-1 rounded-xl border-2 px-4 py-2.5 text-sm"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
            <button type="submit" className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search Medicine</span>
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {searchResults.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() =>
                    void explainSelected({
                      medicine_name: item.canonical_name,
                      dose: "",
                      frequency: "No doctor prescription attached",
                      warnings: [],
                      locked_instruction: "",
                    })
                  }
                  className="tap-target rounded-xl border-2 px-3.5 py-2 text-sm font-bold"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: "var(--ms-primary)",
                  }}
                >
                  {item.canonical_name}
                </button>
              ))}
            </div>
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

        {/* Locked Doctor Prescription Banner */}
        {selectedMed && (
          <section
            className="rounded-2xl border-2 border-l-8 p-5 space-y-2"
            style={{
              backgroundColor: "var(--ms-prov-doctor-bg)",
              borderColor: "var(--ms-prov-doctor-border)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <Lock className="h-5 w-5" aria-hidden="true" />
                <span>Doctor&apos;s Exact Prescription (Unchanged)</span>
              </h2>
              <button
                type="button"
                disabled={explaining}
                onClick={() => void explainSelected(selectedMed, locale)}
                className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-4 text-xs"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>{explaining ? "Updating..." : "Refresh in Current Language"}</span>
              </button>
            </div>
            {selectedMed.locked_instruction ? (
              <p className="text-base font-bold">{selectedMed.locked_instruction}</p>
            ) : (
              <p className="text-sm font-semibold">
                General medicine guide only — no specific dose was provided by your doctor here.
                Ask your doctor or pharmacist for your exact dose.
              </p>
            )}
          </section>
        )}

        {/* 10-Part KB-Grounded Medicine Breakdown */}
        {explaining ? (
          <div className="ms-card p-8 text-center font-bold">Loading medicine guide...</div>
        ) : explained && (
          <div className="space-y-5">
            <AudioPlayer
              text={`${explained.medicine_name}. ${explained.what_it_is ?? ""} ${explained.why_prescribed_for_you ?? ""} ${(explained.serious_warnings ?? []).join(". ")}`}
              language={locale}
              label={`Listen to ${explained.medicine_name} guide`}
            />

            <section className="ms-card p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-extrabold">{explained.medicine_name}</h2>
                  {explained.drug_class && (
                    <p className="text-sm font-bold" style={{ color: "var(--ms-primary)" }}>
                      Category: {explained.drug_class}
                    </p>
                  )}
                </div>
                {explained.brand_examples && explained.brand_examples.length > 0 && (
                  <span className="rounded-xl border px-3 py-1 text-xs font-bold" style={{ borderColor: "var(--ms-border)" }}>
                    Common brands: {explained.brand_examples.join(", ")}
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">1. What this medicine is</h3>
                  <p className="text-sm leading-relaxed">{explained.what_it_is}</p>
                </div>

                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">2. Common medical uses</h3>
                  <p className="text-sm leading-relaxed">{explained.common_purposes}</p>
                </div>

                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">3. How it works</h3>
                  <p className="text-sm leading-relaxed">{explained.how_it_works}</p>
                </div>

                <div
                  className="rounded-xl border-2 p-4 space-y-1"
                  style={{
                    backgroundColor: "var(--ms-prov-ai-bg)",
                    borderColor: "var(--ms-prov-ai-border)",
                  }}
                >
                  <h3 className="text-sm font-extrabold uppercase">4. Why it was prescribed for you</h3>
                  <p className="text-sm font-semibold leading-relaxed">{explained.why_prescribed_for_you}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">5. Common Side Effects</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(explained.common_side_effects ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div
                  className="rounded-xl border-2 p-4 space-y-2"
                  style={{
                    backgroundColor: "var(--ms-danger-bg)",
                    borderColor: "var(--ms-danger-border)",
                    color: "var(--ms-danger-ink)",
                  }}
                >
                  <h3 className="text-sm font-extrabold uppercase flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <span>6. Serious Warnings — When to Get Help</span>
                  </h3>
                  <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
                    {(explained.serious_warnings ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">7. Precautions &amp; Food / Interactions</h3>
                  {explained.food_and_interactions && (
                    <p className="text-sm font-medium">{explained.food_and_interactions}</p>
                  )}
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(explained.precautions ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">8. Why Taking It On Schedule Matters</h3>
                  <p className="text-sm leading-relaxed">{explained.adherence_guidance}</p>
                </div>
              </div>

              {(explained.questions_for_doctor ?? []).length > 0 && (
                <div
                  className="rounded-xl border p-4 space-y-2"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <h3 className="text-sm font-extrabold uppercase">9. Helpful Questions for Your Doctor or Pharmacist</h3>
                  <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
                    {(explained.questions_for_doctor ?? []).map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {explained.citations && explained.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {explained.citations.map((cit, i) => (
                    <a
                      key={i}
                      href={cit.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-target inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold underline"
                      style={{ borderColor: "var(--ms-border)" }}
                    >
                      <span>Information source: {cit.source_name}</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            {explained.provenance && <ProvenanceCards provenance={explained.provenance} />}

            <DiagramViewer
              diagramId={
                explained.diagram?.id ||
                (explained.medicine_name.toLowerCase().includes("amlodipine")
                  ? "heart_circulation_bp"
                  : "digestive_med_pathway")
              }
              diagram={explained.diagram}
              language={locale}
            />
          </div>
        )}
      </div>
  );
}

export default function PatientMedicinesPage() {
  return (
    <PatientGate>
      <MedicinesWorkspace />
    </PatientGate>
  );
}
