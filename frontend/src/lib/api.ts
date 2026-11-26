/**
 * Typed API client for MedSarthi backend (/api).
 * Handles Bearer access JWT, HttpOnly refresh cookie rotation, and double-submit CSRF tokens.
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
  preferred_language: "en" | "hi" | "hi-Latn";
  reading_comfort_level: "very_simple" | "simple" | "comfortable" | "adaptive";
  explanation_depth: "very_simple" | "simple" | "detailed" | "deep_dive";
  preferred_response_format: "text" | "audio" | "text_audio" | "visual";
  font_size: "medium" | "large" | "xl";
  font_scale_pct: number;
  audio_speed: 0.75 | 0.85 | 1.0 | 1.15 | 1.25;
  high_contrast: boolean;
  voice_preference: string;
  terminology_preference: "plain_only" | "plain_plus_medical" | "medical_with_definitions";
  units_preference: "metric" | "us_standard" | "both";
  explanation_style:
    | "conversational"
    | "straightforward"
    | "calm_reassuring"
    | "structured"
    | "step_by_step";
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

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuthRefresh?: boolean } = {}
): Promise<T> {
  const { skipAuthRefresh = false, headers: customHeaders, ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();
  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);

  const buildHeaders = (): HeadersInit => {
    const h: Record<string, string> = {};
    if (!(rest.body instanceof FormData)) {
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
      Object.assign(h, customHeaders);
    }
    return h;
  };

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    method,
    credentials: "include",
    headers: buildHeaders(),
  });

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !path.startsWith("/api/auth/login") &&
    !path.startsWith("/api/auth/register") &&
    !path.startsWith("/api/auth/refresh")
  ) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...rest,
        method,
        credentials: "include",
        headers: buildHeaders(),
      });
    }
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const errDetail: ApiErrorDetail = json?.error ?? {
      code: "UNKNOWN_ERROR",
      message: `Request failed with status ${response.status}`,
      details: [],
      request_id: "unknown",
    };
    throw new ApiError(response.status, errDetail);
  }

  return (json as ApiSuccessEnvelope<T>).data;
}

export const api = {
  health: () => apiRequest<HealthResponseData>("/api/health", { skipAuthRefresh: true }),
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
};
