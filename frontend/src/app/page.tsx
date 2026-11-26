"use client";

import React, { useEffect, useState } from "react";
import {
  ClipboardList,
  FileText,
  History,
  LogOut,
  MessageCircle,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError, type HealthResponseData } from "@/lib/api";

export default function HomePage() {
  const { t } = useI18n();
  const {
    user,
    patientProfile,
    doctorProfile,
    isLoading,
    login,
    demoLoginPatient,
    demoLoginDoctor,
    logout,
  } = useAuth();

  const [health, setHealth] = useState<HealthResponseData | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemo(kind: "patient" | "doctor") {
    setAuthError(null);
    setSubmitting(true);
    try {
      if (kind === "patient") {
        await demoLoginPatient();
      } else {
        await demoLoginDoctor();
      }
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : "Unable to sign in to demo account.");
    } finally {
      setSubmitting(false);
    }
  }

  const patientHomeActions = [
    { key: "instructions", label: t.patientHome.actions.instructions, icon: ClipboardList },
    { key: "report", label: t.patientHome.actions.report, icon: FileText },
    { key: "medicine", label: t.patientHome.actions.medicine, icon: Pill },
    { key: "talk", label: t.patientHome.actions.talk, icon: MessageCircle },
    { key: "listen", label: t.patientHome.actions.listen, icon: Volume2 },
    { key: "history", label: t.patientHome.actions.history, icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Live Backend Connection Status */}
      <section className="ms-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
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

        {user && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">
              {t.auth.signedInAs}{" "}
              <strong>
                {user.role === "patient"
                  ? `${patientProfile?.name ?? user.email} (${t.auth.rolePatient})`
                  : `${doctorProfile?.full_name ?? user.email} (${t.auth.roleDoctor})`}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>{t.auth.signOut}</span>
            </button>
          </div>
        )}
      </section>

      {isLoading ? (
        <section className="ms-card p-8 text-center font-semibold">Loading...</section>
      ) : !user ? (
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1-Click Synthetic Demo Mode */}
          <section className="ms-card space-y-4 p-6">
            <h1 className="text-2xl font-extrabold">{t.auth.demoSectionTitle}</h1>
            <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              {t.safety.prototypeBannerBody}
            </p>
            <div className="space-y-3 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDemo("patient")}
                className="ms-btn-primary tap-target-lg flex w-full items-center justify-center gap-3 px-5 text-left"
              >
                <UserCheck className="h-6 w-6 shrink-0" aria-hidden="true" />
                <span>{t.auth.demoPatientBtn}</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDemo("doctor")}
                className="ms-btn-secondary tap-target-lg flex w-full items-center justify-center gap-3 px-5 text-left"
              >
                <Stethoscope className="h-6 w-6 shrink-0" aria-hidden="true" />
                <span>{t.auth.demoDoctorBtn}</span>
              </button>
            </div>
          </section>

          {/* Standard Email/Phone Sign In */}
          <section className="ms-card space-y-4 p-6">
            <h2 className="text-2xl font-extrabold">{t.auth.signInTitle}</h2>
            <form onSubmit={(e) => void handleSignIn(e)} className="space-y-4">
              <div>
                <label htmlFor="ms-identifier" className="mb-1.5 block text-sm font-bold">
                  {t.auth.emailOrPhone}
                </label>
                <input
                  id="ms-identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="tap-target w-full rounded-xl border-2 px-3.5 py-2.5"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />
              </div>
              <div>
                <label htmlFor="ms-password" className="mb-1.5 block text-sm font-bold">
                  {t.auth.password}
                </label>
                <input
                  id="ms-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="tap-target w-full rounded-xl border-2 px-3.5 py-2.5"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />
              </div>
              {authError && (
                <p
                  role="alert"
                  className="rounded-xl border-2 px-3.5 py-2.5 text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--ms-danger-bg)",
                    borderColor: "var(--ms-danger-border)",
                    color: "var(--ms-danger-ink)",
                  }}
                >
                  {authError}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="ms-btn-primary tap-target w-full px-5"
              >
                {submitting ? t.auth.signingIn : t.auth.signInBtn}
              </button>
            </form>
          </section>
        </div>
      ) : user.role === "patient" ? (
        /* Clean 6-Action Patient Home Skeleton */
        <section className="space-y-5">
          <h1 className="text-2xl font-extrabold">{t.patientHome.greeting}</h1>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {patientHomeActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className="ms-card tap-target-lg flex items-center gap-4 p-5 text-left font-bold transition-transform hover:scale-[1.01]"
                >
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2"
                    style={{
                      backgroundColor: "var(--ms-primary-soft)",
                      borderColor: "var(--ms-primary)",
                      color: "var(--ms-primary)",
                    }}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="text-lg leading-snug">{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* 4-Category Provenance Legend Preview */}
          <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className="rounded-xl border-2 p-3 text-sm font-bold"
              style={{
                backgroundColor: "var(--ms-prov-doctor-bg)",
                borderColor: "var(--ms-prov-doctor-border)",
              }}
            >
              {t.provenance.doctorProvided}
            </div>
            <div
              className="rounded-xl border-2 p-3 text-sm font-bold"
              style={{
                backgroundColor: "var(--ms-prov-ai-bg)",
                borderColor: "var(--ms-prov-ai-border)",
              }}
            >
              {t.provenance.aiSimplified}
            </div>
            <div
              className="rounded-xl border-2 p-3 text-sm font-bold"
              style={{
                backgroundColor: "var(--ms-prov-kb-bg)",
                borderColor: "var(--ms-prov-kb-border)",
              }}
            >
              {t.provenance.generalEducation}
            </div>
            <div
              className="rounded-xl border-2 p-3 text-sm font-bold"
              style={{
                backgroundColor: "var(--ms-prov-uncertain-bg)",
                borderColor: "var(--ms-prov-uncertain-border)",
              }}
            >
              {t.provenance.uncertainOrMissing}
            </div>
          </div>
        </section>
      ) : (
        <section className="ms-card space-y-3 p-6">
          <h1 className="text-2xl font-extrabold">
            {doctorProfile?.full_name} — {doctorProfile?.specialty}
          </h1>
          <p style={{ color: "var(--ms-ink-muted)" }}>
            {doctorProfile?.clinic_name} • {doctorProfile?.registration_number}
          </p>
        </section>
      )}
    </div>
  );
}
