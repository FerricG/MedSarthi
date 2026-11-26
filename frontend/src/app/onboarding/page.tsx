"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Contrast,
  Eye,
  FileText,
  Globe,
  Headphones,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
} from "lucide-react";
import { speakTextWithMithi } from "@/components/AudioPlayer";
import { computeAgeDefaults, useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  EXTENSIBLE_INDIAN_LOCALES,
  SUPPORTED_LOCALES,
  useI18n,
  type SupportedLocale,
} from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  type AudioSpeed,
  type ExplanationDepth,
  type ReadingComfortLevel,
  type ResponseFormat,
} from "@/lib/api";

const AUDIO_SPEED_LADDER: AudioSpeed[] = [0.75, 0.85, 1.0, 1.15, 1.25];

function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemoWalkthrough = searchParams?.get("demo") === "1";

  const { t, locale, formatMessage } = useI18n();
  const { user, patientProfile, refreshMe } = useAuth();
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

  const [step, setStep] = useState(1);
  const [name, setName] = useState(patientProfile?.name || (isDemoWalkthrough ? "Ramesh Sharma" : ""));
  const [ageInput, setAgeInput] = useState<string>(
    patientProfile?.age_years != null
      ? String(patientProfile.age_years)
      : isDemoWalkthrough
        ? "64"
        : ""
  );
  const [gender, setGender] = useState<
    "male" | "female" | "other" | "prefer_not_to_say" | null
  >(patientProfile?.gender ?? null);
  const [readingComfort, setReadingComfort] = useState<ReadingComfortLevel>(
    prefs.readingComfortLevel
  );
  const [selectedLang, setSelectedLang] = useState<SupportedLocale>(locale);
  const [langQuery, setLangQuery] = useState("");
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>(
    prefs.preferredResponseFormat
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (patientProfile?.name && !name) {
      setName(patientProfile.name);
    }
    if (patientProfile?.age_years != null && !ageInput) {
      setAgeInput(String(patientProfile.age_years));
    }
  }, [patientProfile, name, ageInput]);

  const parsedAge = useMemo(() => {
    const n = Number.parseInt(ageInput, 10);
    return Number.isFinite(n) && n >= 0 && n <= 125 ? n : null;
  }, [ageInput]);

  const recommended = useMemo(() => computeAgeDefaults(parsedAge), [parsedAge]);

  const filteredLocales = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    const mvp = SUPPORTED_LOCALES.filter(
      (l) => !q || l.label.toLowerCase().includes(q) || l.nativeLabel.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    );
    const ext = EXTENSIBLE_INDIAN_LOCALES.filter(
      (l) => !q || l.label.toLowerCase().includes(q) || l.nativeLabel.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    );
    return { mvp, ext };
  }, [langQuery]);

  function getQuestionSpeechText(currentStep: number): string {
    switch (currentStep) {
      case 1:
        return `${t.onboarding.step1Title}. ${t.onboarding.step1Hint}`;
      case 2:
        return `${t.onboarding.step2Title}. ${t.onboarding.step2Hint}`;
      case 3:
        return `${t.onboarding.step3Title}. ${t.onboarding.step3Hint}`;
      case 4:
        return `${t.onboarding.step4Title}. ${t.onboarding.step4Hint}`;
      case 5:
        return `${t.onboarding.step5Title}. ${t.onboarding.step5Hint}`;
      case 6:
        return `${t.onboarding.step6Title}. ${t.onboarding.step6Hint}`;
      default:
        return `${t.onboarding.step7Title}. ${t.onboarding.step7Hint}`;
    }
  }

  function mapComfortToDepth(comfort: ReadingComfortLevel): ExplanationDepth {
    if (comfort === "very_simple") return "very_simple";
    if (comfort === "comfortable") return "detailed";
    return "simple";
  }

  function handleNextFromAge() {
    if (parsedAge !== null && !prefs.accessibilityManualOverride) {
      const defaults = computeAgeDefaults(parsedAge);
      updatePrefs({
        fontSize: defaults.fontSize,
        fontScalePct: defaults.fontScalePct,
        audioSpeed: defaults.audioSpeed,
      });
    }
    setStep(3);
  }

  function handleStepAudioSpeed(direction: -1 | 1) {
    const currentIdx = AUDIO_SPEED_LADDER.indexOf(prefs.audioSpeed);
    const idx = currentIdx >= 0 ? currentIdx : 2;
    const nextIdx = Math.min(AUDIO_SPEED_LADDER.length - 1, Math.max(0, idx + direction));
    setAudioSpeed(AUDIO_SPEED_LADDER[nextIdx]);
  }

  async function handleFinish() {
    setErrorMsg(null);
    setSaving(true);
    const depth = mapComfortToDepth(readingComfort);
    updatePrefs({
      readingComfortLevel: readingComfort,
      explanationDepth: depth,
      preferredResponseFormat: responseFormat,
      preferredLanguage: selectedLang,
    });

    try {
      if (user?.role === "patient") {
        await api.updatePatientProfile({
          name: name.trim() || patientProfile?.name || "Patient",
          age_years: parsedAge,
          gender,
          onboarding_step: 7,
          onboarding_completed: true,
        });
        await api.updatePreferences({
          preferred_language: selectedLang,
          reading_comfort_level: readingComfort,
          explanation_depth: depth,
          preferred_response_format: responseFormat,
          font_size: prefs.fontSize,
          font_scale_pct: prefs.fontScalePct,
          audio_speed: prefs.audioSpeed,
          high_contrast: prefs.highContrast,
        });
        await refreshMe();
      }
      router.push(isDemoWalkthrough ? "/patient/instructions" : "/patient");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        try {
          await api.createOrCompletePatientOnboarding({
            name: name.trim() || "Patient",
            age_years: parsedAge,
            gender,
            onboarding_step: 7,
            onboarding_completed: true,
            preferences: {
              preferred_language: selectedLang,
              reading_comfort_level: readingComfort,
              explanation_depth: depth,
              preferred_response_format: responseFormat,
              font_size: prefs.fontSize,
              font_scale_pct: prefs.fontScalePct,
              audio_speed: prefs.audioSpeed,
              high_contrast: prefs.highContrast,
            },
          });
          await refreshMe();
          router.push("/patient");
          return;
        } catch {
          // Fall through to error message
        }
      }
      setErrorMsg(
        err instanceof ApiError ? err.message : "Saved locally, redirecting to Patient Home..."
      );
      router.push("/patient");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Progress Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold" style={{ color: "var(--ms-primary)" }}>
            {formatMessage(t.onboarding.stepOf, { step })}
          </span>
          <button
            type="button"
            onClick={() => speakTextWithMithi(getQuestionSpeechText(step), selectedLang, prefs.audioSpeed)}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
          >
            <Volume2 className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <span>{t.onboarding.hearQuestion}</span>
          </button>
        </div>

        <div
          className="h-3 w-full overflow-hidden rounded-full border"
          style={{ backgroundColor: "var(--ms-surface-alt)", borderColor: "var(--ms-border)" }}
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={7}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${Math.round((step / 7) * 100)}%`,
              backgroundColor: "var(--ms-primary)",
            }}
          />
        </div>
      </div>

      {/* Step Card (Strictly One Question per Screen) */}
      <section className="ms-card p-6 sm:p-8 space-y-6" aria-live="polite">
        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step1Title}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.onboarding.step1Hint}
            </p>
            <label htmlFor="onb-name" className="sr-only">
              {t.onboarding.step1Title}
            </label>
            <input
              id="onb-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.onboarding.step1Placeholder}
              className="tap-target-lg w-full rounded-2xl border-2 px-4 py-4 text-xl font-bold"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step2Title}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.onboarding.step2Hint}
            </p>
            <label htmlFor="onb-age" className="sr-only">
              {t.onboarding.step2Title}
            </label>
            <input
              id="onb-age"
              type="number"
              min={0}
              max={125}
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              placeholder={t.onboarding.step2Placeholder}
              className="tap-target-lg w-full rounded-2xl border-2 px-4 py-4 text-xl font-bold"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />

            <div className="space-y-2 pt-2">
              <p className="text-sm font-bold" style={{ color: "var(--ms-ink-muted)" }}>
                {t.onboarding.step2QuickPick}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Under 18", val: "16" },
                  { label: "18 – 39", val: "30" },
                  { label: "40 – 59", val: "50" },
                  { label: "60+", val: "64" },
                ].map((opt) => {
                  const selected = ageInput === opt.val;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setAgeInput(opt.val)}
                      className="tap-target-lg rounded-2xl border-2 px-3 font-extrabold"
                      style={{
                        backgroundColor: selected ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                        color: selected ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                        borderColor: selected ? "var(--ms-primary)" : "var(--ms-border)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step3Title}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.onboarding.step3Hint}
            </p>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.onboarding.step3Title}>
              {(
                [
                  { id: "male", label: t.onboarding.genderOptions.male },
                  { id: "female", label: t.onboarding.genderOptions.female },
                  { id: "other", label: t.onboarding.genderOptions.other },
                  { id: "prefer_not_to_say", label: t.onboarding.genderOptions.prefer_not_to_say },
                ] as const
              ).map((opt) => {
                const active = gender === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setGender(opt.id)}
                    className="tap-target-lg flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left text-lg font-bold"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <span>{opt.label}</span>
                    {active && <Check className="h-6 w-6" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step4Title}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.onboarding.step4Hint}
            </p>
            <div className="space-y-3" role="radiogroup" aria-label={t.onboarding.step4Title}>
              {(
                [
                  {
                    id: "very_simple",
                    label: t.accessibility.comfortOptions.very_simple,
                    desc: t.onboarding.comfortDescriptions.very_simple,
                  },
                  {
                    id: "simple",
                    label: t.accessibility.comfortOptions.simple,
                    desc: t.onboarding.comfortDescriptions.simple,
                  },
                  {
                    id: "comfortable",
                    label: t.accessibility.comfortOptions.comfortable,
                    desc: t.onboarding.comfortDescriptions.comfortable,
                  },
                  {
                    id: "adaptive",
                    label: t.accessibility.comfortOptions.adaptive,
                    desc: t.onboarding.comfortDescriptions.adaptive,
                  },
                ] as const
              ).map((opt) => {
                const active = readingComfort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setReadingComfort(opt.id)}
                    className="tap-target-lg flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 text-left"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <div>
                      <span className="block text-lg font-extrabold">{opt.label}</span>
                      <span className="block text-sm opacity-90">{opt.desc}</span>
                    </div>
                    {active && <Check className="h-6 w-6 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step5Title}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.onboarding.step5Hint}
            </p>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
                style={{ color: "var(--ms-ink-muted)" }}
                aria-hidden="true"
              />
              <input
                type="search"
                value={langQuery}
                onChange={(e) => setLangQuery(e.target.value)}
                placeholder={t.onboarding.step5SearchPlaceholder}
                aria-label={t.onboarding.step5SearchPlaceholder}
                className="tap-target w-full rounded-2xl border-2 py-3.5 pl-12 pr-4 text-base"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            </div>

            <div className="space-y-3" role="radiogroup" aria-label={t.onboarding.step5Title}>
              {filteredLocales.mvp.map((loc) => {
                const code = loc.code as SupportedLocale;
                const active = selectedLang === code;
                return (
                  <button
                    key={loc.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setSelectedLang(code);
                      setLanguage(code);
                    }}
                    className="tap-target-lg flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 text-left"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="h-6 w-6 shrink-0" aria-hidden="true" />
                      <div>
                        <span className="block text-lg font-extrabold">{loc.nativeLabel}</span>
                        {code === "hi-Latn" ? (
                          <span className="block text-xs opacity-90">{t.onboarding.step5HinglishNote}</span>
                        ) : (
                          <span className="block text-xs opacity-90">{loc.label}</span>
                        )}
                      </div>
                    </div>
                    {active && <Check className="h-6 w-6 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {filteredLocales.ext.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-extrabold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                  More Indian Languages (Extensible Architecture — Coming Soon)
                </p>
                <div className="flex flex-wrap gap-2">
                  {filteredLocales.ext.map((loc) => (
                    <span
                      key={loc.code}
                      className="rounded-xl border px-3 py-1.5 text-xs font-bold opacity-75"
                      style={{ borderColor: "var(--ms-border)" }}
                    >
                      {loc.nativeLabel} ({loc.label})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step6Title}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.onboarding.step6Hint}
            </p>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.onboarding.step6Title}>
              {(
                [
                  { id: "text", label: t.onboarding.formatOptions.text, desc: t.onboarding.formatOptions.textDesc, icon: FileText },
                  { id: "audio", label: t.onboarding.formatOptions.audio, desc: t.onboarding.formatOptions.audioDesc, icon: Headphones },
                  { id: "text_audio", label: t.onboarding.formatOptions.text_audio, desc: t.onboarding.formatOptions.text_audioDesc, icon: Sparkles },
                  { id: "visual", label: t.onboarding.formatOptions.visual, desc: t.onboarding.formatOptions.visualDesc, icon: Eye },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = responseFormat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setResponseFormat(opt.id)}
                    className="tap-target-lg flex items-start gap-3 rounded-2xl border-2 p-4 text-left"
                    style={{
                      backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <Icon className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="block text-lg font-extrabold">{opt.label}</span>
                      <span className="block text-sm opacity-90">{opt.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">{t.onboarding.step7Title}</h1>
              <p className="mt-1 text-base" style={{ color: "var(--ms-ink-muted)" }}>
                {t.onboarding.step7Hint}
              </p>
              {parsedAge !== null && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold" style={{ borderColor: "var(--ms-primary)", backgroundColor: "var(--ms-primary-soft)" }}>
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {t.onboarding.recommendedBadge} (Age {parsedAge}: {recommended.fontSize.toUpperCase()} / {recommended.audioSpeed}x)
                  </span>
                </p>
              )}
            </div>

            {/* Text Size Controls */}
            <div className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: "var(--ms-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-extrabold">
                  {t.accessibility.fontSize}: {prefs.fontSize.toUpperCase()} ({prefs.fontScalePct}%)
                </span>
                <button
                  type="button"
                  onClick={() => resetToRecommended(parsedAge)}
                  className="tap-target inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: "var(--ms-border)" }}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.accessibility.resetFont}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={decreaseFont}
                  className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 px-4"
                >
                  <Minus className="h-5 w-5" aria-hidden="true" />
                  <span>{t.accessibility.decreaseFont}</span>
                </button>
                <button
                  type="button"
                  onClick={increaseFont}
                  className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 px-4"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  <span>{t.accessibility.increaseFont}</span>
                </button>
              </div>
            </div>

            {/* Audio Speed Controls */}
            <div className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: "var(--ms-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-extrabold">
                  {t.accessibility.audioSpeed}: {prefs.audioSpeed}x
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleStepAudioSpeed(-1)}
                  className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 px-4"
                >
                  <Minus className="h-5 w-5" aria-hidden="true" />
                  <span>{t.onboarding.slowerAudio}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStepAudioSpeed(1)}
                  className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 px-4"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  <span>{t.onboarding.fasterAudio}</span>
                </button>
              </div>
            </div>

            {/* High Contrast Toggle */}
            <button
              type="button"
              onClick={toggleHighContrast}
              aria-pressed={prefs.highContrast}
              className="tap-target-lg flex w-full items-center justify-between rounded-2xl border-2 px-5 py-4 text-left font-extrabold"
              style={{
                backgroundColor: prefs.highContrast ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                color: prefs.highContrast ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                borderColor: "var(--ms-border)",
              }}
            >
              <span className="flex items-center gap-3">
                <Contrast className="h-6 w-6" aria-hidden="true" />
                <span>{prefs.highContrast ? t.accessibility.highContrastOn : t.accessibility.highContrastOff}</span>
              </span>
              <span>{prefs.highContrast ? "ON" : "OFF"}</span>
            </button>

            {/* Live Preview Card */}
            <div
              className="rounded-2xl border-2 p-5 space-y-3"
              style={{
                backgroundColor: "var(--ms-prov-doctor-bg)",
                borderColor: "var(--ms-prov-doctor-border)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wide">
                  {t.onboarding.previewTitle} — {t.onboarding.previewSampleTitle}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    speakTextWithMithi(
                      t.onboarding.previewSampleText,
                      selectedLang,
                      prefs.audioSpeed
                    )
                  }
                  className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-4 text-sm"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  <span>{t.onboarding.testVoice} ({prefs.audioSpeed}x)</span>
                </button>
              </div>
              <p className="text-base font-semibold leading-relaxed">
                {t.onboarding.previewSampleText}
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <p role="alert" className="text-sm font-bold" style={{ color: "var(--ms-danger-ink)" }}>
            {errorMsg}
          </p>
        )}

        {/* Step Navigation Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--ms-border)" }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="ms-btn-secondary tap-target-lg inline-flex items-center gap-2 px-5"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              <span>{t.onboarding.back}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center gap-3">
            {step === 3 && (
              <button
                type="button"
                onClick={() => {
                  setGender(null);
                  setStep(4);
                }}
                className="ms-btn-secondary tap-target-lg px-5"
              >
                {t.onboarding.skip}
              </button>
            )}

            {step < 7 ? (
              <button
                type="button"
                disabled={step === 1 && !name.trim()}
                onClick={() => {
                  if (step === 2) {
                    handleNextFromAge();
                  } else {
                    setStep((s) => Math.min(7, s + 1));
                  }
                }}
                className="ms-btn-primary tap-target-lg inline-flex items-center gap-2 px-6 disabled:opacity-50"
              >
                <span>{t.onboarding.next}</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleFinish()}
                className="ms-btn-primary tap-target-lg inline-flex items-center gap-2 px-6"
              >
                <Check className="h-5 w-5" aria-hidden="true" />
                <span>{saving ? t.onboarding.saving : t.onboarding.finish}</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="ms-card p-8 text-center font-bold">Loading onboarding...</div>}>
      <OnboardingFlow />
    </Suspense>
  );
}
