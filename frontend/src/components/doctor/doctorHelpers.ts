import {
  api,
  apiRequest,
  normalizeIntegrityReport,
  normalizeProvenance,
  type ConsultationDetail,
  type ConsultationMedication,
  type DoctorPatientLinkItem,
  type ExplanationDepth,
  type IntegrityReport,
  type MedicationListItem,
  type ProvenancePayload,
  type ReadingComfortLevel,
  type SupportedLanguage,
} from "@/lib/api";

export interface StructuredMedicationRow {
  name: string;
  dose: string;
  unit: string;
  frequency: string;
  duration: string;
  route: string;
  timing_with_food: string;
  warnings: string;
}

export interface ConsultationFormValues {
  patient_id: string;
  title: string;
  visit_date: string;
  diagnoses: string;
  symptoms: string;
  observations: string;
  blood_pressure: string;
  temperature: string;
  medications: StructuredMedicationRow[];
  tests_advised: string;
  allergies: string;
  follow_up_date: string;
  follow_up_note: string;
  doctor_explanation: string;
  notes: string;
  free_text_raw: string;
}

export const LANGUAGE_OPTIONS: Array<{ value: SupportedLanguage; label: string; native: string }> = [
  { value: "en", label: "English", native: "English" },
  { value: "hi", label: "Hindi", native: "हिन्दी" },
  { value: "hi-Latn", label: "Hinglish", native: "Hinglish" },
];

export const DEPTH_OPTIONS: Array<{ value: ExplanationDepth; label: string; hint: string }> = [
  { value: "very_simple", label: "Very Simple", hint: "Short everyday sentences & concrete actions" },
  { value: "simple", label: "Simple", hint: "Plain language with everyday meanings for medical words" },
  { value: "detailed", label: "Detailed", hint: "Anatomy, rationale, and structured precautions" },
  { value: "deep_dive", label: "Deep Dive", hint: "Comprehensive mechanism-rich education & unknowns" },
];

export const INTEGRITY_RULE_CATALOG: Array<{
  num: number;
  label: string;
  category: string;
  flagKey?: keyof Pick<
    IntegrityReport,
    | "dosage_preserved"
    | "frequency_preserved"
    | "duration_preserved"
    | "measurements_preserved"
    | "negation_preserved"
  >;
}> = [
  { num: 1, label: "Medicine Names & LASA Guard", category: "medicine" },
  { num: 2, label: "Dosage & Fractions", category: "dosage", flagKey: "dosage_preserved" },
  { num: 3, label: "Units (mg / mcg / mL)", category: "units" },
  { num: 4, label: "Frequency & Slot Timing", category: "frequency", flagKey: "frequency_preserved" },
  { num: 5, label: "Duration & Chronic Hold", category: "duration", flagKey: "duration_preserved" },
  { num: 6, label: "Route of Administration", category: "route" },
  { num: 7, label: "Calendar Dates & Timelines", category: "dates" },
  { num: 8, label: "Measurements & Vitals", category: "measurements", flagKey: "measurements_preserved" },
  { num: 9, label: "Lab Values & Scales", category: "labs" },
  { num: 10, label: "Negations & Findings", category: "negations", flagKey: "negation_preserved" },
  { num: 11, label: "Allergies & NKDA Parity", category: "allergies" },
  { num: 12, label: "Warnings & Max Limits", category: "warnings" },
  { num: 13, label: "Follow-up & Return Signs", category: "follow_up" },
];

export function formatDateOffset(daysFromToday: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysFromToday);
  return dt.toISOString().slice(0, 10);
}

export function createEmptyMedication(): StructuredMedicationRow {
  return {
    name: "",
    dose: "",
    unit: "mg",
    frequency: "",
    duration: "",
    route: "oral",
    timing_with_food: "",
    warnings: "",
  };
}

