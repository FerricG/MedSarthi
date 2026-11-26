"use client";

import React from "react";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/i18n/I18nProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AccessibilityProvider>
        <AuthProvider>{children}</AuthProvider>
      </AccessibilityProvider>
    </I18nProvider>
  );
}
