"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Stethoscope, User, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { guestLogin, refreshMe } = useAuth();

  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() && !phone.trim()) {
      setErrorMsg("Please enter an email address or phone number.");
      return;
    }
    setSubmitting(true);
    try {
      await api.register({
        role,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        doctor_details:
          role === "doctor"
            ? {
                specialty: specialty.trim() || undefined,
                clinic_name: clinicName.trim() || undefined,
              }
            : undefined,
      });
      await refreshMe();
      router.push(role === "patient" ? "/onboarding" : "/doctor");
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not create account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="ms-card p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <UserPlus className="h-7 w-7 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">{t.auth.registerTitle}</h1>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">I am registering as:</legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("patient")}
                aria-pressed={role === "patient"}
                className="tap-target-lg flex items-center justify-center gap-2 rounded-xl border-2 px-4 font-bold"
                style={{
                  backgroundColor: role === "patient" ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                  color: role === "patient" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: role === "patient" ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                <User className="h-5 w-5" aria-hidden="true" />
                <span>{t.auth.rolePatient}</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("doctor")}
                aria-pressed={role === "doctor"}
                className="tap-target-lg flex items-center justify-center gap-2 rounded-xl border-2 px-4 font-bold"
                style={{
                  backgroundColor: role === "doctor" ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                  color: role === "doctor" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: role === "doctor" ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                <Stethoscope className="h-5 w-5" aria-hidden="true" />
                <span>{t.auth.roleDoctor}</span>
              </button>
            </div>
          </fieldset>

          <div>
            <label htmlFor="reg-name" className="mb-1.5 block text-sm font-bold">
              Full Name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={role === "doctor" ? "Dr. Ananya Rao" : "Ramesh Sharma"}
              className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg-email" className="mb-1.5 block text-sm font-bold">
                Email (or leave blank if using Phone)
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            </div>
            <div>
              <label htmlFor="reg-phone" className="mb-1.5 block text-sm font-bold">
                Phone Number (Optional)
              </label>
              <input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+9198XXXXXXXX"
                className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            </div>
          </div>

          {role === "doctor" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-specialty" className="mb-1.5 block text-sm font-bold">
                  Specialty (Optional)
                </label>
                <input
                  id="reg-specialty"
                  type="text"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Internal Medicine"
                  className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />
              </div>
              <div>
                <label htmlFor="reg-clinic" className="mb-1.5 block text-sm font-bold">
                  Clinic / Hospital Name (Optional)
                </label>
                <input
                  id="reg-clinic"
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="City Health Clinic"
                  className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="reg-password" className="mb-1.5 block text-sm font-bold">
              {t.auth.password} (minimum 8 characters)
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            />
          </div>

          {errorMsg && (
            <p
              role="alert"
              className="rounded-xl border-2 px-4 py-3 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-danger-bg)",
                borderColor: "var(--ms-danger-border)",
                color: "var(--ms-danger-ink)",
              }}
            >
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-center gap-2 px-5 text-base"
          >
            <span>{submitting ? t.auth.registering : t.auth.registerBtn}</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>

        <div className="border-t pt-4 space-y-3 text-center text-sm" style={{ borderColor: "var(--ms-border)" }}>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setErrorMsg(null);
              setSubmitting(true);
              try {
                await guestLogin("patient");
                router.push("/patient");
              } catch (err) {
                setErrorMsg(err instanceof ApiError ? err.message : "Could not start guest session.");
              } finally {
                setSubmitting(false);
              }
            }}
            className="ms-btn-secondary tap-target inline-flex w-full items-center justify-center gap-2 px-4 text-sm"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Continue Without Account (Guest)</span>
          </button>
          <div>
            <span style={{ color: "var(--ms-ink-muted)" }}>{t.auth.haveAccount} </span>
            <Link href="/login" className="font-extrabold underline" style={{ color: "var(--ms-primary)" }}>
              {t.nav.signIn}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
