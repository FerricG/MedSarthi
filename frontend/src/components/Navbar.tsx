"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  FileText,
  History,
  Home,
  LogOut,
  MessageCircle,
  Pill,
  Settings,
  Stethoscope,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";

export interface NavbarProps {
  compact?: boolean;
}

export function Navbar({ compact = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, patientProfile, doctorProfile, logout } = useAuth();
  const { t } = useI18n();

  if (!user || pathname?.startsWith("/onboarding")) {
    return null;
  }

  const patientLinks = [
    { href: "/patient", label: "Mode", icon: Home, exact: true },
    { href: "/patient/detailed", label: t.nav.patientHome, icon: Home, exact: true },
    { href: "/patient/guided", label: "Guided Helper", icon: Volume2 },
    { href: "/patient/instructions", label: t.nav.instructions, icon: ClipboardList },
    { href: "/patient/reports", label: t.nav.reports, icon: FileText },
    { href: "/patient/medicines", label: t.nav.medicines, icon: Pill },
    { href: "/patient/talk", label: t.nav.talk, icon: MessageCircle },
    { href: "/patient/listen", label: t.nav.listen, icon: Volume2 },
    { href: "/patient/history", label: t.nav.history, icon: History },
    { href: "/patient/settings", label: t.nav.settings, icon: Settings },
  ];

  const doctorLinks = [
    { href: "/doctor", label: t.nav.doctorWorkspace, icon: Stethoscope, exact: true },
  ];

  const links = user.role === "patient" ? patientLinks : doctorLinks;

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <nav
      aria-label="Primary navigation"
      className={compact ? "pt-2" : "border-t pt-2.5 mt-2.5"}
      style={{ borderColor: "var(--ms-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {links.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="tap-target inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                  color: isActive ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: isActive ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-bold sm:inline" style={{ color: "var(--ms-ink-muted)" }}>
            {user.email?.endsWith("@guest.medsarthi.local")
              ? `${user.role === "patient" ? patientProfile?.name || "Guest" : doctorProfile?.full_name || "Guest"} (No Account)`
              : user.role === "patient"
                ? patientProfile?.name || user.email
                : doctorProfile?.full_name || user.email}
          </span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-sm"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{t.auth.signOut}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
