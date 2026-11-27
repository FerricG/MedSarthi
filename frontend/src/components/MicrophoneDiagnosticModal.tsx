"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  Square,
  UploadCloud,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { api, type SttResponse } from "@/lib/api";
import { type SupportedLocale } from "@/i18n/I18nProvider";
import {
  checkMediaDevicesSupport,
  getAudioInputDevices,
  getAudioStream,
  type MediaDevicesStatus,
} from "@/lib/audioCapture";

export interface MicrophoneDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: SupportedLocale;
  onApplyTranscript?: (text: string) => void;
}

export function MicrophoneDiagnosticModal({
  isOpen,
  onClose,
  language = "en",
  onApplyTranscript,
}: MicrophoneDiagnosticModalProps) {
  const [mediaSupport, setMediaSupport] = useState<MediaDevicesStatus>(checkMediaDevicesSupport());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [permissionState, setPermissionState] = useState<"prompt" | "granted" | "denied">("prompt");
  const [copiedFlag, setCopiedFlag] = useState(false);

  // Live Audio Level Monitoring
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 100
  const [hasDetectedAudio, setHasDetectedAudio] = useState(false);

  // Test Recording State
  const [isRecordingTest, setIsRecordingTest] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [testAudioBlob, setTestAudioBlob] = useState<Blob | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [isTestingSTT, setIsTestingSTT] = useState(false);
  const [sttResult, setSttResult] = useState<SttResponse | null>(null);
  const [diagnosticMsg, setDiagnosticMsg] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Enumerate input audio devices safely
  async function refreshDevices() {
    const support = checkMediaDevicesSupport();
    setMediaSupport(support);

    if (!support.hasGetUserMedia) {
      if (!support.isSecureContext) {
        setDiagnosticMsg(
          `Microphone hardware access is restricted on insecure HTTP addresses (${support.origin}). Use http://localhost:3000 or upload an audio file.`
        );
      } else {
        setDiagnosticMsg("MediaDevices audio API is not supported in this browser.");
      }
      return;
    }

    try {
      const audioInputs = await getAudioInputDevices();
      setDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
    }
  }

  // 2. Start Live Monitoring on specified device safely
  async function startMonitoring(deviceId?: string) {
    stopMonitoring();
    setDiagnosticMsg(null);
    setHasDetectedAudio(false);

    const support = checkMediaDevicesSupport();
    setMediaSupport(support);

    if (!support.hasGetUserMedia) {
      setPermissionState("denied");
      if (!support.isSecureContext) {
        setDiagnosticMsg(
          `Insecure Context: Your browser disables microphone APIs on ${support.origin}. Use http://localhost:3000 or upload audio below.`
        );
      } else {
        setDiagnosticMsg("Microphone capture is not supported in this browser.");
      }
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      const stream = await getAudioStream(constraints);
      streamRef.current = stream;
      setPermissionState("granted");
      setIsMonitoring(true);

      // Re-read devices with labels now that permission is granted
      await refreshDevices();

      // Setup Web Audio Analyser
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let detectedCount = 0;

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setVolumeLevel(normalized);

        if (normalized > 5) {
          detectedCount++;
          if (detectedCount >= 3) {
            setHasDetectedAudio(true);
          }
        }
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setPermissionState("denied");
        setDiagnosticMsg(
          "Microphone permission was denied. Please allow microphone access in your browser address bar / site settings."
        );
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setDiagnosticMsg("No microphone hardware was detected on your computer.");
      } else if (String(error.message).includes("INSECURE_CONTEXT")) {
        setPermissionState("denied");
        setDiagnosticMsg(
          "Microphone blocked by browser security: Browser requires HTTPS or http://localhost to access microphone hardware."
        );
      } else {
        setDiagnosticMsg(error.message || "Failed to access microphone input.");
      }
      setIsMonitoring(false);
    }
  }

  function stopMonitoring() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setIsMonitoring(false);
    setVolumeLevel(0);
  }

  // 3. Start Test Recording (3-5 seconds)
  async function startTestRecord() {
    if (!streamRef.current) {
      await startMonitoring(selectedDeviceId);
    }
    if (!streamRef.current) return;

    chunksRef.current = [];
    setTestAudioBlob(null);
    if (testAudioUrl) {
      URL.revokeObjectURL(testAudioUrl);
      setTestAudioUrl(null);
    }
    setSttResult(null);
    setRecordSeconds(0);
    setIsRecordingTest(true);

    try {
      const recorder = new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTestAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setTestAudioUrl(url);
      };
      recorder.start(100);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error("Test recording failed:", err);
      setIsRecordingTest(false);
    }
  }

  function stopTestRecord() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsRecordingTest(false);
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }

  // 4. Test Transcription Pipeline
  async function runTranscriptionTest(audioBlobToTest?: Blob) {
    const blob = audioBlobToTest || testAudioBlob;
    if (!blob) return;
    setIsTestingSTT(true);
    setDiagnosticMsg(null);
    try {
      const res = await api.speechToText(blob, language, "mic-test.webm");
      setSttResult(res);
      if (res.transcript_text) {
        setDiagnosticMsg("Speech recognized successfully! Your audio pipeline and Whisper model are working.");
      } else if (res.message) {
        setDiagnosticMsg(res.message);
      } else {
        setDiagnosticMsg("No words recognized in audio. Please speak louder and closer to your microphone.");
      }
    } catch (err) {
      setDiagnosticMsg(err instanceof Error ? err.message : "Transcription test request failed.");
    } finally {
      setIsTestingSTT(false);
    }
  }

  // 5. Handle Direct Audio File Selection (Fallback when browser blocks microphone)
  async function handleAudioFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTestAudioBlob(file);
    if (testAudioUrl) URL.revokeObjectURL(testAudioUrl);
    setTestAudioUrl(URL.createObjectURL(file));
    await runTranscriptionTest(file);
  }

  function copyChromeFlag() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`chrome://flags/#unsafely-treat-insecure-origin-as-secure`);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    }
  }

  useEffect(() => {
    if (isOpen) {
      const support = checkMediaDevicesSupport();
      setMediaSupport(support);
      refreshDevices();
      if (support.hasGetUserMedia) {
        startMonitoring();
      }
    } else {
      stopMonitoring();
      if (timerRef.current) clearInterval(timerRef.current);
      if (testAudioUrl) URL.revokeObjectURL(testAudioUrl);
      setTestAudioUrl(null);
      setTestAudioBlob(null);
      setSttResult(null);
      setDiagnosticMsg(null);
    }
    return () => {
      stopMonitoring();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPort = typeof window !== "undefined" ? window.location.port || "3000" : "3000";
  const localhostUrl = `http://localhost:${currentPort}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mic-diag-title"
    >
      <div
        className="ms-card relative max-h-[90vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6 shadow-2xl"
        style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: "var(--ms-border)" }}>
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <h2 id="mic-diag-title" className="text-lg font-bold">
              Microphone Diagnostics & Sound Check
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target rounded-full p-1.5 hover:bg-black/5"
            aria-label="Close diagnostic dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Insecure Context Security Banner (When accessing via LAN IP e.g. 10.75.24.200) */}
        {!mediaSupport.hasGetUserMedia && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <span>Microphone Blocked: Insecure HTTP Network Connection</span>
            </div>
            <p className="leading-relaxed">
              Modern web browsers (Chrome, Edge, Safari, Firefox) automatically disable live microphone hardware access
              when accessed over unencrypted network addresses like{" "}
              <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold text-amber-900">
                {mediaSupport.origin}
              </code>
              .
            </p>

            <div className="rounded-lg bg-white p-3 border border-amber-200 space-y-2.5">
              <span className="font-bold text-amber-950 uppercase tracking-wide text-[11px]">
                3 Easy Ways to Fix or Use Voice:
              </span>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-blue-700 shrink-0">1.</span>
                  <div>
                    <span className="font-bold">Use Localhost (If you are on this PC):</span>
                    <p className="text-gray-600">
                      Open{" "}
                      <a
                        href={localhostUrl}
                        className="text-blue-700 font-mono font-bold underline inline-flex items-center gap-1"
                      >
                        {localhostUrl} <ExternalLink className="h-3 w-3" />
                      </a>
                      . Browsers grant full microphone permissions to localhost.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="font-bold text-blue-700 shrink-0">2.</span>
                  <div>
                    <span className="font-bold">Allow Insecure Origin (If on phone / Wi-Fi):</span>
                    <p className="text-gray-600">
                      Open <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">chrome://flags</code>, enable{" "}
                      <span className="font-mono text-gray-800">Insecure origins treated as secure</span>, add{" "}
                      <code className="bg-gray-100 px-1 py-0.5 rounded font-mono font-bold">{mediaSupport.origin}</code>,
                      and relaunch browser.
                    </p>
                    <button
                      type="button"
                      onClick={copyChromeFlag}
                      className="mt-1 inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                    >
                      {copiedFlag ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedFlag ? "Flag URL Copied!" : "Copy Chrome Flag URL"}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="font-bold text-blue-700 shrink-0">3.</span>
                  <div>
                    <span className="font-bold">Upload Audio Note (Works everywhere):</span>
                    <p className="text-gray-600">
                      Record a voice memo on your phone/PC and upload it below. Our Whisper AI backend will transcribe it immediately.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostic Checklist */}
        <div className="space-y-4 text-sm">
          {/* Step 1: Device Detection & Selection */}
          <div
            className="rounded-xl border p-3.5 space-y-2"
            style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-2">
                {permissionState === "granted" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                1. Microphone Device
              </span>
              <button
                type="button"
                onClick={refreshDevices}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            {devices.length === 0 ? (
              <p className="text-xs text-amber-700">
                {!mediaSupport.hasGetUserMedia
                  ? "Microphone hardware enumeration blocked by browser security over HTTP."
                  : "No external microphones listed yet. Click Allow if your browser prompts for permission."}
              </p>
            ) : (
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  startMonitoring(e.target.value);
                }}
                className="w-full rounded-lg border px-3 py-2 text-xs font-medium"
                style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 2: Live Volume / Level Meter */}
          <div
            className="rounded-xl border p-3.5 space-y-2"
            style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-2">
                {hasDetectedAudio ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Volume2 className="h-4 w-4 text-amber-500" />
                )}
                2. Live Audio Level Meter
              </span>
              <span className="text-xs font-bold text-gray-500">{volumeLevel}%</span>
            </div>
            <p className="text-xs text-gray-600">
              Speak into your microphone now. The green bar bounces in real-time as you speak.
            </p>
            {/* Visual Level Bar */}
            <div
              className="h-4 w-full overflow-hidden rounded-full border bg-gray-200"
              style={{ borderColor: "var(--ms-border)" }}
            >
              <div
                className="h-full transition-all duration-75"
                style={{
                  width: `${volumeLevel}%`,
                  backgroundColor: volumeLevel > 15 ? "#10b981" : volumeLevel > 5 ? "#3b82f6" : "#cbd5e1",
                }}
              />
            </div>
            {hasDetectedAudio ? (
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sound is actively detected by your microphone!
              </p>
            ) : (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> No audio signal detected yet. Say something out loud.
              </p>
            )}
          </div>

          {/* Step 3: Record Short Test Audio & Transcribe */}
          <div
            className="rounded-xl border p-3.5 space-y-3"
            style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}
          >
            <span className="font-bold flex items-center gap-2">
              <Mic className="h-4 w-4" style={{ color: "var(--ms-primary)" }} />
              3. Speech Recognition & File Test
            </span>
            <p className="text-xs text-gray-600">
              Record a 3-second live test clip or upload an existing audio memo (.m4a, .mp3, .wav, .webm) to verify speech recognition.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {mediaSupport.hasGetUserMedia && (
                <>
                  {!isRecordingTest ? (
                    <button
                      type="button"
                      onClick={startTestRecord}
                      className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                    >
                      <Mic className="h-3.5 w-3.5" /> Start 3s Test Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopTestRecord}
                      className="ms-btn-danger tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold animate-pulse"
                    >
                      <Square className="h-3.5 w-3.5" /> Stop Recording ({recordSeconds}s)
                    </button>
                  )}
                </>
              )}

              {/* Upload audio file directly */}
              <input
                type="file"
                ref={fileInputRef}
                accept="audio/*"
                onChange={handleAudioFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTestingSTT}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>Upload Audio File</span>
              </button>

              {testAudioBlob && !isRecordingTest && (
                <button
                  type="button"
                  onClick={() => runTranscriptionTest()}
                  disabled={isTestingSTT}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isTestingSTT ? "animate-spin" : ""}`} />
                  {isTestingSTT ? "Transcribing Audio..." : "Re-Test Transcription"}
                </button>
              )}
            </div>

            {/* Playback preview of test audio */}
            {testAudioUrl && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Audio Clip:</span>
                <audio controls src={testAudioUrl} className="h-8 max-w-full" />
              </div>
            )}

            {/* Transcription Result Output */}
            {sttResult && (
              <div className="mt-2 rounded-lg border p-3 bg-white" style={{ borderColor: "var(--ms-border)" }}>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Transcribed Words:</span>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {sttResult.transcript_text ? (
                    `"${sttResult.transcript_text}"`
                  ) : (
                    <span className="text-amber-600 italic">No words recognized in audio recording.</span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-gray-500">
                  <span>Engine: {sttResult.provider || "Whisper / SpeechAPI"}</span>
                  <span>Confidence: {Math.round((sttResult.confidence_score || 0) * 100)}%</span>
                  {sttResult.transcript_text && onApplyTranscript && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyTranscript(sttResult.transcript_text);
                        onClose();
                      }}
                      className="text-xs font-bold text-emerald-700 hover:underline"
                    >
                      Use this text in question &rarr;
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Diagnostic Alert Feedback */}
          {diagnosticMsg && (
            <div
              className={`rounded-lg p-3 text-xs font-semibold flex items-center gap-2 ${
                diagnosticMsg.includes("successfully")
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {diagnosticMsg.includes("successfully") ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              )}
              <span>{diagnosticMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--ms-border)" }}>
          <button
            type="button"
            onClick={onClose}
            className="ms-btn-secondary tap-target px-4 py-1.5 text-xs font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
