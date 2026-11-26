/**
 * Typed API client for MedSarthi backend (/api).
 * Handles Bearer access JWT, HttpOnly refresh cookie rotation, double-submit CSRF tokens,
 * protected blob streaming (document previews / TTS audio), and full MVP patient/doctor types.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";

export interface ApiMeta {
  request_id: string;
  timestamp: string;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details: unknown;
  request_id: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  requestId: string;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message);
    this.name = "ApiError";
    this.status = status;
    this.code = detail.code;
    this.details = detail.details;
    this.requestId = detail.request_id;
  }
}

export type SupportedLanguage =
  | "en"
  | "hi"
  | "hi-Latn"
  | "bn"
  | "mr"
  | "ta"
  | "te"
  | "gu"
  | "kn"
  | "ml"
  | "pa";
export type ReadingComfortLevel = "very_simple" | "simple" | "comfortable" | "adaptive";
export type ExplanationDepth = "very_simple" | "simple" | "detailed" | "deep_dive";
export type ResponseFormat = "text" | "audio" | "text_audio" | "visual";
export type FontSizeTier = "medium" | "large" | "xl";
export type AudioSpeed = 0.75 | 0.85 | 1.0 | 1.15 | 1.25;
export type TerminologyPreference = "plain_only" | "plain_plus_medical" | "medical_with_definitions";
export type UnitsPreference = "metric" | "us_standard" | "both";
export type ExplanationStyle =
  | "conversational"
  | "straightforward"
  | "calm_reassuring"
  | "structured"
  | "step_by_step";

export type ExplainMoreTrigger =
  | "word_meaning"
  | "causes_mechanism"
  | "organ_function"
  | "test_purpose"
  | "medicine_purpose"
  | "common_symptoms"
  | "more_detail"
  | "explain_everything";

export type TranslationMode =
  | "direct"
  | "patient_friendly"
  | "conversational"
  | "medical_term_plus_meaning";

export interface UserInfo {
  id: string;
  role: "patient" | "doctor";
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface PatientProfile {
  id: string;
  user_id: string;
  name: string;
  age_years: number | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  onboarding_completed: boolean;
  onboarding_step: number;
}

export interface PatientPreferences {
  id: string;
  patient_id: string;
  preferred_language: SupportedLanguage;
  reading_comfort_level: ReadingComfortLevel;
  explanation_depth: ExplanationDepth;
  preferred_response_format: ResponseFormat;
  font_size: FontSizeTier;
  font_scale_pct: number;
  audio_speed: AudioSpeed;
  high_contrast: boolean;
  voice_preference: string;
  terminology_preference: TerminologyPreference;
  units_preference: UnitsPreference;
  explanation_style: ExplanationStyle;
  auto_play_audio: boolean;
  accessibility_manual_override: boolean;
}

export interface DoctorProfile {
  id: string;
  user_id: string;
  full_name: string;
  specialty: string | null;
  registration_number: string | null;
  clinic_name: string | null;
  languages_spoken: string[];
  verification_status: string;
}

export interface AuthResponseData {
  user: UserInfo;
  access_token?: string;
  csrf_token?: string;
  onboarding_required?: boolean;
  onboarding_completed?: boolean;
  patient_profile: PatientProfile | null;
  preferences: PatientPreferences | null;
  doctor_profile: DoctorProfile | null;
}

export interface HealthResponseData {
  status: string;
  prototype: boolean;
  prototype_notice: string;
  db: string;
  storage: string;
  ocr_local: string;
  tts_local: string;
  ai_providers: Record<string, string>;
}

export interface CitationRef {
  source_name: string;
  source_url: string;
  snippet?: string;
  last_reviewed_at?: string | null;
}

export interface DoctorProvidedItem {
  item_type?: string;
  text: string;
  source_ref?: string;
}

export interface GeneralEducationItem {
  topic: string;
  text: string;
  source_name?: string;
  source_url?: string;
  citations?: CitationRef[];
  diagram_id?: string;
}

export interface UncertainOrMissingItem {
  field?: string;
  reason: string;
  suggested_doctor_question?: string;
  suggested_question?: string;
}

export interface ProvenancePayload {
  doctor_provided: Array<string | DoctorProvidedItem>;
  ai_simplified: {
    summary: string;
    steps?: string[];
    reading_level?: string;
    language?: string;
    heading_1_doctor?: string;
    heading_2_knowledge?: string;
    heading_3_unknown?: string;
  };
  general_education: GeneralEducationItem[];
  uncertain_or_missing: Array<string | UncertainOrMissingItem>;
}

export interface IntegrityMismatch {
  rule_id?: string;
  category?: string;
  severity: "low" | "medium" | "high" | "critical";
  field: string;
  source_value: string;
  output_value: string;
  message: string;
}

export interface IntegrityReport {
  status: "unchecked" | "passed" | "warning" | "blocked";
  risk_level?: "low" | "medium" | "high" | "critical";
  rules_evaluated?: number;
  checked?: boolean;
  matched_items?: number;
  mismatches: IntegrityMismatch[];
  negation_preserved?: boolean;
  dosage_preserved?: boolean;
  frequency_preserved?: boolean;
  duration_preserved?: boolean;
  measurements_preserved?: boolean;
  disclaimer?: string;
}

export interface EmergencyGuidance {
  is_emergency: boolean;
  severity?: "urgent" | "emergency";
  matched_triggers?: string[];
  banner_title?: string;
  banner_message: string;
  helplines?: Array<{ label: string; number: string }>;
}

export interface TtsCue {
  sentence_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface DiagramCallout {
  key: string;
  label: string;
  depth: string;
}

export interface CuratedDiagram {
  id: string;
  svg_path: string;
  body_system?: string;
  related_terms?: string[];
  title: string;
  description: string;
  callouts: DiagramCallout[];
  disclaimer?: string;
}

export interface ConsultationMedication {
  name?: string;
  medicine_name?: string;
  dose?: string;
  dosage_value?: string;
  dosage_unit?: string;
  frequency?: string;
  frequency_text?: string;
  duration?: string;
  duration_text?: string;
  route?: string;
  timing_with_food?: string;
  warnings?: string[];
  negations_and_warnings?: string[];
}

export interface ConsultationSummary {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  doctor_name?: string | null;
  source_type: string;
  title: string;
  visit_date: string | null;
  explanation_language: string;
  explanation_depth: string;
  approval_status: string;
  sharing_status: string;
  integrity_status: "unchecked" | "passed" | "warning" | "blocked";
  created_at: string;
  updated_at?: string;
}

export interface ConsultationDetail extends ConsultationSummary {
  original_doctor_input: string;
  original_input_hash?: string;
  original_input_locked_at?: string | null;
  structured_data: {
    diagnoses?: string[];
    symptoms?: string[];
    observations?: string[];
    vitals?: Record<string, string>;
    medications?: ConsultationMedication[];
    test_results?: Array<{ test_name: string; value: string; unit?: string; reference_range?: string }>;
    tests_advised?: string[];
    allergies?: string[];
    warnings?: string[];
    follow_up?: string;
    follow_up_date?: string;
    doctor_explanation?: string;
    notes?: string;
    [key: string]: unknown;
  };
  generated_explanation: ProvenancePayload | null;
  integrity_report: IntegrityReport | null;
  visual_diagrams?: CuratedDiagram[];
  highlighted_terms?: string[];
}

export interface MedicationListItem {
  id?: string;
  consultation_id?: string | null;
  consultation_title?: string | null;
  visit_date?: string | null;
  doctor_name?: string | null;
  medicine_name: string;
  dose: string;
  frequency: string;
  duration?: string | null;
  route?: string | null;
  warnings: string[];
  locked_instruction: string;
  kb_slug?: string | null;
}

export interface UncertainOcrSpan {
  page?: number;
  field: string;
  text: string;
  confidence: number;
  reason: string;
}

export interface MedicalDocumentDTO {
  id: string;
  patient_id: string;
  consultation_id: string | null;
  document_type: "prescription" | "lab_report" | "discharge_summary" | "clinical_note" | "other";
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  page_count: number;
  ocr_raw_text: string | null;
  ocr_structured_fields: Record<string, unknown> | null;
  ocr_confidence_score: number | null;
  uncertain_spans: UncertainOcrSpan[];
  processing_status:
    | "uploaded"
    | "queued"
    | "extracting"
    | "extracted"
    | "needs_verification"
    | "explaining"
    | "completed"
    | "failed";
  verification_status: "unverified" | "patient_confirmed" | "doctor_verified" | "rejected_unreadable";
  preview_url?: string;
  signed_preview_url?: string;
  explanation?: ProvenancePayload | null;
  created_at: string;
  verified_at?: string | null;
}

export interface KBTermResult {
  id?: string;
  canonical_name: string;
  slug: string;
  entry_type: string;
  aliases: string[];
  body_system: string | null;
  pronunciation?: string | null;
  simple_en: string;
  detailed_en: string | null;
  localized_name?: string;
  localized_simple?: string;
  localized_detailed?: string;
  hinglish_explanation?: string;
  usage_example?: string | null;
  when_to_ask_doctor?: string | null;
  normal_ranges_info?: string | null;
  related_slugs?: string[];
  curated_diagram_key?: string | null;
  diagram?: CuratedDiagram | null;
  source_name: string;
  source_url: string;
  last_reviewed_at?: string | null;
  translations?: Record<string, { name?: string; simple?: string; detailed?: string }>;
  metadata_json?: Record<string, unknown>;
}

export interface MedicineExplanationResult {
  medicine_name: string;
  locked_doctor_instruction?: string | null;
  drug_class?: string;
  brand_examples?: string[];
  what_it_is?: string;
  common_purposes?: string;
  how_it_works?: string;
  why_prescribed_for_you?: string;
  common_side_effects?: string[];
  serious_warnings?: string[];
  precautions?: string[];
  food_and_interactions?: string;
  adherence_guidance?: string;
  questions_for_doctor?: string[];
  prohibitions?: string[];
  prohibitions_enforced?: string[];
  missed_dose_guidance?: string;
  red_flag_side_effects?: string[];
  medication_parts?: {
    what_it_is?: string;
    drug_category?: string;
    common_uses?: string;
    general_mechanism?: string;
    prescribed_reason?: string;
    common_side_effects?: string[];
    warnings?: string[];
    precautions?: string[];
    food_and_interactions?: string;
    adherence_importance?: string;
    questions_for_doctor?: string[];
  };
  provenance?: ProvenancePayload;
  integrity?: IntegrityReport;
  citations?: CitationRef[];
  diagram?: CuratedDiagram | null;
  visual_diagrams?: CuratedDiagram[];
}

export interface ChatMessageDTO {
  id: string;
  conversation_id: string;
  sender_role: "patient" | "doctor" | "assistant" | "system";
  input_modality: "text" | "voice";
  message_text: string;
  language: string;
  stt_confidence?: number | null;
  stt_confirmed_by_user?: boolean;
  provenance_blocks?: ProvenancePayload | null;
  context_refs?: Array<{ ref_type: string; ref_id?: string; excerpt?: string }>;
  citations?: CitationRef[];
  emergency_flag_triggered?: boolean;
  emergency_guidance?: EmergencyGuidance | null;
  integrity_status?: string;
  suggested_followups?: string[];
  created_at: string;
}

export interface ConversationSummaryDTO {
  id: string;
  title: string;
  consultation_id: string | null;
  document_id: string | null;
  primary_language: string;
  status: string;
  updated_at: string;
}

export interface SttResponse {
  audio_id?: string | null;
  transcript_text: string;
  detected_language: string;
  confidence_score: number;
  requires_confirmation: boolean;
  alternative_interpretations?: string[];
  provider?: string;
}

export interface TtsResponse {
  audio_id?: string | null;
  stream_url?: string | null;
  duration_seconds?: number;
  audio_speed: number;
  language: string;
  provider?: string;
  fallback_to_browser?: boolean;
  cues: TtsCue[];
}

export interface DoctorPatientLinkItem {
  id?: string;
  link_id?: string;
  patient_id: string;
  name?: string;
  display_name?: string;
  age_years?: number | null;
  preferred_language?: SupportedLanguage;
  reading_comfort_level?: ReadingComfortLevel;
  consent_status: string;
  consent_scope: string;
  consent_granted_at?: string | null;
}

export interface AudioRecordDTO {
  audio_id: string;
  consultation_id?: string | null;
  audio_purpose: string;
  duration_seconds?: number | null;
  processing_status: string;
  stt_language_detected?: string | null;
  stt_confidence_score?: number | null;
  transcript_raw?: string | null;
  transcript_segments?: Array<{
    segment_id: string;
    start_ms?: number;
    end_ms?: number;
    speaker_role: string;
    speaker_label?: string;
    text: string;
    confidence?: number;
  }>;
  speaker_map_verified?: boolean;
  retention_policy?: string;
  retention_expires_at?: string | null;
  audio_purged_at?: string | null;
}

let inMemoryAccessToken: string | null = null;
let inMemoryCsrfToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setSessionTokens(accessToken: string | null, csrfToken?: string | null): void {
  inMemoryAccessToken = accessToken;
  if (csrfToken !== undefined) {
    inMemoryCsrfToken = csrfToken;
  }
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

async function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const csrf = readCookie("medsarthi_csrf_token") || inMemoryCsrfToken;
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setSessionTokens(null, null);
        return false;
      }
      const payload = (await res.json()) as ApiSuccessEnvelope<{
        access_token: string;
        csrf_token: string;
      }>;
      setSessionTokens(payload.data.access_token, payload.data.csrf_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function buildAuthHeaders(
  isMutating: boolean,
  isFormData: boolean,
  customHeaders?: HeadersInit
): Record<string, string> {
  const h: Record<string, string> = {};
  if (!isFormData) {
    h["Content-Type"] = "application/json";
  }
  if (inMemoryAccessToken) {
    h["Authorization"] = `Bearer ${inMemoryAccessToken}`;
  }
  if (isMutating) {
    const csrf = readCookie("medsarthi_csrf_token") || inMemoryCsrfToken;
    if (csrf) {
      h["X-CSRF-Token"] = csrf;
    }
  }
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((v, k) => {
        h[k] = v;
      });
    } else if (Array.isArray(customHeaders)) {
      for (const [k, v] of customHeaders) {
        h[k] = v;
      }
    } else {
      Object.assign(h, customHeaders);
    }
  }
  return h;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuthRefresh?: boolean } = {}
): Promise<T> {
  const { skipAuthRefresh = false, headers: customHeaders, ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();
  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    method,
    credentials: "include",
    headers: buildAuthHeaders(isMutating, isFormData, customHeaders),
  });

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !path.startsWith("/api/auth/login") &&
    !path.startsWith("/api/auth/register") &&
    !path.startsWith("/api/auth/refresh") &&
    !path.startsWith("/api/demo/login")
  ) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...rest,
        method,
        credentials: "include",
        headers: buildAuthHeaders(isMutating, isFormData, customHeaders),
      });
    }
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const errDetail: ApiErrorDetail = json?.error ?? {
      code: "UNKNOWN_ERROR",
      message:
        typeof json?.detail === "string"
          ? json.detail
          : `Request failed with status ${response.status}`,
      details: json?.detail ?? [],
      request_id: "unknown",
    };
    throw new ApiError(response.status, errDetail);
  }

  if (json && typeof json === "object" && "data" in json) {
    return (json as ApiSuccessEnvelope<T>).data;
  }
  return json as T;
}

/**
 * Fetch an authenticated binary endpoint (document preview PNG or TTS audio) and return a blob URL.
 * Caller should revoke the URL via URL.revokeObjectURL(url) on unmount.
 */
