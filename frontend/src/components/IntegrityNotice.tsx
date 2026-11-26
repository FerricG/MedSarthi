"use client";

import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeIntegrityReport, type IntegrityReport } from "@/lib/api";

export interface IntegrityNoticeProps {
  report?: IntegrityReport | unknown;
  status?: "unchecked" | "passed" | "warning" | "blocked";
  showDetailsByDefault?: boolean;
}

export function IntegrityNotice({
  report,
  status,
  showDetailsByDefault = false,
}: IntegrityNoticeProps) {
  const { t } = useI18n();
  const normalized = normalizeIntegrityReport(report, status);
  const effectiveStatus = normalized.status;
  const [expanded, setExpanded] = useState(
    showDetailsByDefault || effectiveStatus === "blocked" || effectiveStatus === "warning"
  );

  const config = {
    passed: {
      icon: ShieldCheck,
      title: t.safety.integrityPassed,
      bg: "var(--ms-prov-doctor-bg)",
      border: "var(--ms-prov-doctor-border)",
      ink: "var(--ms-ink)",
      badge: "VERIFIED MATCH",
    },
    warning: {
      icon: AlertTriangle,
      title: t.safety.integrityWarning,
      bg: "var(--ms-prov-uncertain-bg)",
      border: "var(--ms-prov-uncertain-border)",
      ink: "var(--ms-ink)",
      badge: "NEEDS DOUBLE-CHECK",
    },
    blocked: {
      icon: ShieldAlert,
      title: t.safety.integrityBlocked,
      bg: "var(--ms-danger-bg)",
      border: "var(--ms-danger-border)",
      ink: "var(--ms-danger-ink)",
      badge: "SAFETY HOLD",
    },
    unchecked: {
      icon: Info,
      title: "Safety consistency check has not run yet.",
      bg: "var(--ms-surface-alt)",
      border: "var(--ms-border)",
      ink: "var(--ms-ink)",
      badge: "UNCHECKED",
    },
  }[effectiveStatus];

  const Icon = config.icon;
  const hasMismatches = normalized.mismatches && normalized.mismatches.length > 0;

  return (
    <aside
      role={effectiveStatus === "blocked" ? "alert" : "status"}
      aria-live={effectiveStatus === "blocked" ? "assertive" : "polite"}
      className="rounded-2xl border-2 p-4 space-y-2.5"
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
        color: config.ink,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: config.border,
                  color: config.ink,
                }}
              >
                {config.badge}
              </span>
              {typeof normalized.rules_evaluated === "number" && (
                <span className="text-xs font-semibold">
                  {normalized.rules_evaluated} critical fields checked
                </span>
              )}
              {typeof normalized.matched_items === "number" && (
                <span className="text-xs font-semibold">
                  {normalized.matched_items} items matched
                </span>
              )}
            </div>
            <p className="text-sm font-bold leading-snug">{config.title}</p>
          </div>
        </div>

        {(hasMismatches || normalized.disclaimer) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="tap-target inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold"
            style={{
              backgroundColor: "var(--ms-surface)",
              borderColor: config.border,
              color: config.ink,
            }}
            aria-expanded={expanded}
          >
            <span>{expanded ? "Hide check details" : "View check details"}</span>
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-2.5 pt-1">
          {hasMismatches && (
            <div className="space-y-2">
              {normalized.mismatches.map((m, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border-2 p-3 text-sm space-y-1"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: config.border,
                    color: "var(--ms-ink)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold uppercase text-xs">{m.field}</span>
                    <span className="rounded px-1.5 py-0.5 text-xs font-bold border">
                      {m.severity}
                    </span>
                  </div>
                  <p className="font-semibold">{m.message}</p>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <p className="rounded bg-black/5 p-2">
                      <strong>Doctor Original:</strong> {m.source_value || "—"}
                    </p>
                    <p className="rounded bg-black/5 p-2">
                      <strong>Explanation Output:</strong> {m.output_value || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs leading-relaxed opacity-90">
            {normalized.disclaimer || t.safety.integrityDisclaimer}
          </p>
        </div>
      )}
    </aside>
  );
}