export function createJudgeDemoValues(patientId = ""): ConsultationFormValues {
  const today = formatDateOffset(0);
  const followUpDate = formatDateOffset(5);
  const rawNote =
    "SYNTHETIC CASE: Acute Nasopharyngitis (Upper Respiratory Infection) with Fever & Sore Throat; Hypertension. " +
    "BP 142/88 mmHg. Rx: 1) Paracetamol 500 mg SOS for fever/body ache, max 4 tablets in 24 hours. " +
    "2) Continue Amlodipine 5 mg once daily every morning after breakfast — do NOT stop abruptly. " +
    "Follow up in 5 days or sooner if fever > 102 F or breathing difficulty.";

  return {
    patient_id: patientId,
    title: "Acute Nasopharyngitis (URI), Fever & Sore Throat — OPD Visit (Synthetic)",
    visit_date: today,
    diagnoses: "Acute Nasopharyngitis (Upper Respiratory Infection), Hypertension",
    symptoms: "Fever, Sore throat, Mild body ache",
    observations: "BP 142/88 mmHg, Mild throat redness, Chest clear on auscultation",
    blood_pressure: "142/88 mmHg",
    temperature: "",
    medications: [
      {
        name: "Paracetamol",
        dose: "500",
        unit: "mg",
        frequency: "SOS (as needed for fever/body ache)",
        duration: "3 days",
        route: "oral",
        timing_with_food: "After food if needed",
        warnings: "Do NOT exceed 4 tablets in 24 hours",
      },
      {
        name: "Amlodipine",
        dose: "5",
        unit: "mg",
        frequency: "Once daily every morning after breakfast",
        duration: "Continue regularly",
        route: "oral",
        timing_with_food: "After breakfast",
        warnings: "Do NOT stop abruptly",
      },
    ],
    tests_advised: "Monitor temperature at home, Home blood pressure tracking",
    allergies: "",
    follow_up_date: followUpDate,
    follow_up_note: "5 days (or sooner if fever > 102 F or breathing difficulty)",
    doctor_explanation:
      "Your fever and sore throat are from an upper respiratory infection affecting the nose and upper throat (not pneumonia). Keep taking your daily morning blood pressure tablet after breakfast and use Paracetamol only when needed.",
    notes: "Rest and stay well hydrated with warm fluids.",
    free_text_raw: rawNote,
  };
}

