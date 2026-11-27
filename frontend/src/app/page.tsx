"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Compass,
  FileText,
  Languages,
  MessageCircle,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Volume2,
} from "lucide-react";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import { api, ApiError, type HealthResponseData } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { locale, setLocale, t, formatMessage } = useI18n();
  const { setLanguage } = useAccessibility();
  const { user, patientProfile, doctorProfile, isLoading, guestLogin, refreshMe } = useAuth();

  const [health, setHealth] = useState<HealthResponseData | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  const walkthroughSteps = useMemo(
    () => [
      {
        step: 1,
        title: t.landing.demo.steps.step1Title,
        desc: t.landing.demo.steps.step1Desc,
        href: "/onboarding?demo=1",
      },
      {
        step: 2,
        title: t.landing.demo.steps.step2Title,
        desc: t.landing.demo.steps.step2Desc,
        href: "/patient/instructions",
      },
      {
        step: 3,
        title: t.landing.demo.steps.step3Title,
        desc: t.landing.demo.steps.step3Desc,
        href: "/patient/instructions",
      },
      {
        step: 4,
        title: t.landing.demo.steps.step4Title,
        desc: t.landing.demo.steps.step4Desc,
        href: "/patient/instructions",
      },
      {
        step: 5,
        title: t.landing.demo.steps.step5Title,
        desc: t.landing.demo.steps.step5Desc,
        href: "/patient/instructions",
      },
      {
        step: 6,
        title: t.landing.demo.steps.step6Title,
        desc: t.landing.demo.steps.step6Desc,
        href: "/patient/instructions",
      },
      {
        step: 7,
        title: t.landing.demo.steps.step7Title,
        desc: t.landing.demo.steps.step7Desc,
        href: "/patient/talk?q=Kya%20iska%20matlab%20mujhe%20pneumonia%20hai%3F",
      },
    ],
    [t]
  );

  useEffect(() => {
    api
      .health()
      .then((data) => {
        setHealth(data);
        setHealthError(false);
      })
      .catch(() => {
        setHealthError(true);
      });
  }, []);

  async function launchDemo(kind: "patient" | "doctor", redirectPath?: string) {
    setDemoError(null);
    setSubmitting(true);
    try {
      await api.demoLogin(kind);
      await refreshMe();
      if (redirectPath) {
        router.push(redirectPath);
      } else {
        router.push(kind === "patient" ? "/patient" : "/doctor");
      }
    } catch (err) {
      setDemoError(
        err instanceof ApiError
          ? err.message
          : "Unable to connect to backend for demo login. Ensure uvicorn is running on port 8000."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function launchGuest(role: "patient" | "doctor" = "patient") {
    setDemoError(null);
    setSubmitting(true);
    try {
      await guestLogin(role);
      router.push(role === "patient" ? "/patient" : "/doctor");
    } catch (err) {
      setDemoError(
        err instanceof ApiError
          ? err.message
          : "Unable to connect to backend for guest session. Ensure uvicorn is running on port 8000."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleLanguageSwitch(next: SupportedLocale) {
    setLocale(next);
    setLanguage(next);
    if (user?.role === "patient") {
      void api.updatePreferences({ preferred_language: next }).catch(() => {});
    }
  }

  return (
    <div className="space-y-6">
      {/* Live Backend Status Strip */}
      <section className="ms-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <span className="font-bold">{t.auth.backendStatus}:</span>
          {health ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-primary-soft)",
                borderColor: "var(--ms-primary)",
                color: "var(--ms-ink)",
              }}
            >
              {t.auth.statusOnline} • DB {health.db} • OCR {health.ocr_local}
            </span>
          ) : healthError ? (
            <span className="text-sm font-semibold" style={{ color: "var(--ms-danger-ink)" }}>
              {t.auth.statusOffline}
            </span>
          ) : (
            <span className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              {t.auth.statusChecking}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isLoading && user ? (
            <Link
              href={user.role === "patient" ? "/patient" : "/doctor"}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <span>
                {formatMessage(t.landing.continueAs, {
                  name:
                    user.role === "patient"
                      ? patientProfile?.name || t.auth.rolePatient
                      : doctorProfile?.full_name || t.auth.roleDoctor,
                })}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void launchGuest("patient")}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-4 text-sm"
              >
                <span>{t.landing.useWithoutAccount}</span>
              </button>
              <Link href="/login" className="ms-btn-secondary tap-target inline-flex items-center px-4 text-sm">
                {t.nav.signIn}
              </Link>
              <Link href="/register" className="ms-btn-primary tap-target inline-flex items-center px-4 text-sm">
                {t.nav.register}
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Universal Language Selector Bar */}
      <section className="ms-card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <span className="font-bold text-sm">
            {locale === "hi"
              ? "भाषा चुनें:"
              : locale === "hi-Latn"
              ? "Bhasha chunein:"
              : "Select Language / अपनी भाषा चुनें:"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SUPPORTED_LOCALES.slice(0, 5).map((opt) => (
            <button
              key={opt.code}
              type="button"
              onClick={() => handleLanguageSwitch(opt.code)}
              className="tap-target rounded-full px-3 py-1 text-xs font-bold transition-all"
              style={{
                backgroundColor: locale === opt.code ? "var(--ms-primary)" : "var(--ms-primary-soft)",
                color: locale === opt.code ? "#ffffff" : "var(--ms-ink)",
                border: "1px solid var(--ms-primary)",
              }}
            >
              {opt.nativeLabel}
            </button>
          ))}
          <select
            value={locale}
            aria-label="All supported languages"
            onChange={(e) => handleLanguageSwitch(e.target.value as SupportedLocale)}
            className="rounded-full border px-3 py-1 text-xs font-bold"
            style={{
              borderColor: "var(--ms-primary)",
              backgroundColor: "var(--ms-card-bg)",
              color: "var(--ms-ink)",
            }}
          >
            {SUPPORTED_LOCALES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.nativeLabel} ({opt.label})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Hero: Non-Chatbot Clinical Communication Bridge */}
      <section className="ms-card p-6 sm:p-8 space-y-5">
        <div className="space-y-2.5 max-w-3xl">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
            style={{
              backgroundColor: "var(--ms-primary-soft)",
              borderColor: "var(--ms-primary)",
              color: "var(--ms-ink)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.landing.heroBadge}</span>
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t.landing.heroTitle}
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
            {t.landing.heroSubtitle}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-doctor-border)", backgroundColor: "var(--ms-prov-doctor-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <Stethoscope className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.landing.features.provenanceTitle}</span>
            </div>
            <p className="text-xs">{t.landing.features.provenanceDesc}</p>
          </div>

          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-ai-border)", backgroundColor: "var(--ms-prov-ai-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.landing.features.multilingualTitle}</span>
            </div>
            <p className="text-xs">{t.landing.features.multilingualDesc}</p>
          </div>

          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-kb-border)", backgroundColor: "var(--ms-prov-kb-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.landing.features.accessibleVoiceTitle}</span>
            </div>
            <p className="text-xs">{t.landing.features.accessibleVoiceDesc}</p>
          </div>

          <div className="rounded-xl border-2 p-3.5 space-y-1" style={{ borderColor: "var(--ms-prov-uncertain-border)", backgroundColor: "var(--ms-prov-uncertain-bg)" }}>
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.landing.features.integrityGateTitle}</span>
            </div>
            <p className="text-xs">{t.landing.features.integrityGateDesc}</p>
          </div>
        </div>
      </section>

      {/* 1-Click Judge Demo Flow */}
      <section className="ms-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold">{t.auth.demoSectionTitle}</h2>
            <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              {t.landing.demo.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWalkthrough((v) => !v)}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
          >
            <Compass className="h-5 w-5" aria-hidden="true" />
            <span>{t.auth.guidedDemoBtn}</span>
          </button>
        </div>

        {demoError && (
          <p
            role="alert"
            className="rounded-xl border-2 px-4 py-3 text-sm font-semibold"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            {demoError}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void launchDemo("patient", "/patient")}
            className="ms-btn-primary tap-target-lg flex items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <UserCheck className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-base font-extrabold">{t.auth.demoPatientBtn}</span>
                <span className="block text-xs font-medium opacity-90">
                  {t.landing.demo.patientDesc}
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void launchGuest("patient")}
            className="ms-btn-secondary tap-target-lg flex items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-base font-extrabold">{t.landing.useWithoutAccountGuest}</span>
                <span className="block text-xs font-medium" style={{ color: "var(--ms-ink-muted)" }}>
                  {t.landing.guestWorkspaceDesc}
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void launchDemo("doctor", "/doctor")}
            className="ms-btn-secondary tap-target-lg flex items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <Stethoscope className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-base font-extrabold">{t.auth.demoDoctorBtn}</span>
                <span className="block text-xs font-medium" style={{ color: "var(--ms-ink-muted)" }}>
                  {t.landing.demo.doctorDesc}
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
        </div>

        {showWalkthrough && (
          <div
            className="rounded-2xl border-2 p-4 sm:p-5 space-y-3"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-primary)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-extrabold">{t.landing.demo.walkthroughTitle}</h3>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void launchDemo("patient", "/onboarding?demo=1")}
                className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
              >
                <span>{t.landing.demo.launchStep1}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {walkthroughSteps.map((item) => (
                <button
                  key={item.step}
                  type="button"
                  disabled={submitting}
                  onClick={() => void launchDemo("patient", item.href)}
                  className="ms-card tap-target flex flex-col justify-between gap-2 p-3.5 text-left hover:opacity-90"
                >
                  <div className="space-y-1">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold"
                      style={{
                        backgroundColor: "var(--ms-primary-soft)",
                        color: "var(--ms-ink)",
                      }}
                    >
                      {formatMessage(t.landing.demo.stepLabel, { step: item.step })}
                    </span>
                    <h4 className="text-sm font-extrabold">{item.title}</h4>
                    <p className="text-xs leading-snug" style={{ color: "var(--ms-ink-muted)" }}>
                      {item.desc}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--ms-primary)" }}>
                    <span>{t.landing.demo.openStep}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Quick Preview of the 6 Patient Capabilities */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: ClipboardList, title: t.patientHome.actions.instructions, desc: t.patientHome.actions.instructionsHint },
          { icon: FileText, title: t.patientHome.actions.report, desc: t.patientHome.actions.reportHint },
          { icon: Pill, title: t.patientHome.actions.medicine, desc: t.patientHome.actions.medicineHint },
          { icon: MessageCircle, title: t.patientHome.actions.talk, desc: t.patientHome.actions.talkHint },
          { icon: Volume2, title: t.patientHome.actions.listen, desc: t.patientHome.actions.listenHint },
          { icon: BookOpen, title: t.patientHome.actions.history, desc: t.patientHome.actions.historyHint },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="ms-card flex items-start gap-3 p-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  backgroundColor: "var(--ms-primary-soft)",
                  borderColor: "var(--ms-primary)",
                  color: "var(--ms-primary)",
                }}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold">{card.title}</h3>
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  {card.desc}
                </p>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

