"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Edit3, ExternalLink, Mic, RotateCcw, Square, UploadCloud, Volume2, Wrench } from "lucide-react";
import { speakTextWithMithi } from "@/components/AudioPlayer";
import { MicrophoneDiagnosticModal } from "@/components/MicrophoneDiagnosticModal";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";
import { checkMediaDevicesSupport, getAudioStream } from "@/lib/audioCapture";

export interface VoiceInputButtonProps {
  language?: SupportedLocale;
  disabled?: boolean;
  onConfirmedTranscript: (
    text: string,
    meta: { audioId?: string | null; confidence: number; wasConfirmed: boolean }
  ) => void;
}

// Browser Web Speech Recognition Types
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string; confidence: number };
    };
  };
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
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 100
  const [liveTranscript, setLiveTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
  const speechRecognizerRef = useRef<IWindowSpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const accumulatedTextRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        speechRecognizerRef.current?.stop();
      } catch {}
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  async function submitAudioFile(file: File) {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await api.speechToText(file, activeLang, file.name || "voice-query.webm");
      if (res.metrics?.is_silent && !res.transcript_text) {
        setErrorMsg("Uploaded audio clip was silent. Please try another recording or speak closer to your mic.");
        return;
      }
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
          : "Voice transcription unavailable. Please click 'Test Mic' or type your question below."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function submitAudioBlob(blob: Blob) {
    // If Web Speech already gave us an accurate live transcript, prioritize it!
    const directSpeech = accumulatedTextRef.current.trim();
    if (directSpeech.length > 0) {
      setIsProcessing(false);
      onConfirmedTranscript(directSpeech, {
        confidence: 0.94,
        wasConfirmed: true,
      });
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await api.speechToText(blob, activeLang, "voice-query.webm");
      if (res.metrics?.is_silent && !res.transcript_text) {
        setErrorMsg("Microphone recording was silent. Please speak closer to your mic or test your microphone settings.");
        return;
      }
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
          : "Voice transcription unavailable. Please click 'Test Mic' or type your question below."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function startRecording() {
    setErrorMsg(null);
    setLiveTranscript("");
    accumulatedTextRef.current = "";

    const support = checkMediaDevicesSupport();
    if (!support.hasGetUserMedia) {
      if (!support.isSecureContext) {
        setErrorMsg(
          `Microphone is blocked by your browser on insecure HTTP (${support.origin}). Please access via http://localhost:3000 or click 'Upload Audio' below.`
        );
      } else {
        setErrorMsg("Microphone recording is not available in this browser. Please upload an audio file or type your question.");
      }
      return;
    }

    try {
      const stream = await getAudioStream({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // 1. Setup Audio Meter for live feedback
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      } catch (meterErr) {
        console.warn("Audio meter init failed:", meterErr);
      }

      // 2. Initialize Browser Web Speech API for real-time live recognition
      try {
        const SpeechRec = (window as unknown as {
          SpeechRecognition?: new () => IWindowSpeechRecognition;
          webkitSpeechRecognition?: new () => IWindowSpeechRecognition;
        }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => IWindowSpeechRecognition }).webkitSpeechRecognition;

        if (SpeechRec) {
          const recognizer = new SpeechRec();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          // Route language code: English en-IN, Hindi hi-IN
          recognizer.lang = activeLang === "hi" || activeLang === "hi-Latn" ? "hi-IN" : "en-IN";

          recognizer.onresult = (event) => {
            let combined = "";
            for (let i = 0; i < event.results.length; i++) {
              combined += event.results[i][0].transcript + " ";
            }
            const clean = combined.trim();
            setLiveTranscript(clean);
            accumulatedTextRef.current = clean;
          };
          recognizer.onerror = (e) => {
            console.warn("Web Speech API note:", e.error);
          };
          recognizer.start();
          speechRecognizerRef.current = recognizer;
        }
      } catch (recErr) {
        console.warn("Native SpeechRecognition not supported, using server fallback:", recErr);
      }

      // 3. MediaRecorder for server STT fallback
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
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close().catch(() => {});
        }
        setVolumeLevel(0);
        try {
          speechRecognizerRef.current?.stop();
        } catch {}

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void submitAudioBlob(blob);
      };

      recorder.start();
      setSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setErrorMsg("Microphone permission was denied. Please allow microphone access in your browser or click 'Test Mic'.");
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setErrorMsg("No microphone was detected on your computer. Please connect a microphone or upload an audio file.");
      } else if (String(error.message).includes("INSECURE_CONTEXT")) {
        setErrorMsg("Microphone blocked: Browser requires HTTPS or http://localhost to access microphone hardware.");
      } else {
        setErrorMsg(error.message || "Microphone permission denied or unavailable. Please click 'Test Mic' below.");
      }
      setIsRecording(false);
    }
  }

  function stopRecording() {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    try {
      speechRecognizerRef.current?.stop();
    } catch {}
  }

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        {/* Mic Button with Pulse and Visual Ring */}
        <div className="relative flex items-center justify-center">
          {isRecording && (
            <div
              className="absolute -inset-2 rounded-full opacity-75 animate-ping"
              style={{
                backgroundColor: volumeLevel > 15 ? "#10b981" : "var(--ms-danger-border)",
              }}
            />
          )}
          <button
            type="button"
            disabled={disabled || isProcessing}
            onClick={() => (isRecording ? stopRecording() : void startRecording())}
            aria-pressed={isRecording}
            className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 shadow-md transition-transform active:scale-95 disabled:opacity-50"
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
        </div>

        {/* Live Audio Volume Level Bar while Recording */}
        {isRecording && (
          <div className="w-36 space-y-1 text-center">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 border border-gray-300">
              <div
                className="h-full transition-all duration-75"
                style={{
                  width: `${volumeLevel}%`,
                  backgroundColor: volumeLevel > 15 ? "#10b981" : "#3b82f6",
                }}
              />
            </div>
            <span className="text-[11px] font-semibold text-gray-500">
              {volumeLevel > 5 ? "Mic picking up audio" : "Listening..."}
            </span>
          </div>
        )}

        {/* Live Spoken Text Preview */}
        {liveTranscript && isRecording && (
          <div className="max-w-md rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-center text-xs font-semibold text-emerald-900 shadow-sm animate-fade-in">
            &ldquo;{liveTranscript}&rdquo;
          </div>
        )}

        <span className="text-sm font-extrabold">
          {isProcessing
            ? t.voice.processing
            : isRecording
              ? `${t.voice.listening} (${formattedTime})`
              : t.voice.tapToSpeak}
        </span>

        {/* Test Microphone & Audio Upload Utility Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void submitAudioFile(f);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing || isRecording}
            className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline font-bold"
          >
            <UploadCloud className="h-3.5 w-3.5" /> Upload Voice Note
          </button>
          <span className="text-gray-300">•</span>
          <button
            type="button"
            onClick={() => setShowDiagnostics(true)}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-bold"
          >
            <Wrench className="h-3.5 w-3.5" /> Test Microphone / Audio
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border-2 px-3.5 py-2.5 text-sm font-semibold space-y-2"
          style={{
            backgroundColor: "var(--ms-prov-uncertain-bg)",
            borderColor: "var(--ms-prov-uncertain-border)",
            color: "var(--ms-ink)",
          }}
        >
          <p>{errorMsg}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ms-btn-primary inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold"
            >
              <UploadCloud className="h-3.5 w-3.5" /> Upload Voice Memo Instead
            </button>
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className="ms-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold"
            >
              <Wrench className="h-3.5 w-3.5" /> Microphone Help & Diagnostics
            </button>
          </div>
        </div>
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
            }}
          >
            <div className="space-y-1">
              <h3 id="stt-confirm-title" className="text-lg font-extrabold flex items-center gap-2">
                <Volume2 className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <span>{t.voice.confirmTitle}</span>
              </h3>
              <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                {t.voice.confirmSubtitle} (Confidence: {Math.round(confirmState.confidence * 100)}%)
              </p>
            </div>

            {/* Read-Back Spoken Audio */}
            <div className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: "var(--ms-border)" }}>
              <span className="text-xs font-bold" style={{ color: "var(--ms-ink-muted)" }}>
                Hear what we understood:
              </span>
              <button
                type="button"
                onClick={() =>
                  speakTextWithMithi(
                    editedText || confirmState.transcript,
                    activeLang,
                    1.0,
                    "charvi"
                  )
                }
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                <span>Play</span>
              </button>
            </div>

            {/* Editable or Static Display */}
            {isEditingConfirm ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={3}
                className="w-full rounded-xl border p-3 text-base font-medium focus:outline-none"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-primary)",
                  color: "var(--ms-ink)",
                }}
              />
            ) : (
              <div
                className="rounded-xl border p-3.5 text-base font-bold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                }}
              >
                &ldquo;{editedText || confirmState.transcript}&rdquo;
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmState(null);
                  setErrorMsg(null);
                  void startRecording();
                }}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3.5 text-sm"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>{t.voice.speakAgain}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingConfirm((prev) => !prev)}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3.5 text-sm"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                <span>{isEditingConfirm ? "Done Editing" : t.voice.editText}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const finalTxt = (editedText || confirmState.transcript).trim();
                  if (finalTxt) {
                    onConfirmedTranscript(finalTxt, {
                      audioId: confirmState.audioId,
                      confidence: isEditingConfirm ? 1.0 : confirmState.confidence,
                      wasConfirmed: true,
                    });
                  }
                  setConfirmState(null);
                }}
                className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-4 text-sm font-bold"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>{t.voice.yesAskThis}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Diagnostic & Audio Settings Modal */}
      <MicrophoneDiagnosticModal
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        language={activeLang}
        onApplyTranscript={(txt) => {
          onConfirmedTranscript(txt, { confidence: 0.95, wasConfirmed: true });
        }}
      />
    </div>
  );
}