export function splitCommaLines(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildConsultationSubmission(values: ConsultationFormValues): {
  original_doctor_input: string;
  structured_data: Record<string, unknown>;
} {
  const diagnoses = splitCommaLines(values.diagnoses);
  const symptoms = splitCommaLines(values.symptoms);
  const observations = splitCommaLines(values.observations);
  const testsAdvised = splitCommaLines(values.tests_advised);
  const allergies = splitCommaLines(values.allergies);

  const vitals: Record<string, string> = {};
  if (values.blood_pressure.trim()) {
    vitals.blood_pressure = values.blood_pressure.trim();
  }
  if (values.temperature.trim()) {
    vitals.temperature = values.temperature.trim();
  }

  const validMeds = values.medications.filter((m) => m.name.trim().length > 0);
  const structuredMeds: ConsultationMedication[] = validMeds.map((m) => {
    const combinedDose = [m.dose.trim(), m.unit.trim()].filter(Boolean).join(" ");
    const warningList = splitCommaLines(m.warnings);
    return {
      name: m.name.trim(),
      medicine_name: m.name.trim(),
      dose: combinedDose,
      dosage_value: m.dose.trim(),
      dosage_unit: m.unit.trim(),
      frequency: m.frequency.trim(),
      frequency_text: m.frequency.trim(),
      duration: m.duration.trim(),
      duration_text: m.duration.trim(),
      route: m.route.trim() || "oral",
      timing_with_food: m.timing_with_food.trim() || undefined,
      warnings: warningList,
      negations_and_warnings: warningList,
    };
  });

  const sections: string[] = [];
  if (Object.keys(vitals).length > 0) {
    sections.push(
      `Vitals: ${Object.entries(vitals)
        .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
        .join(", ")}.`
    );
  }
  if (diagnoses.length > 0) {
    sections.push(`Diagnoses: ${diagnoses.join(", ")}.`);
  }
  if (symptoms.length > 0) {
    sections.push(`Symptoms: ${symptoms.join(", ")}.`);
  }
  if (observations.length > 0) {
    sections.push(`Observations: ${observations.join("; ")}.`);
  }
  if (validMeds.length > 0) {
    const rxLines = validMeds.map((m, idx) => {
      const doseText = [m.dose.trim(), m.unit.trim()].filter(Boolean).join(" ");
      const parts = [m.name.trim(), doseText, m.frequency.trim(), m.duration.trim(), m.route.trim()]
        .filter(Boolean)
        .join(" ");
      const extra = [m.timing_with_food.trim(), m.warnings.trim()].filter(Boolean).join("; ");
      return `${idx + 1}) ${parts}${extra ? ` — ${extra}` : ""}`;
    });
    sections.push(`Rx: ${rxLines.join(" | ")}.`);
  }
  if (testsAdvised.length > 0) {
    sections.push(`Tests advised: ${testsAdvised.join(", ")}.`);
  }
  if (allergies.length > 0) {
    sections.push(`Allergies: ${allergies.join(", ")}.`);
  }
  if (values.follow_up_note.trim() || values.follow_up_date.trim()) {
    const fuParts = [
      values.follow_up_note.trim()
        ? `Follow up in ${values.follow_up_note.trim().replace(/^follow\s*up\s*(in)?\s*/i, "")}`
        : "",
      values.follow_up_date.trim() ? `Follow-up date: ${values.follow_up_date.trim()}` : "",
    ].filter(Boolean);
    sections.push(`${fuParts.join(". ")}.`);
  }
  if (values.doctor_explanation.trim()) {
    sections.push(`Doctor guidance: ${values.doctor_explanation.trim()}`);
  }
  if (values.notes.trim()) {
    sections.push(`Notes: ${values.notes.trim()}`);
  }

  const composed = sections.join(" ").trim();
  const originalDoctorInput = composed || values.free_text_raw.trim();

  return {
    original_doctor_input: originalDoctorInput,
    structured_data: {
      diagnoses,
      symptoms,
      observations,
      vitals,
      medications: structuredMeds,
      tests_advised: testsAdvised,
      allergies,
      follow_up: values.follow_up_note.trim() || values.follow_up_date.trim() || undefined,
      follow_up_date: values.follow_up_date.trim() || undefined,
      doctor_explanation: values.doctor_explanation.trim() || undefined,
      notes: values.notes.trim() || undefined,
    },
  };
}

/**
 * Deterministic client-side clinical text parser for Quick Free-Text Mode.
 * Extracts previewable fields for clinician confirmation (never auto-approved).
 */
export function parseFreeTextClinicalNote(
  rawText: string,
  current: ConsultationFormValues
): ConsultationFormValues {
  const text = rawText.trim();
  if (!text) return current;

  const bpMatch = text.match(/\b(?:bp|blood\s*pressure)?\s*(\d{2,3}\s*\/\s*\d{2,3})\s*(?:mmhg)?/i);
  const tempMatch = text.match(/(\d{2,3}(?:\.\d+)?)\s*°?\s*([FC])\b/i);
  const diagMatch = text.match(/(?:diagnos(?:is|es)|dx)\s*:\s*([^\.\n]+)/i);
  const sympMatch = text.match(/(?:symptoms?|c\/o|complaints?)\s*:\s*([^\.\n]+)/i);
  const allergyMatch = text.match(/(?:allerg(?:y|ies))\s*:\s*([^\.\n]+)/i);
  const testsMatch = text.match(/(?:tests?\s*advised|advised\s*tests?)\s*:\s*([^\.\n]+)/i);
  const fuMatch = text.match(/(?:follow\s*-?\s*up(?:\s+in)?\s+[^\.\n]+)/i);

  const parsedMeds: StructuredMedicationRow[] = [];
  const medRegex =
    /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|mL|IU|drops|puff|tsp)\b([^\n.;]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = medRegex.exec(text)) !== null) {
    const tail = (m[4] || "").trim();
    const warnMatches = tail.match(/(?:do\s+not\s+[^,;]+|never\s+[^,;]+|max\s+[^,;]+|avoid\s+[^,;]+)/gi);
    const durMatch = tail.match(/(?:for|x)\s+(\d+\s+(?:days?|weeks?|months?))/i);
    parsedMeds.push({
      name: m[1].trim(),
      dose: m[2].trim(),
      unit: m[3].trim(),
      frequency: tail.replace(/(?:do\s+not|never|max|avoid)[^,;]*/gi, "").trim() || "As directed",
      duration: durMatch ? durMatch[1] : "",
      route: /eye|ophthalmic/i.test(tail)
        ? "ophthalmic"
        : /ear|otic/i.test(tail)
          ? "otic"
          : /inhaler/i.test(tail)
            ? "inhaled"
            : "oral",
      timing_with_food: /after\s+breakfast/i.test(tail)
        ? "After breakfast"
        : /after\s+(?:food|meal)/i.test(tail)
          ? "After food"
          : /before\s+(?:food|meal)/i.test(tail)
            ? "Before food"
            : "",
      warnings: warnMatches ? warnMatches.join("; ") : "",
    });
  }

  const firstLine = text.split(/\n+/)[0]?.slice(0, 90).trim() || "Clinical Consultation";

  return {
    ...current,
    title: current.title || firstLine,
    blood_pressure: bpMatch ? `${bpMatch[1].replace(/\s+/g, "")} mmHg` : current.blood_pressure,
    temperature: tempMatch ? `${tempMatch[1]} ${tempMatch[2].toUpperCase()}` : current.temperature,
    diagnoses: diagMatch ? diagMatch[1].trim() : current.diagnoses,
    symptoms: sympMatch ? sympMatch[1].trim() : current.symptoms,
    allergies: allergyMatch ? allergyMatch[1].trim() : current.allergies,
    tests_advised: testsMatch ? testsMatch[1].trim() : current.tests_advised,
    follow_up_note: fuMatch ? fuMatch[0].replace(/^follow\s*-?\s*up\s*(?:in\s*)?/i, "").trim() : current.follow_up_note,
    medications: parsedMeds.length > 0 ? parsedMeds : current.medications,
    notes: text,
    free_text_raw: rawText,
  };
}

