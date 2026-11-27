"use client";

import React from "react";
import Link from "next/link";
import {
  BadgeAlert,
  FilePlus2,
  FlaskConical,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

export interface DoctorWorkspaceHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  showQuickDemoLink?: boolean;
}

export function DoctorWorkspaceHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back to Doctor Dashboard",
  actions,
  showQuickDemoLink = false,
}: DoctorWorkspaceHeaderProps) {
  const { doctorProfile, user } = useAuth();

  return (
    <header className="space-y-3">
      {/* Clinician Workspace Bar */}
      <div
        className="ms-card flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
        style={{
          borderLeftWidth: "8px",
          borderLeftColor: "var(--ms-primary)",
        }}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {backHref && (
              <BackButton
                variant="page"
                label={backLabel}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
              />
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide"
              style={{
                backgroundColor: "var(--ms-primary-soft)",
                borderColor: "var(--ms-primary)",
                color: "var(--ms-ink)",
              }}
            >
              <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
              <span>MedSarthi Clinician Workspace</span>
            </span>
            {doctorProfile && (
              <span className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                {doctorProfile.full_name}
                {doctorProfile.specialty ? ` • ${doctorProfile.specialty}` : ""}
                {doctorProfile.clinic_name ? ` • ${doctorProfile.clinic_name}` : ""}
              </span>
            )}
            {!doctorProfile && user?.email && (
              <span className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                {user.email}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {showQuickDemoLink && (
            <Link
              href="/doctor/consultations/new?demo=judge-uri"
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Load Judge Demo Scenario (URI + Fever &amp; Sore Throat)</span>
            </Link>
          )}
          {actions}
          {!actions && (
            <Link
              href="/doctor/consultations/new"
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>New Consultation</span>
            </Link>
          )}
        </div>
      </div>

      {/* Explicit Non-Clinical Prototype Disclosure inside Doctor Workspace */}
      <div
        role="note"
        aria-label="Non-clinical prototype disclosure"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-4 py-2.5 text-xs font-semibold"
        style={{
          backgroundColor: "var(--ms-banner-bg)",
          borderColor: "var(--ms-banner-border)",
          color: "var(--ms-banner-ink)",
        }}
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Prototype Notice:</strong> Synthetic data only — NOT clinically validated for real
            medical care. AI outputs require deterministic integrity checks and explicit clinician
            approval before sharing with patients.
          </span>
        </div>
        <span className="inline-flex items-center gap-1 font-bold">
          <BadgeAlert className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Doctor source remains immutable once locked</span>
        </span>
      </div>
    </header>
  );
}

export function DoctorWorkspaceFooter() {
  return (
    <footer
      className="mt-8 rounded-xl border-2 px-4 py-3 text-xs font-medium"
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
        color: "var(--ms-ink-muted)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          MedSarthi Doctor Workspace • Educational AI-thon Prototype • Synthetic Records Only • Never
          auto-approves or auto-shares without deterministic safety verification.
        </span>
        <span className="font-bold">Human-in-the-Loop Clinical Gate Active</span>
      </div>
    </footer>
  );
}

export function DoctorAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, refreshMe } = useAuth();
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleDemoDoctor() {
    setErr(null);
    setLoggingIn(true);
    try {
      await api.demoLogin("doctor");
      await refreshMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Demo doctor login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  if (isLoading) {
    return (
      <div className="ms-card p-8 text-center text-base font-semibold">
        Loading Doctor Workspace...
      </div>
    );
  }

  if (!user) {
    return (
      <section className="ms-card mx-auto max-w-xl space-y-4 p-6 text-center">
        <Stethoscope
          className="mx-auto h-10 w-10"
          style={{ color: "var(--ms-primary)" }}
          aria-hidden="true"
        />
        <h1 className="text-2xl font-extrabold">Clinician Sign-In Required</h1>
        <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
          Sign in with a doctor account or launch the synthetic demo doctor (Dr. Priya Mehta) to
          access linked patients, consultations, audio/OCR review, and safety gates.
        </p>
        {err && (
          <p
            role="alert"
            className="rounded-xl border-2 px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            {err}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={loggingIn}
            onClick={() => void handleDemoDoctor()}
            className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
            <span>{loggingIn ? "Signing in..." : "1-Click Demo Doctor (Dr. Priya Mehta)"}</span>
          </button>
          <Link
            href="/login"
            className="ms-btn-secondary tap-target inline-flex items-center px-5 py-2.5 text-sm"
          >
            Go to Sign In
          </Link>
        </div>
      </section>
    );
  }

  if (user.role !== "doctor") {
    return (
      <section className="ms-card mx-auto max-w-xl space-y-4 p-6 text-center">
        <BadgeAlert
          className="mx-auto h-10 w-10"
          style={{ color: "var(--ms-danger-border)" }}
          aria-hidden="true"
        />
        <h1 className="text-2xl font-extrabold">Doctor Role Required</h1>
        <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
          You are currently signed in as a Patient. The Doctor Workspace enforces strict role
          isolation and can only be opened by an authenticated clinician account.
        </p>
        {err && (
          <p
            role="alert"
            className="rounded-xl border-2 px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: "var(--ms-danger-bg)",
              borderColor: "var(--ms-danger-border)",
              color: "var(--ms-danger-ink)",
            }}
          >
            {err}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/patient"
            className="ms-btn-primary tap-target inline-flex items-center px-5 py-2.5 text-sm"
          >
            Return to Patient Home
          </Link>
          <button
            type="button"
            disabled={loggingIn}
            onClick={() => void handleDemoDoctor()}
            className="ms-btn-secondary tap-target inline-flex items-center px-5 py-2.5 text-sm"
          >
            {loggingIn ? "Switching..." : "Switch to Demo Doctor"}
          </button>
        </div>
      </section>
    );
  }

  return <React.Fragment key={user.id}>{children}</React.Fragment>;
}
