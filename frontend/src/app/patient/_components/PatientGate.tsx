"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Settings, UserCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";

export interface PatientGateProps {
  children: React.ReactNode;
  showBackHome?: boolean;
  title?: string;
}

export function PatientGate({ children, showBackHome = true, title }: PatientGateProps) {
  const { user, isLoading, refreshMe } = useAuth();
  const { t } = useI18n();
  const [demoLoading, setDemoLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleDemoPatient() {
    setDemoLoading(true);
    setErrorMsg(null);
    try {
      await api.demoLogin("patient");
      await refreshMe();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not sign into demo patient.");
    } finally {
      setDemoLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="ms-card p-8 text-center text-base font-bold">
        Loading your health space...
      </div>
    );
  }

  if (!user) {
    return (
      <section className="ms-card mx-auto max-w-xl p-6 sm:p-8 space-y-4 text-center">
        <h1 className="text-2xl font-extrabold">Please sign in to view your health space</h1>
        <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
          Sign in with your MedSarthi account or launch the instant synthetic Demo Patient (Ramesh Sharma).
        </p>
        {errorMsg && (
          <p className="text-sm font-bold" style={{ color: "var(--ms-danger-ink)" }}>
            {errorMsg}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={demoLoading}
            onClick={() => void handleDemoPatient()}
            className="ms-btn-primary tap-target-lg inline-flex items-center gap-2 px-5"
          >
            <UserCheck className="h-5 w-5" aria-hidden="true" />
            <span>{demoLoading ? t.auth.signingIn : t.auth.demoPatientBtn}</span>
          </button>
          <Link href="/login" className="ms-btn-secondary tap-target-lg inline-flex items-center px-5">
            {t.nav.signIn}
          </Link>
        </div>
      </section>
    );
  }

  if (user.role === "doctor") {
    return (
      <section className="ms-card mx-auto max-w-xl p-6 space-y-4">
        <h1 className="text-xl font-extrabold">Doctor Account Active</h1>
        <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
          You are currently signed in as a Doctor. Open the Doctor Workspace or switch to the Demo Patient account.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/doctor" className="ms-btn-primary tap-target inline-flex items-center px-4">
            Open Doctor Workspace
          </Link>
          <button
            type="button"
            disabled={demoLoading}
            onClick={() => void handleDemoPatient()}
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            <span>Switch to Demo Patient</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {(showBackHome || title) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showBackHome ? (
            <Link
              href="/patient"
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t.nav.backToHome}</span>
            </Link>
          ) : (
            <div />
          )}

          <Link
            href="/patient/settings"
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>{t.nav.settings}</span>
          </Link>
        </div>
      )}
      {children}
    </div>
  );
}