/**
 * Normalize either flat ConsultationDetail (api.ts) or nested backend DTO payloads.
 */
export function normalizeConsultationDetail(
  raw: unknown,
  fallback?: ConsultationDetail | null
): ConsultationDetail {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base =
    obj.consultation && typeof obj.consultation === "object"
      ? (obj.consultation as Record<string, unknown>)
      : obj;

  const rawExplanation =
    base.generated_explanation ??
    obj.explanation ??
    obj.latest_explanation ??
    fallback?.generated_explanation ??
    null;

  let generatedExplanation: ProvenancePayload | null = null;
  if (rawExplanation) {
    generatedExplanation = normalizeProvenance(rawExplanation);
  }

  const rawIntegrity =
    base.integrity_report ??
    obj.safety_validation ??
    obj.latest_safety_validation ??
    obj.integrity_report ??
    fallback?.integrity_report ??
    null;

  const integrityStatus =
    ((base.integrity_status ??
      (rawIntegrity && typeof rawIntegrity === "object"
        ? (rawIntegrity as Record<string, unknown>).status
        : undefined) ??
      fallback?.integrity_status ??
      "unchecked") as ConsultationDetail["integrity_status"]);

  const integrityReport = rawIntegrity
    ? normalizeIntegrityReport(rawIntegrity, integrityStatus)
    : null;

  const structuredData =
    (base.structured_data && typeof base.structured_data === "object"
      ? (base.structured_data as ConsultationDetail["structured_data"])
      : fallback?.structured_data) ?? {};

  return {
    id: String(base.id ?? obj.consultation_id ?? fallback?.id ?? ""),
    patient_id: String(base.patient_id ?? fallback?.patient_id ?? ""),
    doctor_id: (base.doctor_id as string | null) ?? fallback?.doctor_id ?? null,
    doctor_name: (base.doctor_name as string | null) ?? fallback?.doctor_name ?? null,
    source_type: String(base.source_type ?? fallback?.source_type ?? "doctor_entered"),
    title: String(base.title ?? fallback?.title ?? "Untitled Consultation"),
    visit_date: (base.visit_date as string | null) ?? fallback?.visit_date ?? null,
    explanation_language: String(
      base.explanation_language ?? fallback?.explanation_language ?? "en"
    ),
    explanation_depth: String(base.explanation_depth ?? fallback?.explanation_depth ?? "simple"),
    approval_status: String(base.approval_status ?? fallback?.approval_status ?? "draft"),
    sharing_status: String(base.sharing_status ?? fallback?.sharing_status ?? "private_draft"),
    integrity_status: integrityStatus,
    created_at: String(base.created_at ?? fallback?.created_at ?? new Date().toISOString()),
    updated_at: (base.updated_at as string | undefined) ?? fallback?.updated_at,
    original_doctor_input: String(
      base.original_doctor_input ?? fallback?.original_doctor_input ?? ""
    ),
    original_input_hash: (base.original_input_hash as string | undefined) ?? fallback?.original_input_hash,
    original_input_locked_at:
      (base.original_input_locked_at as string | null) ?? fallback?.original_input_locked_at ?? null,
    structured_data: structuredData,
    generated_explanation: generatedExplanation,
    integrity_report: integrityReport,
    visual_diagrams:
      (base.visual_diagrams as ConsultationDetail["visual_diagrams"]) ??
      (obj.visual_diagrams as ConsultationDetail["visual_diagrams"]) ??
      fallback?.visual_diagrams,
    highlighted_terms:
      (base.highlighted_terms as string[] | undefined) ?? fallback?.highlighted_terms,
  };
}

