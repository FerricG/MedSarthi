"use client";

import React from "react";
import Link from "next/link";
import {
  ClipboardList,
  Compass,
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

export default function PatientDetailedHomePage() {
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
            <h1 className="text-3xl font-extrabold tracking-tight">{t.patientHome.greeting}</h1>
            <p className="text-base" style={{ color: "var(--ms-ink-muted)" }}>
              {t.patientHome.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/patient"
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              <span>Change Mode / Language</span>
            </Link>
            <Link
              href="/patient/settings"
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
              <span>{t.nav.settings}</span>
            </Link>
          </div>
        </div>

        {/* 6 Large Accessible Action Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="ms-card tap-target-lg group flex flex-col justify-between gap-4 p-6 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: "var(--ms-primary-soft)",
                      color: "var(--ms-primary)",
                    }}
                  >
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-extrabold leading-snug">{item.label}</h2>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
                      {item.hint}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-extrabold" style={{ color: "var(--ms-primary)" }}>
                  Open →
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </PatientGate>
  );
}