export async function fetchAuthenticatedBlobUrl(pathOrUrl: string): Promise<string> {
  const fullUrl = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${API_BASE_URL}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;

  let response = await fetch(fullUrl, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(false, true),
  });

  if (response.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      response = await fetch(fullUrl, {
        method: "GET",
        credentials: "include",
        headers: buildAuthHeaders(false, true),
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, {
      code: "MEDIA_FETCH_ERROR",
      message: `Unable to load protected media (${response.status}).`,
      details: [],
      request_id: "unknown",
    });
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Normalize backend provenance objects across seed_data.py shapes and ProvenanceResponse contracts.
 */
export function normalizeProvenance(raw: unknown): ProvenancePayload {
  const fallback: ProvenancePayload = {
    doctor_provided: [],
    ai_simplified: { summary: "" },
    general_education: [],
    uncertain_or_missing: [],
  };
  if (!raw || typeof raw !== "object") return fallback;

  const obj = raw as Record<string, unknown>;
  const inner =
    obj.provenance && typeof obj.provenance === "object"
      ? (obj.provenance as Record<string, unknown>)
      : obj;

  const doctorProvided = Array.isArray(inner.doctor_provided)
    ? (inner.doctor_provided as Array<string | DoctorProvidedItem>)
    : [];

  let aiSimplified: ProvenancePayload["ai_simplified"] = { summary: "" };
  if (typeof inner.ai_simplified === "string") {
    aiSimplified = { summary: inner.ai_simplified };
  } else if (inner.ai_simplified && typeof inner.ai_simplified === "object") {
    aiSimplified = inner.ai_simplified as ProvenancePayload["ai_simplified"];
  }

  const generalEducation = Array.isArray(inner.general_education)
    ? (inner.general_education as GeneralEducationItem[])
    : [];

  const rawUncertain = inner.uncertain_or_missing ?? inner.uncertain_unknown;
  const uncertainOrMissing = Array.isArray(rawUncertain)
    ? (rawUncertain as Array<string | UncertainOrMissingItem>)
    : [];

  return {
    doctor_provided: doctorProvided,
    ai_simplified: aiSimplified,
    general_education: generalEducation,
    uncertain_or_missing: uncertainOrMissing,
  };
}

export function normalizeIntegrityReport(
  raw: unknown,
  fallbackStatus?: "unchecked" | "passed" | "warning" | "blocked"
): IntegrityReport {
  if (!raw || typeof raw !== "object") {
    return {
      status: fallbackStatus ?? "unchecked",
      mismatches: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const status =
    (obj.status as IntegrityReport["status"]) ??
    (obj.check_status as IntegrityReport["status"]) ??
    fallbackStatus ??
    "passed";
  const mismatches = Array.isArray(obj.mismatches)
    ? (obj.mismatches as IntegrityMismatch[])
    : Array.isArray(obj.issues_found)
      ? (obj.issues_found as IntegrityMismatch[])
      : [];

  return {
    status,
    risk_level: (obj.risk_level as IntegrityReport["risk_level"]) ?? undefined,
    rules_evaluated: typeof obj.rules_evaluated === "number" ? obj.rules_evaluated : undefined,
    checked: typeof obj.checked === "boolean" ? obj.checked : undefined,
    matched_items: typeof obj.matched_items === "number" ? obj.matched_items : undefined,
    mismatches,
    negation_preserved:
      typeof obj.negation_preserved === "boolean" ? obj.negation_preserved : undefined,
    dosage_preserved: typeof obj.dosage_preserved === "boolean" ? obj.dosage_preserved : undefined,
    frequency_preserved:
      typeof obj.frequency_preserved === "boolean" ? obj.frequency_preserved : undefined,
    duration_preserved:
      typeof obj.duration_preserved === "boolean" ? obj.duration_preserved : undefined,
    measurements_preserved:
      typeof obj.measurements_preserved === "boolean" ? obj.measurements_preserved : undefined,
    disclaimer: typeof obj.disclaimer === "string" ? obj.disclaimer : undefined,
  };
}

export const api = {
  // Health & Demo
  health: () => apiRequest<HealthResponseData>("/api/health", { skipAuthRefresh: true }),

  demoLogin: async (role: "patient" | "doctor"): Promise<AuthResponseData> => {
    try {
      const data = await apiRequest<AuthResponseData>("/api/demo/login", {
        method: "POST",
        body: JSON.stringify({ role }),
        skipAuthRefresh: true,
      });
      if (data.access_token) {
        setSessionTokens(data.access_token, data.csrf_token ?? null);
      }
      return data;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        const creds =
          role === "patient"
            ? { id: "ramesh.demo@medsarthi.local", pw: "DemoPatient#2026" }
            : { id: "priya.doctor@medsarthi.local", pw: "DemoDoctor#2026" };
        return api.login(creds.id, creds.pw);
      }
      throw err;
    }
  },

  guestLogin: async (role: "patient" | "doctor" = "patient", name?: string): Promise<AuthResponseData> => {
    const data = await apiRequest<AuthResponseData>("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify({ role, ...(name ? { name } : {}) }),
      skipAuthRefresh: true,
    });
    if (data.access_token) {
      setSessionTokens(data.access_token, data.csrf_token ?? null);
    }
    return data;
  },

  // Auth
  login: async (identifier: string, password: string) => {
    const data = await apiRequest<AuthResponseData>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    if (data.access_token) {
      setSessionTokens(data.access_token, data.csrf_token ?? null);
    }
    return data;
  },

  register: async (payload: {
    email?: string;
    phone?: string;
    password: string;
    role: "patient" | "doctor";
    name: string;
    age_years?: number;
    gender?: "male" | "female" | "other" | "prefer_not_to_say";
    doctor_details?: {
      specialty?: string;
      registration_number?: string;
      clinic_name?: string;
    };
  }) => {
    const data = await apiRequest<AuthResponseData>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (data.access_token) {
      setSessionTokens(data.access_token, data.csrf_token ?? null);
    }
    return data;
  },

  me: () => apiRequest<AuthResponseData>("/api/auth/me"),

  logout: async () => {
    try {
      await apiRequest<{ logged_out: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } finally {
      setSessionTokens(null, null);
    }
  },

  // Patient Profile & Preferences
  getPatientMe: () =>
    apiRequest<{
      profile?: PatientProfile;
      patient_profile?: PatientProfile;
      preferences: PatientPreferences;
    }>("/api/patients/me"),

  createOrCompletePatientOnboarding: (payload: {
    name?: string;
    age_years?: number | null;
    gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
    onboarding_step?: number;
    onboarding_completed?: boolean;
    preferences?: Partial<PatientPreferences>;
  }) =>
    apiRequest<{ profile?: PatientProfile; patient_profile?: PatientProfile; preferences: PatientPreferences }>(
      "/api/patients",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  updatePatientProfile: (payload: {
    name?: string;
    age_years?: number | null;
    gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
    onboarding_step?: number;
    onboarding_completed?: boolean;
  }) =>
    apiRequest<PatientProfile>("/api/patients/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getPreferences: () => apiRequest<PatientPreferences>("/api/patients/me/preferences"),

  updatePreferences: (
    payload: Partial<
      Pick<
        PatientPreferences,
        | "preferred_language"
        | "reading_comfort_level"
        | "explanation_depth"
        | "preferred_response_format"
        | "font_size"
        | "font_scale_pct"
        | "audio_speed"
        | "high_contrast"
        | "voice_preference"
        | "terminology_preference"
        | "units_preference"
        | "explanation_style"
        | "auto_play_audio"
      >
    > & { reset_accessibility_to_recommended?: boolean }
  ) =>
    apiRequest<PatientPreferences>("/api/patients/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // Patient Consultations & Medications
  listConsultations: () => apiRequest<ConsultationSummary[]>("/api/consultations"),

  getConsultation: (id: string) => apiRequest<ConsultationDetail>(`/api/consultations/${id}`),

  listMedications: () => apiRequest<MedicationListItem[]>("/api/medications"),

  // Core Explanation & Translation
  explain: (payload: {
    source_type?: "consultation" | "text" | "diagnosis" | "prescription" | "lab_report";
    consultation_id?: string;
    raw_text?: string;
    target_language?: SupportedLanguage;
    explanation_depth?: ExplanationDepth;
    include_visuals?: boolean;
  }) =>
    apiRequest<{
      explanation_id?: string;
      provenance: ProvenancePayload;
      safety?: IntegrityReport;
      integrity?: IntegrityReport;
      visual_diagrams?: CuratedDiagram[];
      highlighted_terms?: string[];
    }>("/api/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  explainMore: (payload: {
    consultation_id?: string;
    source_text?: string;
    trigger: ExplainMoreTrigger;
    target_depth?: ExplanationDepth;
    focus_term_or_topic?: string;
    target_language?: SupportedLanguage;
  }) =>
    apiRequest<{
      trigger: string;
      provenance: ProvenancePayload;
      safety?: IntegrityReport;
      integrity?: IntegrityReport;
      visual_diagrams?: CuratedDiagram[];
    }>("/api/explain/more", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  explainTerm: (payload: {
    term: string;
    context_snippet?: string;
    target_language?: SupportedLanguage;
    depth?: ExplanationDepth;
  }) =>
    apiRequest<{
      term?: string;
      canonical_term?: string;
      kb_entry?: KBTermResult | null;
      term_card?: {
        term: string;
        pronunciation?: string;
        simple_definition: string;
        selected_language_explanation?: string;
        hinglish_explanation?: string;
        detailed_explanation?: string;
        usage_example?: string;
        related_terms?: string[];
        body_part_or_system?: string;
        verified_source?: CitationRef[];
      };
      provenance: ProvenancePayload;
      visual_diagrams?: CuratedDiagram[];
    }>("/api/explain/term", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  explainMedicine: (payload: {
    medicine_name: string;
    doctor_dosage_instruction?: string;
    consultation_id?: string;
    target_language?: SupportedLanguage;
  }) =>
    apiRequest<MedicineExplanationResult>("/api/explain/medicine", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  explainReport: (payload: {
    document_id?: string;
    structured_lab_items?: Array<{
      test_name: string;
      value: string;
      unit?: string;
      reference_range?: string;
    }>;
    target_language?: SupportedLanguage;
  }) =>
    apiRequest<{
      provenance: ProvenancePayload;
      integrity?: IntegrityReport;
      visual_diagrams?: CuratedDiagram[];
    }>("/api/explain/report", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  translate: (payload: {
    text?: string;
    consultation_id?: string;
    explanation_payload?: ProvenancePayload;
    source_language?: SupportedLanguage;
    target_language: SupportedLanguage;
    mode: TranslationMode;
    preserve_english_terms?: boolean;
  }) =>
    apiRequest<{
      translated_text?: string;
      translated_provenance?: ProvenancePayload;
      provenance?: ProvenancePayload;
      source_language: string;
      target_language: string;
      mode: TranslationMode;
      preserved_terms?: Array<{ medical_term: string; localized_gloss: string }>;
      safety?: IntegrityReport;
      integrity?: IntegrityReport;
    }>("/api/translate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Documents & OCR Verification
  uploadDocument: (
    file: File,
    documentType: MedicalDocumentDTO["document_type"],
    options?: { consultationId?: string; patientId?: string }
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("document_type", documentType);
    if (options?.consultationId) fd.append("consultation_id", options.consultationId);
    if (options?.patientId) fd.append("patient_id", options.patientId);
    return apiRequest<MedicalDocumentDTO>("/api/documents/upload", {
      method: "POST",
      body: fd,
    });
  },

  listDocuments: (patientId?: string) => {
    const qs = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
    return apiRequest<MedicalDocumentDTO[]>(`/api/documents${qs}`);
  },

  getDocument: (id: string) => apiRequest<MedicalDocumentDTO>(`/api/documents/${id}`),

  getDocumentPreviewUrl: (id: string, pageNum = 1) =>
    `/api/documents/${id}/preview?page=${pageNum}`,

  extractDocument: (id: string) =>
    apiRequest<MedicalDocumentDTO>(`/api/documents/${id}/extract`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  verifyDocument: (
    id: string,
    payload: {
      corrected_ocr_text?: string;
      corrected_structured_fields?: Record<string, unknown>;
      verification_decision: "confirm" | "reject_unreadable";
    }
  ) =>
    apiRequest<MedicalDocumentDTO>(`/api/documents/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  explainDocument: (
    id: string,
    payload?: { target_language?: SupportedLanguage; explanation_depth?: ExplanationDepth }
  ) =>
    apiRequest<{
      document_id: string;
      provenance: ProvenancePayload;
      integrity?: IntegrityReport;
      visual_diagrams?: CuratedDiagram[];
      ocr_warning?: string;
    }>(`/api/documents/${id}/explain`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  deleteDocument: (id: string) =>
    apiRequest<{ id: string; deleted_at: string }>(`/api/documents/${id}`, {
      method: "DELETE",
    }),

  // Chat & Voice / TTS
  sendChat: (payload: {
    conversation_id?: string;
    message_text: string;
    input_modality?: "text" | "voice";
    source_audio_id?: string;
    stt_confirmed?: boolean;
    context_consultation_id?: string;
    context_document_id?: string;
    target_language?: SupportedLanguage;
    depth_override?: ExplanationDepth;
  }) =>
    apiRequest<{
      conversation_id: string;
      user_message_id?: string;
      assistant_message: ChatMessageDTO;
    }>("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listConversations: () => apiRequest<ConversationSummaryDTO[]>("/api/chat/conversations"),

  getChatHistory: (conversationId?: string) => {
    const qs = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
    return apiRequest<{
      conversation_id: string | null;
      conversations?: ConversationSummaryDTO[];
      messages: ChatMessageDTO[];
    }>(`/api/chat/history${qs}`);
  },

  deleteConversation: (id: string) =>
    apiRequest<{ id: string; deleted_at: string }>(`/api/chat/conversations/${id}`, {
      method: "DELETE",
    }),

  speechToText: (file: Blob, languageHint?: SupportedLanguage, filename = "voice.webm") => {
    const fd = new FormData();
    fd.append("file", file, filename);
    fd.append("consent_recorded", "true");
    if (languageHint) fd.append("language_hint", languageHint);
    return apiRequest<SttResponse>("/api/speech/stt", {
      method: "POST",
      body: fd,
    });
  },

  textToSpeech: (payload: {
    text: string;
    language?: SupportedLanguage;
    voice_preference?: string;
    audio_speed?: AudioSpeed;
    explanation_id?: string;
    message_id?: string;
  }) =>
    apiRequest<TtsResponse>("/api/speech/tts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Knowledge Base & Curated Diagrams
  searchTerms: (query: string, language: SupportedLanguage = "en", limit = 10) =>
    apiRequest<KBTermResult[]>(
      `/api/knowledge/terms/search?q=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}&limit=${limit}`
    ),

  getTerm: (slug: string, language: SupportedLanguage = "en") =>
    apiRequest<KBTermResult>(
      `/api/knowledge/terms/${encodeURIComponent(slug)}?language=${encodeURIComponent(language)}`
    ),

  searchMedicines: (query: string, language: SupportedLanguage = "en", limit = 10) =>
    apiRequest<KBTermResult[]>(
      `/api/knowledge/medicines/search?q=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}&limit=${limit}`
    ),

  getDiagrams: (key?: string, language: SupportedLanguage = "en") => {
    const params = new URLSearchParams({ language });
    if (key) params.set("key", key);
    return apiRequest<CuratedDiagram[]>(`/api/knowledge/diagrams?${params.toString()}`);
  },

  // Doctor & Audio Consultations (shared with frontend-doctor)
  listDoctorPatients: (query = "") => {
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    return apiRequest<DoctorPatientLinkItem[]>(`/api/doctor/patients${qs}`);
  },

  listDoctorConsultations: (patientId?: string) => {
    const qs = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
    return apiRequest<ConsultationSummary[]>(`/api/doctor/consultations${qs}`);
  },

  getDoctorConsultation: (id: string) =>
    apiRequest<ConsultationDetail>(`/api/doctor/consultation/${id}`),

  createDoctorConsultation: (payload: {
    patient_id: string;
    title: string;
    visit_date?: string;
    source_type?: "doctor_entered" | "doctor_audio" | "doctor_document";
    original_doctor_input: string;
    transcript_audio_id?: string;
    structured_data?: Record<string, unknown>;
  }) =>
    apiRequest<ConsultationDetail>("/api/doctor/consultation", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  generateDoctorExplanation: (
    id: string,
    payload?: { target_language?: SupportedLanguage; explanation_depth?: ExplanationDepth; include_visuals?: boolean }
  ) =>
    apiRequest<ConsultationDetail>(`/api/doctor/consultation/${id}/generate`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  updateDoctorConsultation: (
    id: string,
    payload: {
      title?: string;
      structured_data?: Record<string, unknown>;
      edited_explanation?: Partial<ProvenancePayload>;
      amendment_reason?: string;
    }
  ) =>
    apiRequest<ConsultationDetail>(`/api/doctor/consultation/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  approveDoctorConsultation: (id: string, reviewNote?: string) =>
    apiRequest<ConsultationDetail>(`/api/doctor/consultation/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approve: true, review_note: reviewNote }),
    }),

  shareDoctorConsultation: (
    id: string,
    sharingTarget: "shared_with_patient" | "revoked" = "shared_with_patient"
  ) =>
    apiRequest<ConsultationDetail>(`/api/doctor/consultation/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ sharing_target: sharingTarget }),
    }),

  uploadAudio: (
    file: Blob,
    options: {
      audioPurpose: "doctor_consultation" | "patient_voice_query";
      patientId?: string;
      consultationId?: string;
      filename?: string;
    }
  ) => {
    const fd = new FormData();
    fd.append("file", file, options.filename ?? "consultation.webm");
    fd.append("audio_purpose", options.audioPurpose);
    fd.append("consent_recorded", "true");
    fd.append("consent_timestamp", new Date().toISOString());
    if (options.patientId) fd.append("patient_id", options.patientId);
    if (options.consultationId) fd.append("consultation_id", options.consultationId);
    return apiRequest<AudioRecordDTO>("/api/audio/upload", {
      method: "POST",
      body: fd,
    });
  },

  transcribeAudio: (audioId: string, languageHint?: SupportedLanguage) =>
    apiRequest<AudioRecordDTO>("/api/audio/transcribe", {
      method: "POST",
      body: JSON.stringify({ audio_id: audioId, language_hint: languageHint }),
    }),

  getAudio: (audioId: string) => apiRequest<AudioRecordDTO>(`/api/audio/${audioId}`),

  updateAudioTranscript: (
    audioId: string,
    payload: {
      speaker_reassignments?: Array<{ segment_id: string; speaker_role: string }>;
      text_edits?: Array<{ segment_id: string; text: string }>;
      speaker_map_verified: boolean;
    }
  ) =>
    apiRequest<AudioRecordDTO>(`/api/audio/${audioId}/transcript`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  summarizeAudio: (payload: {
    audio_id: string;
    consultation_id?: string;
    target_language?: SupportedLanguage;
    auto_purge_audio_after_summary?: boolean;
  }) =>
    apiRequest<{
      audio_id: string;
      consultation_id?: string;
      structured_summary?: Record<string, unknown>;
      provenance: ProvenancePayload;
      integrity?: IntegrityReport;
      audio_purged?: boolean;
    }>("/api/audio/summarize", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteAudio: (audioId: string) =>
    apiRequest<{ audio_id: string; deleted_at: string }>(`/api/audio/${audioId}`, {
      method: "DELETE",
    }),

  // Doctor-Patient Consent Links
  listDoctorLinks: () => apiRequest<DoctorPatientLinkItem[]>("/api/consent/doctor-links"),

  createDoctorLink: (payload: {
    patient_identifier?: string;
    doctor_id?: string;
    consent_scope?: "consultation_only" | "linked_care";
  }) =>
    apiRequest<DoctorPatientLinkItem>("/api/consent/doctor-links", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  acceptDoctorLink: (linkId: string) =>
    apiRequest<DoctorPatientLinkItem>(`/api/consent/doctor-links/${linkId}/accept`, {
      method: "POST",
      body: JSON.stringify({ confirm_consent: true }),
    }),

  // Guided Flow Review & Rating
  submitGuidedReview: (payload: {
    document_id: string;
    conversation_id?: string;
    patient_confirmed_demographics?: boolean;
    preferred_language?: SupportedLanguage;
  }) =>
    apiRequest<{
      review_id: string;
      document_id: string;
      conversation_id: string | null;
      doctor_verification_status: string;
      eta_hours: number;
      notification: {
        status: string;
        channel: string;
        will_notify_within_24h: boolean;
        eta_hours: number;
        estimated_ready_at: string;
        recipient_masked: string | null;
        message: string;
      };
    }>("/api/patients/me/guided-review", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  submitGuidedReviewRating: (payload: {
    rating: number;
    feedback_text?: string;
    document_id?: string;
    conversation_id?: string;
    review_id?: string;
  }) =>
    apiRequest<{ saved: boolean; rating: number; thank_you: string }>(
      "/api/patients/me/guided-review/rating",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  revokeDoctorLink: (linkId: string) =>
    apiRequest<DoctorPatientLinkItem>(`/api/consent/doctor-links/${linkId}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
