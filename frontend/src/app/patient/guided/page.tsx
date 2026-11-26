"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  Clock,
  Edit3,
  FileCheck2,
  LogIn,
  MessageCircle,
  Pill,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Moon,
  Upload,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { InteractiveNarrator, type NarratorPose } from "@/components/InteractiveNarrator";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, useI18n } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  type MedicalDocumentDTO,
  type ProvenancePayload,
} from "@/lib/api";

interface GuidedChatMessage {
  role: "patient" | "assistant";
  text: string;
}

const STEP_LABELS = [
  "Start",
  "Prescription Photo",
  "Check Details",
  "Medicines",
  "Questions",
  "Review & Rating",
];

function buildSamplePrescriptionPng(): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 620;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 28px Arial, sans-serif";
      ctx.fillText("SYNTHETIC CLINIC PRESCRIPTION", 40, 56);
      ctx.font = "22px Arial, sans-serif";
      ctx.fillText("Patient: Ramesh Sharma | Age: 64 | Gender: Male", 40, 112);
      ctx.fillText("Date: 2026-11-26", 40, 152);
      ctx.fillText("Diagnosis: Viral Fever & Upper Respiratory Infection", 40, 204);
      ctx.fillText("Rx:", 40, 256);
      ctx.fillText("1. Paracetamol 500 mg — 1 tablet morning and night after food for 3 days", 40, 304);
      ctx.fillText("2. Amlodipine 5 mg — 1 tablet once daily every morning after breakfast", 40, 352);
      ctx.fillText("Warnings: Do NOT exceed 4 Paracetamol tablets in 24 hours.", 40, 412);
      ctx.fillText("Follow up in 5 days or sooner if fever > 102 F or breathing trouble.", 40, 460);
    }
    canvas.toBlob((blob) => {
      const file = new File([blob || new Blob(["SYNTHETIC PRESCRIPTION"])], "sample_prescription.png", {
        type: "image/png",
      });
      resolve(file);
    }, "image/png");
  });
}

