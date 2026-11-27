"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogIn, Sparkles, Stethoscope, UserCheck } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { login, guestLogin, refreshMe } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const data = await login(identifier.trim(), password);
      if (data.user.role === "doctor") {
        router.push("/doctor");
      } else if (data.patient_profile && !data.patient_profile.onboarding_completed) {
        router.push("/onboarding");
      } else {
        router.push("/patient");
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemo(role: "patient" | "doctor") {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await api.demoLogin(role);
      await refreshMe();
      router.push(role === "patient" ? "/patient" : "/doctor");
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to launch demo account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuest() {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await guestLogin("patient");
      router.push("/patient");
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to start guest session.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <BackButton variant="page" />
      </div>
      <section className="ms-card p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <LogIn className="h-7 w-7 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">{t.auth.signInTitle}</h1>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="login-identifier" className="mb-1.5 block text-sm font-bold">
              {t.auth.emailOrPhone}
            </label>
            <input
              id="login-identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="name@example.com or +91..."
              className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-bold">
              {t.auth.password}
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

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

          <button
            type="submit"
            disabled={submitting}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-center gap-2 px-5 text-base"
          >
            <span>{submitting ? t.auth.signingIn : t.auth.signInBtn}</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>

        <div className="border-t pt-4 text-center text-sm" style={{ borderColor: "var(--ms-border)" }}>
          <span style={{ color: "var(--ms-ink-muted)" }}>{t.auth.noAccount} </span>
          <Link href="/register" className="font-extrabold underline" style={{ color: "var(--ms-primary)" }}>
            {t.nav.register}
          </Link>
        </div>
      </section>

      <section className="ms-card p-5 space-y-3">
        <h2 className="text-lg font-extrabold">{t.auth.demoSectionTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleDemo("patient")}
            className="ms-btn-secondary tap-target flex items-center justify-center gap-2 px-4 text-sm"
          >
            <UserCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{t.auth.demoPatientBtn}</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleGuest()}
            className="ms-btn-secondary tap-target flex items-center justify-center gap-2 px-4 text-sm"
          >
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Use Without Account</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleDemo("doctor")}
            className="ms-btn-secondary tap-target flex items-center justify-center gap-2 px-4 text-sm"
          >
            <Stethoscope className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{t.auth.demoDoctorBtn}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
