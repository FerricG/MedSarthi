"use client";

import React, { useEffect, useState } from "react";
import { Check, Contrast, Minus, Plus, RotateCcw, Save, Settings, ShieldCheck } from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  type AudioSpeed,
  type DoctorPatientLinkItem,
  type ExplanationDepth,
  type ExplanationStyle,
  type ReadingComfortLevel,
  type ResponseFormat,
  type TerminologyPreference,
  type UnitsPreference,
} from "@/lib/api";

const SPEEDS: AudioSpeed[] = [0.75, 0.85, 1.0, 1.15, 1.25];

function SettingsWorkspace() {
  const { t, locale } = useI18n();
  const { patientProfile, refreshMe } = useAuth();
  const {
    prefs,
    setLanguage,
    increaseFont,
    decreaseFont,
    resetToRecommended,
    toggleHighContrast,
    setAudioSpeed,
    updatePrefs,
  } = useAccessibility();

  const [name, setName] = useState(patientProfile?.name || "");
  const [ageStr, setAgeStr] = useState(
    patientProfile?.age_years != null ? String(patientProfile.age_years) : ""
  );
  const [gender, setGender] = useState<
    "male" | "female" | "other" | "prefer_not_to_say" | ""
  >(patientProfile?.gender ?? "");
  const [voicePref, setVoicePref] = useState("warm_female");
  const [autoPlay, setAutoPlay] = useState(false);

  const [doctorLinks, setDoctorLinks] = useState<DoctorPatientLinkItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (patientProfile) {
      setName(patientProfile.name);
      setAgeStr(patientProfile.age_years != null ? String(patientProfile.age_years) : "");
      setGender(patientProfile.gender ?? "");
    }
  }, [patientProfile]);

  useEffect(() => {
    api
      .listDoctorLinks()
      .then((links) => setDoctorLinks(links))
      .catch(() => {});
    api
      .getPreferences()
      .then((serverPrefs) => {
        if (serverPrefs.voice_preference) setVoicePref(serverPrefs.voice_preference);
        if (typeof serverPrefs.auto_play_audio === "boolean") {
          setAutoPlay(serverPrefs.auto_play_audio);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(null);
    setErrorMsg(null);
    const parsedAge = ageStr.trim() ? Number.parseInt(ageStr, 10) : null;

    try {
      await api.updatePatientProfile({
        name: name.trim() || undefined,
        age_years: Number.isFinite(parsedAge) ? parsedAge : null,
        gender: gender || null,
      });
      await api.updatePreferences({
        preferred_language: locale,
        reading_comfort_level: prefs.readingComfortLevel,
        explanation_depth: prefs.explanationDepth,
        preferred_response_format: prefs.preferredResponseFormat,
        font_size: prefs.fontSize,
        font_scale_pct: prefs.fontScalePct,
        audio_speed: prefs.audioSpeed,
        high_contrast: prefs.highContrast,
        voice_preference: voicePref,
        terminology_preference: prefs.terminologyPreference,
        units_preference: prefs.unitsPreference,
        explanation_style: prefs.explanationStyle,
        auto_play_audio: autoPlay,
      });
      await refreshMe();
      setSavedNotice("Your personalization and accessibility settings are saved.");
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetRecommended() {
    const parsedAge = ageStr.trim() ? Number.parseInt(ageStr, 10) : patientProfile?.age_years;
    resetToRecommended(Number.isFinite(parsedAge) ? parsedAge : null);
    try {
      await api.updatePreferences({ reset_accessibility_to_recommended: true });
      await refreshMe();
      setSavedNotice("Reset text size and audio speed to age-recommended defaults.");
    } catch {
      // Local state still reset
    }
  }

  async function handleConsentAction(linkId: string, action: "accept" | "revoke") {
    try {
      if (action === "accept") {
        await api.acceptDoctorLink(linkId);
      } else {
        await api.revokeDoctorLink(linkId);
      }
      const updated = await api.listDoctorLinks();
      setDoctorLinks(updated);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not update doctor consent link.");
    }
  }

  return (
      <form onSubmit={(e) => void handleSaveAll(e)} className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl flex items-center gap-2.5">
              <Settings className="h-7 w-7" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <span>Personalization &amp; Accessibility Settings</span>
            </h1>
            <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              Customize language, reading depth, tone, text size, audio speed, and doctor sharing consent.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="ms-btn-primary tap-target-lg inline-flex items-center gap-2 px-5"
          >
            <Save className="h-5 w-5" aria-hidden="true" />
            <span>{saving ? "Saving..." : "Save Settings"}</span>
          </button>
        </header>

        {savedNotice && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border-2 p-3.5 text-sm font-bold"
            style={{
              backgroundColor: "var(--ms-prov-doctor-bg)",
              borderColor: "var(--ms-prov-doctor-border)",
            }}
          >
            <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{savedNotice}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border-2 p-3.5 text-sm font-bold"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Profile */}
        <section className="ms-card p-5 space-y-4">
          <h2 className="text-lg font-extrabold">1. Basic Profile</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="set-name" className="mb-1 block text-xs font-extrabold uppercase">
                Preferred Name
              </label>
              <input
                id="set-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              />
            </div>

            <div>
              <label htmlFor="set-age" className="mb-1 block text-xs font-extrabold uppercase">
                Age (Years)
              </label>
              <input
                id="set-age"
                type="number"
                min={0}
                max={125}
                value={ageStr}
                onChange={(e) => setAgeStr(e.target.value)}
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              />
            </div>

            <div>
              <label htmlFor="set-gender" className="mb-1 block text-xs font-extrabold uppercase">
                Gender (Optional)
              </label>
              <select
                id="set-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as typeof gender)}
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
        </section>

        {/* Language, Reading Comfort, Depth & Style */}
        <section className="ms-card p-5 space-y-4">
          <h2 className="text-lg font-extrabold">2. Language &amp; Explanation Style</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="set-lang" className="mb-1 block text-xs font-extrabold uppercase">
                Preferred Language
              </label>
              <select
                id="set-lang"
                value={locale}
                onChange={(e) => setLanguage(e.target.value as SupportedLocale)}
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.nativeLabel} ({loc.label})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="set-comfort" className="mb-1 block text-xs font-extrabold uppercase">
                Reading Comfort
              </label>
              <select
                id="set-comfort"
                value={prefs.readingComfortLevel}
                onChange={(e) =>
                  updatePrefs({ readingComfortLevel: e.target.value as ReadingComfortLevel })
                }
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="very_simple">{t.accessibility.comfortOptions.very_simple}</option>
                <option value="simple">{t.accessibility.comfortOptions.simple}</option>
                <option value="comfortable">{t.accessibility.comfortOptions.comfortable}</option>
                <option value="adaptive">{t.accessibility.comfortOptions.adaptive}</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-depth" className="mb-1 block text-xs font-extrabold uppercase">
                Default Explanation Depth
              </label>
              <select
                id="set-depth"
                value={prefs.explanationDepth}
                onChange={(e) =>
                  updatePrefs({ explanationDepth: e.target.value as ExplanationDepth })
                }
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="very_simple">Very Simple</option>
                <option value="simple">Simple</option>
                <option value="detailed">Detailed</option>
                <option value="deep_dive">Deep Dive</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-format" className="mb-1 block text-xs font-extrabold uppercase">
                Preferred Response Format
              </label>
              <select
                id="set-format"
                value={prefs.preferredResponseFormat}
                onChange={(e) =>
                  updatePrefs({ preferredResponseFormat: e.target.value as ResponseFormat })
                }
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="text">Text</option>
                <option value="audio">Audio</option>
                <option value="text_audio">Text + Audio</option>
                <option value="visual">Visual explanation</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-style" className="mb-1 block text-xs font-extrabold uppercase">
                Explanation Style
              </label>
              <select
                id="set-style"
                value={prefs.explanationStyle}
                onChange={(e) =>
                  updatePrefs({ explanationStyle: e.target.value as ExplanationStyle })
                }
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="calm_reassuring">Calm &amp; Reassuring</option>
                <option value="conversational">Conversational</option>
                <option value="straightforward">Straightforward</option>
                <option value="structured">Structured</option>
                <option value="step_by_step">Step-by-Step</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-terms" className="mb-1 block text-xs font-extrabold uppercase">
                Medical Words Preference
              </label>
              <select
                id="set-terms"
                value={prefs.terminologyPreference}
                onChange={(e) =>
                  updatePrefs({ terminologyPreference: e.target.value as TerminologyPreference })
                }
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="plain_only">Plain words only</option>
                <option value="plain_plus_medical">Plain words + medical name</option>
                <option value="medical_with_definitions">Medical terms with definitions</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-units" className="mb-1 block text-xs font-extrabold uppercase">
                Lab Units Preference
              </label>
              <select
                id="set-units"
                value={prefs.unitsPreference}
                onChange={(e) =>
                  updatePrefs({ unitsPreference: e.target.value as UnitsPreference })
                }
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="metric">Metric (mg/dL, °C)</option>
                <option value="us_standard">US Standard (°F)</option>
                <option value="both">Show Both</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-voice" className="mb-1 block text-xs font-extrabold uppercase">
                Voice Preference
              </label>
              <select
                id="set-voice"
                value={voicePref}
                onChange={(e) => setVoicePref(e.target.value)}
                className="tap-target w-full rounded-xl border-2 px-3.5 py-2 font-semibold"
                style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)", color: "var(--ms-ink)" }}
              >
                <option value="warm_female">Warm Female</option>
                <option value="warm_male">Warm Male</option>
                <option value="neutral_female">Neutral Female</option>
                <option value="system_default">System Default</option>
              </select>
            </div>
          </div>
        </section>

        {/* Display & Audio Accessibility */}
        <section className="ms-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold">3. Display &amp; Audio Accessibility</h2>
            <button
              type="button"
              onClick={() => void handleResetRecommended()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3.5 text-xs"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>{t.accessibility.resetFont}</span>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--ms-border)" }}>
              <span className="block text-sm font-extrabold">
                Text Size: {prefs.fontSize.toUpperCase()} ({prefs.fontScalePct}%)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={decreaseFont}
                  className="ms-btn-secondary tap-target flex items-center justify-center gap-2"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                  <span>{t.accessibility.decreaseFont}</span>
                </button>
                <button
                  type="button"
                  onClick={increaseFont}
                  className="ms-btn-secondary tap-target flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{t.accessibility.increaseFont}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--ms-border)" }}>
              <span className="block text-sm font-extrabold">Audio Speed: {prefs.audioSpeed}x</span>
              <div className="flex flex-wrap gap-2">
                {SPEEDS.map((sp) => {
                  const active = prefs.audioSpeed === sp;
                  return (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setAudioSpeed(sp)}
                      aria-pressed={active}
                      className="tap-target rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold"
                      style={{
                        backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                        color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                        borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                      }}
                    >
                      {sp}x
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={toggleHighContrast}
              aria-pressed={prefs.highContrast}
              className="tap-target-lg flex items-center justify-between rounded-xl border-2 px-4 py-3 font-extrabold"
              style={{
                backgroundColor: prefs.highContrast ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                color: prefs.highContrast ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                borderColor: "var(--ms-border)",
              }}
            >
              <span className="flex items-center gap-2">
                <Contrast className="h-5 w-5" aria-hidden="true" />
                <span>WCAG AAA High Contrast</span>
              </span>
              <span>{prefs.highContrast ? "ON" : "OFF"}</span>
            </button>

            <label
              className="tap-target-lg flex cursor-pointer items-center justify-between rounded-xl border-2 px-4 py-3 font-bold"
              style={{ borderColor: "var(--ms-border)" }}
            >
              <span>Auto-play audio when opening explanations</span>
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(e) => setAutoPlay(e.target.checked)}
                className="h-5 w-5"
              />
            </label>
          </div>
        </section>

        {/* Doctor Consent Links */}
        <section className="ms-card p-5 space-y-3">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <span>4. Doctor Consent Links</span>
          </h2>
          {doctorLinks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              No doctor link requests found.
            </p>
          ) : (
            <div className="space-y-2.5">
              {doctorLinks.map((link) => {
                const lid = link.link_id || link.id || link.patient_id;
                return (
                  <div
                    key={lid}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
                    style={{ borderColor: "var(--ms-border)" }}
                  >
                    <div>
                      <p className="font-extrabold text-sm">{link.display_name || link.name || "Linked Doctor"}</p>
                      <p className="text-xs font-semibold capitalize" style={{ color: "var(--ms-ink-muted)" }}>
                        Status: {link.consent_status} • Scope: {link.consent_scope.replace("_", " ")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {link.consent_status === "pending" && (
                        <button
                          type="button"
                          onClick={() => void handleConsentAction(lid, "accept")}
                          className="ms-btn-primary tap-target px-3.5 text-xs"
                        >
                          Accept Consent
                        </button>
                      )}
                      {link.consent_status === "active" && (
                        <button
                          type="button"
                          onClick={() => void handleConsentAction(lid, "revoke")}
                          className="ms-btn-secondary tap-target px-3.5 text-xs"
                        >
                          Revoke Access
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </form>
  );
}

export default function PatientSettingsPage() {
  return (
    <PatientGate>
      <SettingsWorkspace />
    </PatientGate>
  );
}
