"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileAudio,
  Loader2,
  Mic,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import {
  LANGUAGE_OPTIONS,
  formatLanguageLabel,
  getPatientDisplayName,
} from "@/components/doctor/doctorHelpers";
import { checkMediaDevicesSupport, getAudioStream } from "@/lib/audioCapture";
import {
  api,
  ApiError,
  type AudioRecordDTO,
  type DoctorPatientLinkItem,
  type IntegrityReport,
  type ProvenancePayload,
  type SupportedLanguage,
} from "@/lib/api";

export interface AudioSummaryResult {
  audioId: string;
  consultationId?: string;
  transcriptText: string;
  structuredSummary?: Record<string, unknown>;
  provenance?: ProvenancePayload;
  integrity?: IntegrityReport;
  audioPurged?: boolean;
}

export interface AudioUploadReviewProps {
  patients?: DoctorPatientLinkItem[];
  patientId: string;
  onPatientChange?: (patientId: string) => void;
  consultationId?: string;
  defaultLanguage?: SupportedLanguage;
  onApplyToConsultation?: (result: AudioSummaryResult) => Promise<void> | void;
}

export function AudioUploadReview({
  patients = [],
  patientId,
  onPatientChange,
  consultationId,
  defaultLanguage = "en",
  onApplyToConsultation,
}: AudioUploadReviewProps) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [languageHint, setLanguageHint] = useState<SupportedLanguage>(defaultLanguage);
  const [autoPurge, setAutoPurge] = useState(true);

  const [audioRecord, setAudioRecord] = useState<AudioRecordDTO | null>(null);
  const [rawTranscriptEdit, setRawTranscriptEdit] = useState("");
  const [segmentEdits, setSegmentEdits] = useState<
    Array<{ segment_id: string; speaker_role: string; text: string; confidence?: number }>
  >([]);

  const [busyStep, setBusyStep] = useState<
    "idle" | "uploading" | "transcribing" | "saving_transcript" | "summarizing" | "deleting"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<AudioSummaryResult | null>(null);

  // Optional live microphone recording state
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setLanguageHint(defaultLanguage);
  }, [defaultLanguage]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  function syncEditorFromRecord(record: AudioRecordDTO) {
    setAudioRecord(record);
    if (record.transcript_segments && record.transcript_segments.length > 0) {
      setSegmentEdits(
        record.transcript_segments.map((seg) => ({
          segment_id: seg.segment_id,
          speaker_role: seg.speaker_role || "doctor",
          text: seg.text || "",
          confidence: seg.confidence,
        }))
      );
      setRawTranscriptEdit(
        record.transcript_raw ||
          record.transcript_segments.map((s) => s.text).join("\n")
      );
    } else {
      setSegmentEdits([]);
      setRawTranscriptEdit(record.transcript_raw || "");
    }
  }

  async function handleStartRecording() {
    setErrorMsg(null);
    if (!consentChecked) {
      setErrorMsg("Please confirm patient audio consent before recording.");
      return;
    }
    const support = checkMediaDevicesSupport();
    if (!support.hasGetUserMedia) {
      setErrorMsg(
        !support.isSecureContext
          ? `Microphone blocked: Browser requires HTTPS or http://localhost (current: ${support.origin}). Please upload an audio file below.`
          : "Browser microphone recording is unavailable. Please upload an audio file instead."
      );
      return;
    }
    try {
      const stream = await getAudioStream({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const recordedFile = new File([blob], "consultation_recording.webm", {
          type: blob.type || "audio/webm",
        });
        setSelectedFile(recordedFile);
        setStatusMsg("Recorded consultation clip ready. Click Upload & Transcribe below.");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMsg("Microphone access was denied. You can upload a WAV/MP3/WebM/M4A file directly.");
    }
  }

  function handleStopRecording() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  async function handleUploadAndTranscribe() {
    setErrorMsg(null);
    setStatusMsg(null);
    if (!patientId) {
      setErrorMsg("Please select a linked patient before uploading consultation audio.");
      return;
    }
    if (!consentChecked) {
      setErrorMsg("Explicit patient consent confirmation is required before uploading audio.");
      return;
    }
    if (!selectedFile) {
      setErrorMsg("Select a WAV, MP3, WebM, or M4A audio file (or record a clip) first.");
      return;
    }

    try {
      setBusyStep("uploading");
      const uploaded = await api.uploadAudio(selectedFile, {
        audioPurpose: "doctor_consultation",
        patientId,
        consultationId,
        filename: selectedFile.name,
      });
      syncEditorFromRecord(uploaded);

      setBusyStep("transcribing");
      const transcribed = await api.transcribeAudio(uploaded.audio_id, languageHint);
      syncEditorFromRecord(transcribed);
      setStatusMsg(
        "Transcription complete. Review and edit any medical terms or doses below before summarizing."
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Unable to upload or transcribe audio file."
      );
    } finally {
      setBusyStep("idle");
    }
  }

  async function handleSaveTranscript(): Promise<boolean> {
    if (!audioRecord) return false;
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyStep("saving_transcript");
    try {
      const updated =
        segmentEdits.length > 0
          ? await api.updateAudioTranscript(audioRecord.audio_id, {
              speaker_reassignments: segmentEdits.map((s) => ({
                segment_id: s.segment_id,
                speaker_role: s.speaker_role,
              })),
              text_edits: segmentEdits.map((s) => ({
                segment_id: s.segment_id,
                text: s.text,
              })),
              speaker_map_verified: true,
            })
          : await api.updateAudioTranscript(audioRecord.audio_id, {
              text_edits: [{ segment_id: "transcript_raw", text: rawTranscriptEdit }],
              speaker_map_verified: true,
            });
      syncEditorFromRecord(updated);
      setStatusMsg("Transcript edits saved and verified.");
      return true;
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Failed to save transcript edits."
      );
      return false;
    } finally {
      setBusyStep("idle");
    }
  }

  async function handleExtractAndSummarize() {
    if (!audioRecord) return;
    setErrorMsg(null);
    setStatusMsg(null);

    // Ensure latest manual transcript edits are saved first
    const saved = await handleSaveTranscript();
    if (!saved) return;

    setBusyStep("summarizing");
    try {
      const res = await api.summarizeAudio({
        audio_id: audioRecord.audio_id,
        consultation_id: consultationId,
        target_language: languageHint,
        auto_purge_audio_after_summary: autoPurge,
      });

      const finalText =
        segmentEdits.length > 0
          ? segmentEdits.map((s) => s.text).join(" ")
          : rawTranscriptEdit;

      const summaryObj: AudioSummaryResult = {
        audioId: res.audio_id,
        consultationId: res.consultation_id,
        transcriptText: finalText,
        structuredSummary: res.structured_summary,
        provenance: res.provenance,
        integrity: res.integrity,
        audioPurged: res.audio_purged,
      };
      setSummaryResult(summaryObj);

      if (res.audio_purged && audioRecord) {
        setAudioRecord({
          ...audioRecord,
          audio_purged_at: new Date().toISOString(),
        });
      }

      setStatusMsg("Structured consultation summary extracted from verified transcript.");
      if (onApplyToConsultation) {
        await onApplyToConsultation(summaryObj);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Unable to extract and summarize audio transcript."
      );
    } finally {
      setBusyStep("idle");
    }
  }

  async function handleDeleteAudioNow() {
    if (!audioRecord) return;
    setErrorMsg(null);
    setBusyStep("deleting");
    try {
      await api.deleteAudio(audioRecord.audio_id);
      setAudioRecord({
        ...audioRecord,
        audio_purged_at: new Date().toISOString(),
        processing_status: "purged",
      });
      setStatusMsg("Raw consultation audio deleted immediately.");
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to delete raw audio.");
    } finally {
      setBusyStep("idle");
    }
  }

  const formatTimer = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      {/* Step 1: Consent Gate + File Upload / Optional Recorder */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold">
              Consultation Audio Upload &amp; Transcript Review
            </h2>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Upload WAV, MP3, WebM, or M4A (or record with explicit patient consent), edit the
              transcript directly, and extract structured fields into the consultation.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>24h Ephemeral Audio Retention</span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {patients.length > 0 && onPatientChange && (
            <div>
              <label htmlFor="audio-patient-select" className="mb-1.5 block text-xs font-extrabold uppercase">
                Linked Patient *
              </label>
              <select
                id="audio-patient-select"
                value={patientId}
                onChange={(e) => onPatientChange(e.target.value)}
                className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                <option value="">Select linked patient...</option>
                {patients.map((p) => (
                  <option key={p.patient_id} value={p.patient_id}>
                    {getPatientDisplayName(p)} ({formatLanguageLabel(p.preferred_language)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="audio-lang-hint" className="mb-1.5 block text-xs font-extrabold uppercase">
              Language Hint (Transcription &amp; Summary)
            </label>
            <select
              id="audio-lang-hint"
              value={languageHint}
              onChange={(e) => setLanguageHint(e.target.value as SupportedLanguage)}
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.native})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Explicit Pre-Upload / Recording Consent Gate */}
        <label
          htmlFor="audio-consent-checkbox"
          className="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 text-sm font-semibold"
          style={{
            backgroundColor: consentChecked ? "var(--ms-prov-doctor-bg)" : "var(--ms-banner-bg)",
            borderColor: consentChecked ? "var(--ms-prov-doctor-border)" : "var(--ms-banner-border)",
          }}
        >
          <input
            id="audio-consent-checkbox"
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span>
            <strong>Explicit Patient Consent Recorded:</strong> I confirm the patient gave informed
            consent for this synthetic consultation audio to be uploaded/recorded for transcription
            and deleted per the ephemeral retention policy.
          </span>
        </label>

        {/* File Picker + Optional Live Recorder */}
        <div className="grid gap-4 md:grid-cols-2">
          <div
            className="rounded-xl border-2 border-dashed p-4 space-y-2.5"
            style={{ borderColor: "var(--ms-border)" }}
          >
            <label htmlFor="audio-file-input" className="block text-xs font-extrabold uppercase">
              Upload Audio File (WAV, MP3, WebM, M4A)
            </label>
            <input
              id="audio-file-input"
              type="file"
              accept=".wav,.mp3,.webm,.m4a,audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                setErrorMsg(null);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-2 file:text-xs file:font-bold"
            />
            {selectedFile && (
              <p className="flex items-center gap-1.5 text-xs font-bold">
                <FileAudio className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {selectedFile.name} ({Math.max(1, Math.round(selectedFile.size / 1024))} KB)
                </span>
              </p>
            )}
          </div>

          <div
            className="rounded-xl border-2 p-4 space-y-2.5"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: recording ? "var(--ms-danger-border)" : "var(--ms-border)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase">Or Record Live Audio</span>
              {recording && (
                <span
                  aria-live="assertive"
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
                  style={{
                    backgroundColor: "var(--ms-danger-bg)",
                    borderColor: "var(--ms-danger-border)",
                    color: "var(--ms-danger-ink)",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span>RECORDING {formatTimer(recordSeconds)}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {!recording ? (
                <button
                  type="button"
                  disabled={!consentChecked || busyStep !== "idle"}
                  onClick={() => void handleStartRecording()}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 py-2 text-xs font-bold disabled:opacity-50"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  <span>Start Mic Recording</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="tap-target inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-extrabold"
                  style={{
                    backgroundColor: "var(--ms-danger-border)",
                    borderColor: "var(--ms-danger-border)",
                    color: "#FFFFFF",
                  }}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  <span>Stop Recording</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={autoPurge}
              onChange={(e) => setAutoPurge(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Auto-purge raw audio blob immediately after summarization</span>
          </label>

          <button
            type="button"
            disabled={busyStep !== "idle" || !consentChecked || !selectedFile}
            onClick={() => void handleUploadAndTranscribe()}
            className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {busyStep === "uploading" || busyStep === "transcribing" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {busyStep === "uploading"
                ? "Uploading Audio..."
                : busyStep === "transcribing"
                  ? "Transcribing..."
                  : "Upload & Transcribe Audio"}
            </span>
          </button>
        </div>
      </section>

      {/* Step 2: Transcript Editor */}
      {audioRecord && (
        <section className="ms-card space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold">Transcript Editor &amp; Verification</h3>
              <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                Audio ID: <code>{audioRecord.audio_id}</code>
                {audioRecord.stt_language_detected && ` • Detected: ${audioRecord.stt_language_detected}`}
                {typeof audioRecord.stt_confidence_score === "number" &&
                  ` • Confidence: ${Math.round(audioRecord.stt_confidence_score * 100)}%`}
                {audioRecord.audio_purged_at && " • Raw Audio Purged"}
              </p>
            </div>

            {!audioRecord.audio_purged_at && (
              <div className="flex flex-wrap items-center gap-2">
                {!audioRecord.transcript_raw && segmentEdits.length === 0 && (
                  <button
                    type="button"
                    disabled={busyStep !== "idle"}
                    onClick={async () => {
                      setErrorMsg(null);
                      setBusyStep("transcribing");
                      try {
                        const tr = await api.transcribeAudio(audioRecord.audio_id, languageHint);
                        syncEditorFromRecord(tr);
                        setStatusMsg("Transcription complete.");
                      } catch (err) {
                        setErrorMsg(err instanceof ApiError ? err.message : "Transcription failed.");
                      } finally {
                        setBusyStep("idle");
                      }
                    }}
                    className="ms-btn-secondary tap-target px-3 py-1.5 text-xs font-bold"
                  >
                    Retry Transcribe
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyStep !== "idle"}
                  onClick={() => void handleDeleteAudioNow()}
                  className="tap-target inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-danger-border)",
                    color: "var(--ms-danger-ink)",
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete Raw Audio Now</span>
                </button>
              </div>
            )}
          </div>

          {segmentEdits.length > 0 ? (
            <div className="space-y-2.5">
              {segmentEdits.map((seg, idx) => (
                <div
                  key={seg.segment_id}
                  className="rounded-xl border-2 p-3 space-y-2"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={`seg-role-${seg.segment_id}`}
                      className="text-xs font-extrabold uppercase"
                    >
                      Line #{idx + 1} Speaker
                    </label>
                    <select
                      id={`seg-role-${seg.segment_id}`}
                      value={seg.speaker_role}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSegmentEdits((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, speaker_role: val } : item
                          )
                        );
                      }}
                      className="rounded-lg border px-2.5 py-1 text-xs font-bold"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-border)",
                      }}
                    >
                      <option value="doctor">Doctor</option>
                      <option value="patient">Patient</option>
                      <option value="caregiver">Caregiver</option>
                    </select>
                  </div>

                  <textarea
                    rows={2}
                    aria-label={`Edit transcript segment ${idx + 1}`}
                    value={seg.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSegmentEdits((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, text: val } : item))
                      );
                    }}
                    className="w-full rounded-xl border-2 p-2.5 text-sm"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <label htmlFor="audio-raw-transcript" className="mb-1.5 block text-xs font-extrabold uppercase">
                Manual Transcript Editor (Correct medical terms, doses, or timings before summarizing)
              </label>
              <textarea
                id="audio-raw-transcript"
                rows={6}
                value={rawTranscriptEdit}
                onChange={(e) => setRawTranscriptEdit(e.target.value)}
                placeholder="Transcribed consultation text appears here..."
                className="w-full rounded-xl border-2 p-3 text-sm leading-relaxed"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={busyStep !== "idle"}
              onClick={() => void handleSaveTranscript()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>
                {busyStep === "saving_transcript" ? "Saving Edits..." : "Save Transcript Edits"}
              </span>
            </button>

            <button
              type="button"
              disabled={busyStep !== "idle"}
              onClick={() => void handleExtractAndSummarize()}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              {busyStep === "summarizing" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {busyStep === "summarizing"
                  ? "Extracting & Summarizing..."
                  : "Extract & Summarize into Consultation"}
              </span>
            </button>
          </div>
        </section>
      )}

      {summaryResult && (
        <section
          role="status"
          className="rounded-2xl border-2 p-4 space-y-2"
          style={{
            backgroundColor: "var(--ms-prov-doctor-bg)",
            borderColor: "var(--ms-prov-doctor-border)",
          }}
        >
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Transcript Summarized &amp; Ready for Clinical Review</span>
          </div>
          {summaryResult.provenance?.ai_simplified?.summary && (
            <p className="text-sm leading-relaxed">{summaryResult.provenance.ai_simplified.summary}</p>
          )}
        </section>
      )}

      {statusMsg && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border-2 px-4 py-2.5 text-xs font-bold"
          style={{
            backgroundColor: "var(--ms-primary-soft)",
            borderColor: "var(--ms-primary)",
            color: "var(--ms-ink)",
          }}
        >
          {statusMsg}
        </p>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-danger-bg)",
            borderColor: "var(--ms-danger-border)",
            color: "var(--ms-danger-ink)",
          }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  );
}
