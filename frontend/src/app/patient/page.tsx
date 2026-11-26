"use client";

import React from "react";
import Link from "next/link";
import {
  ClipboardList,
  FileText,
  History,
  MessageCircle,
  Pill,
  Settings,
  Volume2,
} from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";

export default function PatientHomePage() {
  const { t } = useI18n();
  const { patientProfile } = useAuth();

  const actions = [
    {
      href: "/patient/instructions",
      label: t.patientHome.actions.instructions,
      hint: t.patientHome.actions.instructionsHint,
      icon: ClipboardList,
    },
    {
      href: "/patient/reports",
      label: t.patientHome.actions.report,
      hint: t.patientHome.actions.reportHint,
      icon: FileText,
    },
    {
      href: "/patient/medicines",
      label: t.patientHome.actions.medicine,
      hint: t.patientHome.actions.medicineHint,
      icon: Pill,
    },
    {
      href: "/patient/talk",
      label: t.patientHome.actions.talk,
      hint: t.patientHome.actions.talkHint,
      icon: MessageCircle,
    },
    {
      href: "/patient/listen",
      label: t.patientHome.actions.listen,
      hint: t.patientHome.actions.listenHint,
      icon: Volume2,
    },
    {
      href: "/patient/history",
      label: t.patientHome.actions.history,
      hint: t.patientHome.actions.historyHint,
      icon: History,
    },
  ];

  return (
    <PatientGate showBackHome={false}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            {patientProfile?.name && (
              <p className="text-base font-bold" style={{ color: "var(--ms-primary)" }}>
                {t.patientHome.welcomePrefix} {patientProfile.name}
              </p>
            )}
            <h1 className="text-2xl font-extrabold sm:text-3xl">{t.patientHome.greeting}</h1>
            <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              {t.patientHome.subtitle}
            </p>
          </div>

          <Link
            href="/patient/settings"
            className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>{t.nav.settings}</span>
          </Link>
        </div>

        {/* Exact 6 Clutter-Free Actions (Zero dashboards, zero charts, zero medical jargon) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="ms-card tap-target-lg flex items-start gap-4 p-5 text-left transition-transform hover:scale-[1.01]"
              >
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2"
                  style={{
                    backgroundColor: "var(--ms-primary-soft)",
                    borderColor: "var(--ms-primary)",
                    color: "var(--ms-primary)",
                  }}
                >
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="space-y-1">
                  <span className="block text-lg font-extrabold leading-snug">{action.label}</span>
                  <span className="block text-xs font-medium leading-snug" style={{ color: "var(--ms-ink-muted)" }}>
                    {action.hint}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </PatientGate>
  );
}