export default function PatientGuidedFlowPage() {
  const { locale } = useI18n();
  const { user, patientProfile, login, guestLogin, refreshMe } = useAuth();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Card 1: Optional Login / Register / No-Login Default
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Card 2 & 3: Prescription & Demographics
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documentRecord, setDocumentRecord] = useState<MedicalDocumentDTO | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<"male" | "female" | "other" | "prefer_not_to_say">("prefer_not_to_say");
  const [editingDemographics, setEditingDemographics] = useState(false);
  const [demographicsConfirmed, setDemographicsConfirmed] = useState(false);

  // Card 4: Simple Explanation
  const [explanationProv, setExplanationProv] = useState<ProvenancePayload | null>(null);

  // Card 5: Q&A Conversation
  const [wantsQuestions, setWantsQuestions] = useState<boolean | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [chatHistory, setChatHistory] = useState<GuidedChatMessage[]>([]);

  // Card 6: 24h Doctor Review, Notification Framework & Rating
  const [reviewReceipt, setReviewReceipt] = useState<{
    review_id: string;
    eta_hours: number;
    notification: {
      status: string;
      channel: string;
      will_notify_within_24h: boolean;
      message: string;
    };
  } | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [ratingSaved, setRatingSaved] = useState(false);

  const langLabel = useMemo(
    () => SUPPORTED_LOCALES.find((l) => l.code === locale)?.nativeLabel || "English",
    [locale]
  );

  // Ensure patient session (guest default if not signed in)
  async function ensureGuestIfNeeded(): Promise<boolean> {
    if (user?.role === "patient") return true;
    await guestLogin("patient");
    return true;
  }

  async function handleContinueWithoutLogin() {
    setErrorMsg(null);
    setBusy(true);
    try {
      await ensureGuestIfNeeded();
      await api.updatePreferences({
        preferred_language: locale,
        reading_comfort_level: "very_simple",
        explanation_depth: "very_simple",
      });
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not start guest session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountAuth(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      if (authMode === "login") {
        await login(identifier.trim(), password);
      } else {
        await api.register({
          role: "patient",
          name: regName.trim() || "Patient",
          email: regEmail.trim() || undefined,
          phone: regPhone.trim() || undefined,
          password,
        });
        await refreshMe();
      }
      await api.updatePreferences({
        preferred_language: locale,
        reading_comfort_level: "very_simple",
        explanation_depth: "very_simple",
      });
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoPatientLogin() {
    setErrorMsg(null);
    setBusy(true);
    try {
      await api.demoLogin("patient");
      await refreshMe();
      await api.updatePreferences({ preferred_language: locale });
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Demo login unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProcessPrescriptionFile(file: File) {
    setErrorMsg(null);
    setBusy(true);
    try {
      await ensureGuestIfNeeded();
      const uploaded = await api.uploadDocument(file, "prescription");
      const extracted = await api.extractDocument(uploaded.id);
      setDocumentRecord(extracted);

      const fields = (extracted.ocr_structured_fields || {}) as Record<string, unknown>;
      const extName = typeof fields.patient_name === "string" ? fields.patient_name : "";
      const extAge = fields.patient_age !== undefined && fields.patient_age !== null ? String(fields.patient_age) : "";
      const extGender = typeof fields.patient_gender === "string" ? fields.patient_gender : "";

      setPatientName(extName || patientProfile?.name || "Patient");
      setPatientAge(extAge || (patientProfile?.age_years ? String(patientProfile.age_years) : ""));
      if (extGender === "male" || extGender === "female" || extGender === "other") {
        setPatientGender(extGender);
      } else if (patientProfile?.gender) {
        setPatientGender(patientProfile.gender);
      }
      setEditingDemographics(false);
      setStep(3);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not read prescription photo. Please try a clearer photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmAndExplain(confirmedCorrect: boolean) {
    if (!documentRecord) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      if (confirmedCorrect || editingDemographics) {
        await api.updatePatientProfile({
          name: patientName.trim() || undefined,
          age_years: patientAge.trim() ? Number(patientAge.trim()) : undefined,
          gender: patientGender,
        });
        await refreshMe();
      }
      setDemographicsConfirmed(true);

      let activeDoc = documentRecord;
      if (activeDoc.verification_status === "unverified") {
        try {
          activeDoc = await api.verifyDocument(activeDoc.id, {
            verification_decision: "confirm",
            corrected_structured_fields: {
              ...(activeDoc.ocr_structured_fields || {}),
              patient_name: patientName.trim() || undefined,
              patient_age: patientAge.trim() ? Number(patientAge.trim()) : undefined,
              patient_gender: patientGender,
            },
          });
          setDocumentRecord(activeDoc);
        } catch {
          // If unreadable, handle gracefully below
        }
      }

      if (activeDoc.verification_status === "rejected_unreadable") {
        setErrorMsg("Some parts of this prescription were too blurry to read safely. Please upload a clearer photo.");
        setBusy(false);
        return;
      }

      const explained = await api.explainDocument(activeDoc.id, {
        target_language: locale,
        explanation_depth: "very_simple",
      });
      setExplanationProv(explained.provenance);
      setStep(4);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not generate prescription explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendQuestion(modality: "text" | "voice" = "text", overrideText?: string) {
    const q = (overrideText ?? questionText).trim();
    if (!q) return;
    setErrorMsg(null);
    setBusy(true);
    setChatHistory((prev) => [...prev, { role: "patient", text: q }]);
    if (!overrideText) setQuestionText("");

    try {
      const res = await api.sendChat({
        conversation_id: conversationId,
        message_text: q,
        input_modality: modality,
        stt_confirmed: true,
        context_document_id: documentRecord?.id,
        target_language: locale,
      });
      setConversationId(res.conversation_id);
      const replyText =
        res.assistant_message.provenance_blocks?.ai_simplified?.summary ||
        res.assistant_message.message_text ||
        "Please ask your doctor to confirm.";
      setChatHistory((prev) => [...prev, { role: "assistant", text: replyText }]);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not send question.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishToReview() {
    if (!documentRecord) {
      setStep(6);
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const receipt = await api.submitGuidedReview({
        document_id: documentRecord.id,
        conversation_id: conversationId,
        patient_confirmed_demographics: demographicsConfirmed,
        preferred_language: locale,
      });
      setReviewReceipt(receipt);
      setStep(6);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not submit for 24-hour doctor review.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRating(stars: number) {
    setRating(stars);
    setBusy(true);
    try {
      await api.submitGuidedReviewRating({
        rating: stars,
        feedback_text: feedbackText.trim() || undefined,
        document_id: documentRecord?.id,
        conversation_id: conversationId,
        review_id: reviewReceipt?.review_id,
      });
      setRatingSaved(true);
    } catch {
      setRatingSaved(true);
    } finally {
      setBusy(false);
    }
  }

  // Extract structured medicines for visual medicine cards on Card 4
  const structuredFields = (documentRecord?.ocr_structured_fields || {}) as {
    medications?: Array<{ name?: string; dose?: string; raw_line?: string }>;
    diagnoses?: string[];
  };
  const extractedMeds = structuredFields.medications || [];

  // Narrator script & pose per step
  const narratorConfig = useMemo<{ pose: NarratorPose; message: string }>(() => {
    if (step === 1) {
      return {
        pose: "greeting",
        message: `Namaste! I am Dr. Sarthi. I will help you understand your prescription in ${langLabel}. You can tap the big green button to start right away without any account, or sign in if you want Email or SMS alerts.`,
      };
    }
    if (step === 2) {
      return {
        pose: "scanning",
        message: "Please take a clear photo of your prescription, upload a picture, or tap Sample Prescription so I can read it for you.",
      };
    }
    if (step === 3) {
      const ageSay = patientAge ? `${patientAge} years` : "not written";
      const genderSay = patientGender === "prefer_not_to_say" ? "not written" : patientGender;
      return {
        pose: editingDemographics ? "listening" : "scanning",
        message: editingDemographics
          ? "No problem! Please say your name, age, and gender using the microphone button, or type it below."
          : `I read your name as ${patientName || "Patient"}, age ${ageSay}, and gender ${genderSay}. Is this correct?`,
      };
    }
    if (step === 4) {
      const summary = explanationProv?.ai_simplified?.summary || "Here is your simple medicine guide.";
      return {
        pose: "explaining",
        message: summary,
      };
    }
    if (step === 5) {
      const lastBot = [...chatHistory].reverse().find((m) => m.role === "assistant");
      return {
        pose: wantsQuestions ? "listening" : "explaining",
        message: lastBot
          ? lastBot.text
          : "Do you have any questions about your medicines or prescription? You can speak with the microphone or type your question.",
      };
    }
    return {
      pose: "celebrating",
      message: ratingSaved
        ? "Thank you so much for your rating! A doctor will verify your prescription and questions within 24 hours. Take care!"
        : "Your prescription and questions are safely recorded! A doctor will check everything within 24 hours. Please tap a star below to rate how helpful I was today.",
    };
  }, [
    chatHistory,
    editingDemographics,
    explanationProv,
    langLabel,
    patientAge,
    patientGender,
    patientName,
    ratingSaved,
    step,
    wantsQuestions,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Top Bar: Step Progress + Switch Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/patient" className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Change Language / Mode</span>
        </Link>
        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 6`}>
          {STEP_LABELS.map((lbl, idx) => {
            const num = idx + 1;
            const active = num === step;
            const done = num < step;
            return (
              <span
                key={lbl}
                title={lbl}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-extrabold"
                style={{
                  backgroundColor: active
                    ? "var(--ms-primary)"
                    : done
                      ? "var(--ms-primary-soft)"
                      : "var(--ms-surface-alt)",
                  color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: active || done ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                {done ? "✓" : num}
              </span>
            );
          })}
        </div>
      </div>

      {/* Interactive Female Human Doctor Narrator */}
      <InteractiveNarrator
        pose={narratorConfig.pose}
        message={narratorConfig.message}
        language={locale}
        autoSpeak={true}
      />

      {errorMsg && (
        <div
          role="alert"
          className="ms-card flex items-start gap-2.5 border-2 p-4 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-danger-bg)",
            borderColor: "var(--ms-danger-border)",
            color: "var(--ms-danger-ink)",
          }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CARD 1: Welcome & No-Login Default + Full Login Workflow */}
      {step === 1 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">1. Start Easily</h1>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleContinueWithoutLogin()}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-between gap-3 px-6 py-4 text-left text-lg"
          >
            <span className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-extrabold">Continue Without Login (Default)</span>
                <span className="block text-xs font-medium opacity-90">
                  Start immediately — no password or email needed
                </span>
              </span>
            </span>
            <ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" />
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--ms-border)" }}>
            <button
              type="button"
              onClick={() => setShowLoginPanel((v) => !v)}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>{showLoginPanel ? "Hide Login Form" : "Sign In / Create Account (for Email/SMS Alerts)"}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDemoPatientLogin()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              <span>Demo Patient</span>
            </button>
          </div>

          {showLoginPanel && (
            <form onSubmit={(e) => void handleAccountAuth(e)} className="space-y-4 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`tap-target flex-1 rounded-xl border-2 px-3 py-2 text-sm font-extrabold`}
                  style={{
                    backgroundColor: authMode === "login" ? "var(--ms-primary)" : "var(--ms-surface)",
                    color: authMode === "login" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: authMode === "login" ? "var(--ms-primary)" : "var(--ms-border)",
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className={`tap-target flex-1 rounded-xl border-2 px-3 py-2 text-sm font-extrabold`}
                  style={{
                    backgroundColor: authMode === "register" ? "var(--ms-primary)" : "var(--ms-surface)",
                    color: authMode === "register" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: authMode === "register" ? "var(--ms-primary)" : "var(--ms-border)",
                  }}
                >
                  Create Account
                </button>
              </div>

              {authMode === "login" ? (
                <>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Email or Phone Number"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                </>
              ) : (
                <>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Your Full Name"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="Email (optional if phone given)"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Phone Number (optional if email given)"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create Password (min 8 characters)"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                </>
              )}

              <button type="submit" disabled={busy} className="ms-btn-primary tap-target-lg w-full text-base">
                {busy ? "Please wait..." : authMode === "login" ? "Sign In & Continue" : "Create Account & Continue"}
              </button>
            </form>
          )}
        </section>
      )}

      {/* CARD 2: Prescription Photo Upload / Camera */}
      {step === 2 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">2. Show Your Prescription</h1>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleProcessPrescriptionFile(file);
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="ms-btn-primary tap-target-lg flex flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <Camera className="h-10 w-10" aria-hidden="true" />
              <span className="text-lg font-extrabold">
                {busy ? "Reading Prescription..." : "Take Photo / Upload"}
              </span>
              <span className="text-xs opacity-90">Camera, Photo, or PDF</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const sample = await buildSamplePrescriptionPng();
                await handleProcessPrescriptionFile(sample);
              }}
              className="ms-btn-secondary tap-target-lg flex flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <Upload className="h-10 w-10" aria-hidden="true" />
              <span className="text-lg font-extrabold">Try Sample Prescription</span>
              <span className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                Instant synthetic prescription test
              </span>
            </button>
          </div>
        </section>
      )}

      {/* CARD 3: Confirm Name, Age, Gender (Keyboard or Speech-to-Text) */}
      {step === 3 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">3. Check Your Details</h1>

          <div className="grid gap-3 rounded-2xl border-2 p-4 sm:grid-cols-3" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>Name</span>
              <span className="text-xl font-extrabold">{patientName || "Not found"}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>Age</span>
              <span className="text-xl font-extrabold">{patientAge ? `${patientAge} yrs` : "Not found"}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>Gender</span>
              <span className="text-xl font-extrabold capitalize">
                {patientGender === "prefer_not_to_say" ? "Not specified" : patientGender}
              </span>
            </div>
          </div>

          {!editingDemographics ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmAndExplain(true)}
                className="ms-btn-primary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Check className="h-6 w-6" aria-hidden="true" />
                <span>{busy ? "Preparing..." : "Yes, This is Correct"}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingDemographics(true)}
                className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Edit3 className="h-6 w-6" aria-hidden="true" />
                <span>No, Let Me Fix It</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-primary)" }}>
              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">Your Name (Type or Speak)</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter your name"
                    className="tap-target flex-1 rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <VoiceInputButton
                    language={locale}
                    onConfirmedTranscript={(txt) => setPatientName(txt.replace(/[.!?]/g, "").trim())}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">Your Age (Type or Speak)</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="e.g. 64"
                    className="tap-target flex-1 rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <VoiceInputButton
                    language={locale}
                    onConfirmedTranscript={(txt) => {
                      const m = txt.match(/\d{1,3}/);
                      if (m) setPatientAge(m[0]);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">Gender</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["female", "male", "other"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setPatientGender(g)}
                      aria-pressed={patientGender === g}
                      className="tap-target rounded-xl border-2 px-3 py-2.5 text-sm font-extrabold capitalize"
                      style={{
                        backgroundColor: patientGender === g ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                        color: patientGender === g ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                        borderColor: patientGender === g ? "var(--ms-primary)" : "var(--ms-border)",
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmAndExplain(true)}
                className="ms-btn-primary tap-target-lg w-full py-4 text-lg font-extrabold"
              >
                {busy ? "Saving & Explaining..." : "Save Details & Explain Prescription →"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* CARD 4: Simple Prescription Explanation */}
      {step === 4 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">4. Your Medicines in Simple Words</h1>

          {/* Visual Medicine Cards */}
          {extractedMeds.length > 0 && (
            <div className="space-y-3">
              {extractedMeds.map((m, idx) => (
                <div
                  key={`${m.name || "med"}-${idx}`}
                  className="rounded-2xl border-2 p-4 space-y-2"
                  style={{ borderColor: "var(--ms-prov-doctor-border)", backgroundColor: "var(--ms-prov-doctor-bg)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-lg font-extrabold">
                      <Pill className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                      <span>{m.name || "Medicine"} {m.dose ? `(${m.dose})` : ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Sun className="h-4 w-4" aria-hidden="true" />
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <Moon className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                  {m.raw_line && <p className="text-sm font-semibold">{m.raw_line}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Doctor-Provided & AI-Simplified Info */}
          {explanationProv?.doctor_provided && explanationProv.doctor_provided.length > 0 && (
            <div className="rounded-2xl border-2 p-4 space-y-2" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
              <h2 className="text-base font-extrabold">Important Doctor Instructions &amp; Timings</h2>
              <ul className="space-y-1.5 text-sm font-semibold">
                {explanationProv.doctor_provided.map((item, i) => (
                  <li key={i}>
                    {typeof item === "string" ? (
                      <>• {item}</>
                    ) : (
                      <>• {item.text}</>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {explanationProv?.general_education && explanationProv.general_education.length > 0 && (
            <div className="rounded-2xl border-2 p-4 space-y-2" style={{ borderColor: "var(--ms-prov-kb-border)", backgroundColor: "var(--ms-prov-kb-bg)" }}>
              <h2 className="text-base font-extrabold">Why These Medicines Are Given</h2>
              <ul className="space-y-1.5 text-sm">
                {explanationProv.general_education.map((g, i) => (
                  <li key={i}>• <strong>{g.topic}:</strong> {g.text}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep(5)}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-center gap-2 py-4 text-lg font-extrabold"
          >
            <span>Next: Questions &amp; Answers</span>
            <ArrowRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* CARD 5: Questions & Answers (Keyboard or Speech-to-Text, Recorded) */}
      {step === 5 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">5. Do You Have Any Questions?</h1>

          {wantsQuestions === null && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setWantsQuestions(true)}
                className="ms-btn-primary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
                <span>Yes, I Have a Question</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinishToReview()}
                className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Check className="h-6 w-6" aria-hidden="true" />
                <span>No Questions, Finish →</span>
              </button>
            </div>
          )}

          {wantsQuestions && (
            <div className="space-y-4">
              {chatHistory.length > 0 && (
                <div className="space-y-3 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
                  {chatHistory.map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl p-3 text-sm font-semibold ${m.role === "patient" ? "ml-6" : "mr-6"}`}
                      style={{
                        backgroundColor: m.role === "patient" ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                      }}
                    >
                      <span className="block text-xs font-extrabold uppercase opacity-75">
                        {m.role === "patient" ? "You" : "Dr. Sarthi"}
                      </span>
                      <p className="mt-1">{m.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {[
                  "When should I take my medicine?",
                  "Should I take it before or after food?",
                  "When should I see the doctor again?",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSendQuestion("text", q)}
                    className="ms-btn-secondary tap-target rounded-full px-3 py-1.5 text-xs font-bold"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSendQuestion("text");
                    }
                  }}
                  placeholder="Type your question here..."
                  className="tap-target flex-1 rounded-xl border-2 px-4 py-3 text-base"
                  style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                />
                <VoiceInputButton
                  language={locale}
                  disabled={busy}
                  onConfirmedTranscript={(txt) => void handleSendQuestion("voice", txt)}
                />
                <button
                  type="button"
                  disabled={busy || !questionText.trim()}
                  onClick={() => void handleSendQuestion("text")}
                  className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>Ask</span>
                </button>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinishToReview()}
                className="ms-btn-primary tap-target-lg w-full py-4 text-lg font-extrabold"
              >
                {busy ? "Saving Conversation..." : "Done Asking — Save & Finish →"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* CARD 6: 24-Hour Doctor Verification + Notification Framework + Star Rating */}
      {step === 6 && (
        <section className="ms-card p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-8 w-8 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <h1 className="text-2xl font-extrabold">6. Saved for 24-Hour Doctor Verification</h1>
          </div>

          <div className="space-y-3 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-primary)", backgroundColor: "var(--ms-primary-soft)" }}>
            <div className="flex items-center gap-2 font-extrabold">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <span>Prescription &amp; Q&amp;A Conversation Recorded</span>
            </div>
            <p className="text-sm font-semibold">
              A qualified doctor will review your prescription explanation and recorded conversation within{" "}
              <strong>{reviewReceipt?.eta_hours || 24} hours</strong>.
            </p>
            <div className="flex items-start gap-2 rounded-xl border p-3 text-xs font-bold" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
              <Bell className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <div>
                <span className="block uppercase tracking-wide opacity-75">
                  Notification Framework ({reviewReceipt?.notification.channel || "framework"})
                </span>
                <span>
                  {reviewReceipt?.notification.message ||
                    "Notification framework ready for Email/SMS alerts when signed in."}
                </span>
              </div>
            </div>
          </div>

          {/* Star Rating */}
          <div className="space-y-4 rounded-2xl border-2 p-5 text-center" style={{ borderColor: "var(--ms-border)" }}>
            <h2 className="text-xl font-extrabold">How helpful was Dr. Sarthi today?</h2>
            <div className="flex justify-center gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5].map((starNum) => {
                const filled = starNum <= rating;
                return (
                  <button
                    key={starNum}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveRating(starNum)}
                    aria-label={`Rate ${starNum} out of 5 stars`}
                    className="tap-target-lg flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-transform hover:scale-105"
                    style={{
                      backgroundColor: filled ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: filled ? "#facc15" : "var(--ms-ink-muted)",
                      borderColor: filled ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <Star className="h-7 w-7" fill={filled ? "currentColor" : "none"} aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            {ratingSaved && (
              <p className="text-base font-extrabold" style={{ color: "var(--ms-primary)" }}>
                Thank you for rating us {rating}/5 stars!
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Optional feedback (type or speak)..."
                className="tap-target w-full max-w-sm rounded-xl border-2 px-4 py-2.5 text-sm"
                style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
              />
              <VoiceInputButton
                language={locale}
                onConfirmedTranscript={(txt) => setFeedbackText(txt)}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setStep(2);
                setDocumentRecord(null);
                setExplanationProv(null);
                setChatHistory([]);
                setWantsQuestions(null);
                setRating(0);
                setRatingSaved(false);
              }}
              className="ms-btn-secondary tap-target px-5 text-sm"
            >
              Scan Another Prescription
            </button>
            <Link href="/patient/detailed" className="ms-btn-primary tap-target inline-flex items-center px-5 text-sm">
              Open Detailed Dashboard
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