export function getPatientDisplayName(patient: DoctorPatientLinkItem): string {
  return patient.display_name || patient.name || "Unnamed Patient";
}

export function formatLanguageLabel(lang?: string | null): string {
  if (lang === "hi") return "हिन्दी (Hindi)";
  if (lang === "hi-Latn") return "Hinglish";
  return "English";
}

export function formatReadingComfort(comfort?: ReadingComfortLevel | string | null): string {
  switch (comfort) {
    case "very_simple":
      return "Very Simple";
    case "simple":
      return "Simple";
    case "comfortable":
      return "Comfortable / Detailed";
    case "adaptive":
      return "Adaptive (Simpler / More Detail)";
    default:
      return "Simple";
  }
}

export function getIntegrityBadgeStyle(status: string): {
  label: string;
  bg: string;
  border: string;
  ink: string;
} {
  switch (status) {
    case "passed":
      return {
        label: "Integrity Passed",
        bg: "var(--ms-prov-doctor-bg)",
        border: "var(--ms-prov-doctor-border)",
        ink: "var(--ms-ink)",
      };
    case "warning":
      return {
        label: "Needs Double-Check",
        bg: "var(--ms-prov-uncertain-bg)",
        border: "var(--ms-prov-uncertain-border)",
        ink: "var(--ms-ink)",
      };
    case "blocked":
      return {
        label: "Safety Blocked",
        bg: "var(--ms-danger-bg)",
        border: "var(--ms-danger-border)",
        ink: "var(--ms-danger-ink)",
      };
    default:
      return {
        label: "Unchecked",
        bg: "var(--ms-surface-alt)",
        border: "var(--ms-border)",
        ink: "var(--ms-ink)",
      };
  }
}

export function getApprovalBadgeStyle(status: string): {
  label: string;
  bg: string;
  border: string;
  ink: string;
} {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        bg: "var(--ms-primary-soft)",
        border: "var(--ms-primary)",
        ink: "var(--ms-ink)",
      };
    case "safety_flagged":
      return {
        label: "Safety Flagged",
        bg: "var(--ms-danger-bg)",
        border: "var(--ms-danger-border)",
        ink: "var(--ms-danger-ink)",
      };
    case "needs_doctor_edit":
    case "pending_review":
      return {
        label: status === "needs_doctor_edit" ? "Needs Edit" : "Pending Review",
        bg: "var(--ms-prov-uncertain-bg)",
        border: "var(--ms-prov-uncertain-border)",
        ink: "var(--ms-ink)",
      };
    default:
      return {
        label: "Draft",
        bg: "var(--ms-surface-alt)",
        border: "var(--ms-border)",
        ink: "var(--ms-ink-muted)",
      };
  }
}

export async function createDoctorPatientRecord(payload: {
  name: string;
  age_years?: number;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  preferred_language: SupportedLanguage;
  reading_comfort_level: ReadingComfortLevel;
  email?: string;
  phone?: string;
}): Promise<DoctorPatientLinkItem> {
  return apiRequest<DoctorPatientLinkItem>("/api/doctor/patients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function linkExistingPatientByIdentifier(
  identifier: string,
  consentScope: "consultation_only" | "linked_care" = "linked_care"
): Promise<DoctorPatientLinkItem> {
  return api.createDoctorLink({
    patient_identifier: identifier.trim(),
    consent_scope: consentScope,
  });
}

export async function fetchPatientMedicationsSafe(patientId: string): Promise<MedicationListItem[]> {
  try {
    return await apiRequest<MedicationListItem[]>(
      `/api/medications?patient_id=${encodeURIComponent(patientId)}`
    );
  } catch {
    return [];
  }
}
