"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "medsarthi_navigation_history_v1";

export interface NavigationContextValue {
  history: string[];
  canGoBack: boolean;
  previousRoute: string | null;
  previousPageTitle: string;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

function getFallbackForPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  if (pathname.startsWith("/patient/") && pathname !== "/patient") {
    return "/patient";
  }
  if (pathname === "/patient") {
    return "/";
  }
  if (pathname.startsWith("/doctor/") && pathname !== "/doctor") {
    return "/doctor";
  }
  if (pathname === "/doctor") {
    return "/";
  }
  if (pathname === "/login" || pathname === "/register") {
    return "/";
  }
  if (pathname.startsWith("/onboarding")) {
    return "/patient";
  }
  return "/";
}

export function getFriendlyPageTitle(path: string | null): string {
  if (!path) return "Previous Page";
  if (path === "/") return "Home";
  if (path === "/patient") return "Mode Selection";
  if (path === "/patient/guided") return "Guided Helper";
  if (path === "/patient/detailed") return "Patient Home";
  if (path === "/patient/talk") return "Ask Dr. Sarthi";
  if (path === "/patient/medicines") return "Medicines";
  if (path === "/patient/instructions") return "Instructions";
  if (path.startsWith("/patient/instructions/")) return "Prescription Note";
  if (path === "/patient/reports") return "Reports & Tests";
  if (path === "/patient/history") return "Consultation History";
  if (path === "/patient/settings") return "Settings";
  if (path === "/patient/listen") return "Audio Player";
  if (path === "/doctor") return "Doctor Workspace";
  if (path === "/doctor/consultations/new") return "New Consultation";
  if (path.startsWith("/doctor/consultations/")) return "Consultation Details";
  if (path.startsWith("/doctor/patients/")) return "Patient Record";
  if (path === "/login") return "Sign In";
  if (path === "/register") return "Register";
  if (path === "/onboarding") return "Profile Setup";
  return "Last Page";
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const isNavigatingBackRef = useRef(false);

  // Initialize history from sessionStorage once on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistoryStack(parsed);
          return;
        }
      }
    } catch {
      // sessionStorage unavailable or parse error
    }

    if (pathname) {
      setHistoryStack([pathname]);
    }
  }, []);

  // Update history stack on route change
  useEffect(() => {
    if (!pathname) return;

    if (isNavigatingBackRef.current) {
      // Back action already handled stack popping
      isNavigatingBackRef.current = false;
      return;
    }

    setHistoryStack((prev) => {
      // If same as top of stack, don't duplicate
      if (prev.length > 0 && prev[prev.length - 1] === pathname) {
        return prev;
      }

      // If user navigated back via browser button to previous item, pop top
      if (prev.length > 1 && prev[prev.length - 2] === pathname) {
        const popped = prev.slice(0, prev.length - 1);
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(popped));
        } catch {}
        return popped;
      }

      // Append new route (keep last 30 entries)
      const nextStack = [...prev, pathname].slice(-30);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextStack));
      } catch {}
      return nextStack;
    });
  }, [pathname]);

  const previousRoute =
    historyStack.length > 1 ? historyStack[historyStack.length - 2] : null;

  const canGoBack = Boolean(pathname && pathname !== "/");

  const previousPageTitle = getFriendlyPageTitle(
    previousRoute || (pathname ? getFallbackForPath(pathname) : null)
  );

  function goBack() {
    if (!pathname || pathname === "/") return;

    if (historyStack.length > 1) {
      const target = historyStack[historyStack.length - 2];
      const nextStack = historyStack.slice(0, historyStack.length - 1);
      setHistoryStack(nextStack);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextStack));
      } catch {}

      isNavigatingBackRef.current = true;
      router.push(target);
      return;
    }

    // Fallback if direct entry or refreshed on subpage
    const fallback = getFallbackForPath(pathname);
    isNavigatingBackRef.current = true;
    router.push(fallback);
  }

  return (
    <NavigationContext.Provider
      value={{
        history: historyStack,
        canGoBack,
        previousRoute,
        previousPageTitle,
        goBack,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useAppNavigation must be used within NavigationProvider");
  }
  return ctx;
}
