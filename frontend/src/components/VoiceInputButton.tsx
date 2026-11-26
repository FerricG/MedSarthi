"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Edit3, Mic, RotateCcw, Square, Volume2 } from "lucide-react";
import { speakTextWithMithi } from "@/components/AudioPlayer";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";

export interface VoiceInputButtonProps {
  language?: SupportedLocale;
  disabled?: boolean;
  onConfirmedTranscript: (
    text: string,
    meta: { audioId?: string | null; confidence: number; wasConfirmed: boolean }
  ) => void;
}

export function VoiceInputButton({
  language,
  disabled = false,
  onConfirmedTranscript,
}: VoiceInputButtonProps) {
  const { t, locale } = useI18n();
  const activeLang = language ?? locale;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Uncertain-STT Confirmation State (confidence < 0.78)
  const [confirmState, setConfirmState] = useState<{
    transcript: string;
    confidence: number;
    audioId?: string | null;
    alternatives?: string[];
  } | null>(null);
  const [isEditingConfirm, setIsEditingConfirm] = useState(false);
  const [editedText, setEditedText] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  async function submitAudioBlob(blob: Blob) {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await api.speechToText(blob, activeLang, "voice-query.webm");
      if (res.requires_confirmation || res.confidence_score < 0.78) {
        setConfirmState({
          transcript: res.transcript_text,
          confidence: res.confidence_score,
          audioId: res.audio_id,
          alternatives: res.alternative_interpretations,
        });
        setEditedText(res.transcript_text);
        setIsEditingConfirm(false);
      } else {
        onConfirmedTranscript(res.transcript_text, {
          audioId: res.audio_id,
          confidence: res.confidence_score,
          wasConfirmed: true,
        });
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Voice transcription unavailable. Please type your question below."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function startRecording() {
    setErrorMsg(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("Microphone recording is not available in this browser. Please type your question.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          void submitAudioBlob(blob);
        }
      };

      recorder.start();
      setSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMsg("Microphone permission denied or unavailable. Please type your question.");
    }
  }

  function stopRecording() {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={disabled || isProcessing}
          onClick={() => (isRecording ? stopRecording() : void startRecording())}
          aria-pressed={isRecording}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 shadow-md transition-transform active:scale-95 disabled:opacity-50"
          style={{
            backgroundColor: isRecording ? "var(--ms-danger-border)" : "var(--ms-primary)",
            borderColor: isRecording ? "var(--ms-danger-ink)" : "var(--ms-primary-hover)",
            color: "#FFFFFF",
          }}
        >
          {isRecording ? (
            <Square className="h-8 w-8 fill-current" aria-hidden="true" />
          ) : (
            <Mic className="h-9 w-9" aria-hidden="true" />
          )}
        </button>

        <span className="text-sm font-extrabold">
          {isProcessing
            ? t.voice.processing
            : isRecording
              ? `${t.voice.listening} (${formattedTime})`
              : t.voice.tapToSpeak}
        </span>
        <span className="text-center text-xs" style={{ color: "var(--ms-ink-muted)" }}>
          {t.voice.consentNote}
        </span>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-xl border-2 px-3.5 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: "var(--ms-prov-uncertain-bg)",
            borderColor: "var(--ms-prov-uncertain-border)",
            color: "var(--ms-ink)",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Mandatory Uncertain-STT Confirmation Dialog (< 0.78 confidence) */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stt-confirm-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border-2 p-5 shadow-xl space-y-4"
            style={{
              backgroundColor: "var(--ms-surface)",
              borderColor: "var(--ms-prov-uncertain-border)",
              color: "var(--ms-ink)",
            }}
          >
            <div className="space-y-1">
              <h3 id="stt-confirm-title" className="text-xl font-extrabold">
                {t.voice.confirmTitle}
              </h3>
              <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
                {t.voice.confirmSubtitle} (Confidence: {Math.round(confirmState.confidence * 100)}%)
              </p>
            </div>

            {isEditingConfirm ? (
              <textarea
                rows={3}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full rounded-xl border-2 p-3 text-base"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            ) : (
              <div
                className="rounded-xl border-2 p-4 text-lg font-bold"
                style={{
                  backgroundColor: "var(--ms-prov-uncertain-bg)",
                  borderColor: "var(--ms-prov-uncertain-border)",
                }}
              >
                &ldquo;{editedText}&rdquo;
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => speakTextWithMithi(editedText, activeLang)}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-xs"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                <span>Hear what was heard</span>
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  const finalStr = editedText.trim();
                  if (!finalStr) return;
                  const audioId = confirmState.audioId;
                  const confidence = confirmState.confidence;
                  setConfirmState(null);
                  onConfirmedTranscript(finalStr, {
                    audioId,
                    confidence,
                    wasConfirmed: true,
                  });
                }}
                className="ms-btn-primary tap-target inline-flex items-center justify-center gap-1.5 px-4 text-sm"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>{t.voice.yesAskThis}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingConfirm((v) => !v)}
                className="ms-btn-secondary tap-target inline-flex items-center justify-center gap-1.5 px-4 text-sm"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                <span>{t.voice.editText}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmState(null);
                  void startRecording();
                }}
                className="ms-btn-secondary tap-target inline-flex items-center justify-center gap-1.5 px-4 text-sm"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>{t.voice.speakAgain}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setConfirmState(null)}
              className="w-full text-center text-xs font-bold underline py-1"
            >
              {t.voice.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
