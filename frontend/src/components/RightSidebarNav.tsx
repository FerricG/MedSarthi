"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  FileText,
  History,
  Home,
  MessageCircle,
  Pill,
  Settings,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function RightSidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Show only for patient portal routes or patient users
  const isPatientRoute = pathname?.startsWith("/patient");
  if (!isPatientRoute && user?.role !== "patient") {
    return null;
  }

  const navItems = [
    { href: "/patient", label: "Mode", icon: Compass, exact: true },
    { href: "/patient/detailed", label: "Patient Home", icon: Home, exact: true },
    { href: "/patient/guided", label: "Guided Helper", icon: Sparkles },
    { href: "/patient/instructions", label: "Instructions", icon: ClipboardList },
    { href: "/patient/reports", label: "Reports", icon: FileText },
    { href: "/patient/medicines", label: "Medicines", icon: Pill },
    { href: "/patient/talk", label: "Talk", icon: MessageCircle },
    { href: "/patient/listen", label: "Listen", icon: Volume2 },
    { href: "/patient/history", label: "History", icon: History },
    { href: "/patient/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      aria-label="Quick Navigation Sidebar"
      className="fixed right-2 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center rounded-2xl border-2 p-1.5 shadow-xl transition-all sm:right-3"
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
      }}
    >
      {/* Collapse Toggle */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mb-1 rounded-lg p-1 text-xs opacity-60 hover:opacity-100"
        aria-label={collapsed ? "Expand right navigation sidebar" : "Collapse right navigation sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);

            return (
              <div key={item.href} className="group relative flex items-center justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className="tap-target flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all hover:scale-105"
                  style={{
                    backgroundColor: isActive ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                    color: isActive ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: isActive ? "var(--ms-primary)" : "transparent",
                  }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </Link>

                {/* Hover Tooltip (Pops to the left of the icon) */}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-12 z-50 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-extrabold shadow-md opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
