"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import {
  api,
  type AuthResponseData,
  type DoctorProfile,
  type PatientProfile,
  type UserInfo,
} from "@/lib/api";

interface AuthContextValue {
  user: UserInfo | null;
  patientProfile: PatientProfile | null;
  doctorProfile: DoctorProfile | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<AuthResponseData>;
  demoLoginPatient: () => Promise<AuthResponseData>;
  demoLoginDoctor: () => Promise<AuthResponseData>;
  guestLogin: (role?: "patient" | "doctor", name?: string) => Promise<AuthResponseData>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { hydrateFromServer } = useAccessibility();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthData = useCallback(
    (data: AuthResponseData) => {
      setUser(data.user);
      setPatientProfile(data.patient_profile);
      setDoctorProfile(data.doctor_profile);
      if (data.preferences) {
        hydrateFromServer(data.preferences);
      }
    },
    [hydrateFromServer]
  );

  const refreshMe = useCallback(async () => {
    try {
      const data = await api.me();
      applyAuthData(data);
    } catch {
      setUser(null);
      setPatientProfile(null);
      setDoctorProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyAuthData]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const data = await api.login(identifier, password);
      applyAuthData(data);
      return data;
    },
    [applyAuthData]
  );

  const demoLoginPatient = useCallback(
    () => login("ramesh.demo@medsarthi.local", "DemoPatient#2026"),
    [login]
  );

  const demoLoginDoctor = useCallback(
    () => login("priya.doctor@medsarthi.local", "DemoDoctor#2026"),
    [login]
  );

  const guestLogin = useCallback(
    async (role: "patient" | "doctor" = "patient", name?: string) => {
      const data = await api.guestLogin(role, name);
      applyAuthData(data);
      return data;
    },
    [applyAuthData]
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setPatientProfile(null);
    setDoctorProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      patientProfile,
      doctorProfile,
      isLoading,
      login,
      demoLoginPatient,
      demoLoginDoctor,
      guestLogin,
      logout,
      refreshMe,
    }),
    [user, patientProfile, doctorProfile, isLoading, login, demoLoginPatient, demoLoginDoctor, guestLogin, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
