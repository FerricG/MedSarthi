"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FileUp,
  Loader2,
  Paperclip,
  RotateCw,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  formatLanguageLabel,
  getPatientDisplayName,
} from "@/components/doctor/doctorHelpers";
import {
  api,
  ApiError,
  fetchAuthenticatedBlobUrl,
  type DoctorPatientLinkItem,
  type MedicalDocumentDTO,
} from "@/lib/api";

const DOC_TYPES: Array<{ value: MedicalDocumentDTO["document_type"]; label: string }> = [
  { value: "prescription", label: "Prescription (Rx)" },
  { value: "lab_report", label: "Lab Report" },
  { value: "discharge_summary", label: "Discharge Summary" },
  { value: "clinical_note", label: "Clinical Note" },
  { value: "other", label: "Other Medical Document" },
];

export interface DocumentOcrReviewProps {
  patients?: DoctorPatientLinkItem[];
  patientId: string;
  onPatientChange?: (patientId: string) => void;
  consultationId?: string;
  onAttachToConsultation?: (doc: MedicalDocumentDTO) => Promise<void> | void;
}

export function DocumentOcrReview({
  patients = [],
  patientId,
  onPatientChange,
  consultationId,
  onAttachToConsultation,
}: DocumentOcrReviewProps) {
  const [docType, setDocType] = useState<MedicalDocumentDTO["document_type"]>("prescription");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingDocs, setExistingDocs] = useState<MedicalDocumentDTO[]>([]);
  const [activeDoc, setActiveDoc] = useState<MedicalDocumentDTO | null>(null);

  const [editedOcrText, setEditedOcrText] = useState("");
  const [editedFieldsJson, setEditedFieldsJson] = useState("");
  const [fieldsJsonError, setFieldsJsonError] = useState<string | null>(null);

  const [pageNum, setPageNum] = useState(1);
  const [zoomPct, setZoomPct] = useState(100);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [busyStep, setBusyStep] = useState<
    "idle" | "uploading" | "extracting" | "verifying" | "attaching"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setExistingDocs([]);
      return;
    }
    let active = true;
    api
      .listDocuments(patientId)
      .then((list) => {
        if (active) setExistingDocs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (active) setExistingDocs([]);
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  function hydrateDocState(doc: MedicalDocumentDTO) {
    setActiveDoc(doc);
    setEditedOcrText(doc.ocr_raw_text ?? "");
    setEditedFieldsJson(
      doc.ocr_structured_fields
        ? JSON.stringify(doc.ocr_structured_fields, null, 2)
        : "{}"
    );
    setFieldsJsonError(null);
    setPageNum(1);
    setZoomPct(100);
    setRotationDeg(0);
  }

  useEffect(() => {
    if (!activeDoc?.id) {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);

    const previewPath = api.getDocumentPreviewUrl(activeDoc.id, pageNum);
    fetchAuthenticatedBlobUrl(previewPath)
      .then((blobUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        createdUrl = blobUrl;
        setPreviewBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return blobUrl;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(
            err instanceof ApiError
              ? err.message
              : "Document page preview image is unavailable for this record."
          );
          setPreviewBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [activeDoc?.id, pageNum]);

  async function handleSelectExisting(docId: string) {
    if (!docId) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const full = await api.getDocument(docId);
      hydrateDocState(full);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to load document.");
    }
  }

  async function handleUploadAndExtract() {
    setErrorMsg(null);
    setStatusMsg(null);
    if (!patientId) {
      setErrorMsg("Please select a linked patient before uploading a medical document.");
      return;
    }
    if (!selectedFile) {
      setErrorMsg("Choose a PDF, JPG, PNG, or WEBP file first.");
      return;
    }

    try {
      setBusyStep("uploading");
      const uploaded = await api.uploadDocument(selectedFile, docType, {
        patientId,
        consultationId,
      });
      hydrateDocState(uploaded);

      setBusyStep("extracting");
      const extracted = await api.extractDocument(uploaded.id);
      hydrateDocState(extracted);

      setExistingDocs((prev) => [
        extracted,
        ...prev.filter((item) => item.id !== extracted.id),
      ]);

      const uncertainCount = extracted.uncertain_spans?.length ?? 0;
      setStatusMsg(
        uncertainCount > 0 || extracted.processing_status === "needs_verification"
          ? `OCR extracted with ${uncertainCount} uncertain span(s) below 0.75 confidence. Please verify alongside the page image.`
          : "OCR extraction complete. Review extracted text and fields, then confirm verification."
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Unable to upload or extract document OCR."
      );
    } finally {
      setBusyStep("idle");
    }
  }

  async function handleVerify(decision: "confirm" | "reject_unreadable") {
    if (!activeDoc) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setFieldsJsonError(null);

    let parsedFields: Record<string, unknown> | undefined;
    if (decision === "confirm" && editedFieldsJson.trim()) {
      try {
        const parsed = JSON.parse(editedFieldsJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedFields = parsed as Record<string, unknown>;
        } else {
          setFieldsJsonError("Structured fields must be a JSON object.");
          return;
        }
      } catch {
        setFieldsJsonError("Structured fields JSON is invalid. Please fix syntax or clear it.");
        return;
      }
    }

    setBusyStep("verifying");
    try {
      const verified = await api.verifyDocument(activeDoc.id, {
        corrected_ocr_text: decision === "confirm" ? editedOcrText : undefined,
        corrected_structured_fields: decision === "confirm" ? parsedFields : undefined,
        verification_decision: decision,
      });
      hydrateDocState(verified);
      setExistingDocs((prev) =>
        prev.map((d) => (d.id === verified.id ? verified : d))
      );
      setStatusMsg(
        decision === "confirm"
          ? "OCR verified by doctor. You can now attach this document to the consultation."
          : "Document marked unreadable — blocked from automatic explanation."
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Unable to save document verification."
      );
    } finally {
      setBusyStep("idle");
    }
  }

  async function handleAttach() {
    if (!activeDoc || !onAttachToConsultation) return;
    setErrorMsg(null);
    setBusyStep("attaching");
    try {
      await onAttachToConsultation(activeDoc);
      setStatusMsg("Verified document attached to consultation.");
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Failed to attach document to consultation."
      );
    } finally {
      setBusyStep("idle");
    }
  }

  const uncertainSpans = activeDoc?.uncertain_spans ?? [];
  const hasLowConfidence =
    uncertainSpans.length > 0 ||
    activeDoc?.processing_status === "needs_verification" ||
    (activeDoc?.ocr_confidence_score != null && activeDoc.ocr_confidence_score < 0.75);

  const isDoctorVerified = activeDoc?.verification_status === "doctor_verified";
  const isRejected = activeDoc?.verification_status === "rejected_unreadable";

  return (
    <div className="space-y-5">
      {/* Upload & Document Selector Card */}
      <section className="ms-card space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-extrabold">
            Document Upload &amp; Split-Screen OCR Verification
          </h2>
          <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
            Upload a prescription or lab report (PDF, JPG, PNG). Any low-confidence text (&lt; 0.75)
            is flagged as &ldquo;Needs Doctor Verification — Never Guessed&rdquo;.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {patients.length > 0 && onPatientChange && (
            <div>
              <label htmlFor="ocr-patient-select" className="mb-1.5 block text-xs font-extrabold uppercase">
                Linked Patient *
              </label>
              <select
                id="ocr-patient-select"
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
            <label htmlFor="ocr-doc-type" className="mb-1.5 block text-xs font-extrabold uppercase">
              Document Type
            </label>
            <select
              id="ocr-doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value as MedicalDocumentDTO["document_type"])}
              className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              {DOC_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {existingDocs.length > 0 && (
            <div>
              <label htmlFor="ocr-existing-doc" className="mb-1.5 block text-xs font-extrabold uppercase">
                Or Load Patient&apos;s Existing Upload
              </label>
              <select
                id="ocr-existing-doc"
                value={activeDoc?.id ?? ""}
                onChange={(e) => void handleSelectExisting(e.target.value)}
                className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                <option value="">Choose uploaded document...</option>
                {existingDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.original_filename} ({d.verification_status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-dashed p-4"
          style={{ borderColor: "var(--ms-border)" }}
        >
          <div className="space-y-1">
            <label htmlFor="ocr-file-input" className="block text-xs font-extrabold uppercase">
              Upload Rx / Lab PDF or Image (Max 15 MB)
            </label>
            <input
              id="ocr-file-input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] ?? null);
                setErrorMsg(null);
              }}
              className="block text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-2 file:text-xs file:font-bold"
            />
          </div>

          <button
            type="button"
            disabled={busyStep !== "idle" || !selectedFile}
            onClick={() => void handleUploadAndExtract()}
            className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {busyStep === "uploading" || busyStep === "extracting" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {busyStep === "uploading"
                ? "Uploading Document..."
                : busyStep === "extracting"
                  ? "Extracting OCR..."
                  : "Upload & Extract OCR"}
            </span>
          </button>
        </div>
      </section>

      {/* Split-Screen Verification Workspace */}
      {activeDoc && (
        <section
          aria-label="Split-Screen OCR Verification"
          className="ms-card space-y-4 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--ms-border)" }}>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <FileSearch className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <h3 className="text-base font-extrabold">{activeDoc.original_filename}</h3>
                <span
                  className="rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase"
                  style={{
                    backgroundColor: isDoctorVerified
                      ? "var(--ms-prov-doctor-bg)"
                      : isRejected
                        ? "var(--ms-danger-bg)"
                        : "var(--ms-prov-uncertain-bg)",
                    borderColor: isDoctorVerified
                      ? "var(--ms-prov-doctor-border)"
                      : isRejected
                        ? "var(--ms-danger-border)"
                        : "var(--ms-prov-uncertain-border)",
                  }}
                >
                  {activeDoc.verification_status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                Pages: {activeDoc.page_count} • Processing: {activeDoc.processing_status}
                {activeDoc.ocr_confidence_score != null &&
                  ` • Overall OCR Confidence: ${Math.round(activeDoc.ocr_confidence_score * 100)}%`}
              </p>
            </div>

            {activeDoc.ocr_raw_text === null && activeDoc.processing_status === "uploaded" && (
              <button
                type="button"
                disabled={busyStep !== "idle"}
                onClick={async () => {
                  setBusyStep("extracting");
                  try {
                    const ext = await api.extractDocument(activeDoc.id);
                    hydrateDocState(ext);
                  } catch (err) {
                    setErrorMsg(err instanceof ApiError ? err.message : "Extraction failed.");
                  } finally {
                    setBusyStep("idle");
                  }
                }}
                className="ms-btn-primary tap-target px-4 py-2 text-xs"
              >
                Run OCR Extraction
              </button>
            )}
          </div>

          {/* No-Guessing Uncertain Span Alert */}
          {hasLowConfidence && !isDoctorVerified && (
            <div
              role="alert"
              className="rounded-2xl border-2 border-dotted p-4 space-y-2.5"
              style={{
                backgroundColor: "var(--ms-prov-uncertain-bg)",
                borderColor: "var(--ms-prov-uncertain-border)",
              }}
            >
              <div className="flex items-center gap-2 text-sm font-extrabold">
                <AlertTriangle
                  className="h-5 w-5 shrink-0"
                  style={{ color: "var(--ms-prov-uncertain-border)" }}
                  aria-hidden="true"
                />
                <span>Needs Doctor Verification — Never Guessed</span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                One or more extracted medicines, dosages, or lab numbers scored below the 75% OCR
                confidence threshold. MedSarthi will never guess unclear text. Inspect the original
                page image on the left and correct or confirm the text on the right.
              </p>
              {uncertainSpans.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {uncertainSpans.map((span, idx) => (
                    <li
                      key={idx}
                      className="rounded-xl border p-2.5 text-xs space-y-1"
                      style={{
                        backgroundColor: "var(--ms-surface)",
                        borderColor: "var(--ms-prov-uncertain-border)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 font-extrabold">
                        <span>{span.field || "Unclear Span"}</span>
                        <span>{Math.round(span.confidence * 100)}% conf</span>
                      </div>
                      <p className="font-mono font-bold">&ldquo;{span.text}&rdquo;</p>
                      <p style={{ color: "var(--ms-ink-muted)" }}>{span.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Split-Screen Grid */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Left Pane: Authenticated Rendered Page Image Preview */}
            <div
              className="rounded-2xl border-2 p-3 space-y-3"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase">
                  Original Document Preview (Page {pageNum} of {activeDoc.page_count})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={pageNum <= 1}
                    onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                    className="rounded-lg border p-1.5 text-xs font-bold disabled:opacity-40"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={pageNum >= activeDoc.page_count}
                    onClick={() => setPageNum((p) => Math.min(activeDoc.page_count, p + 1))}
                    className="rounded-lg border p-1.5 text-xs font-bold disabled:opacity-40"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => setZoomPct((z) => Math.max(75, z - 25))}
                    className="rounded-lg border p-1.5 text-xs font-bold"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="px-1 text-xs font-bold">{zoomPct}%</span>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => setZoomPct((z) => Math.min(200, z + 25))}
                    className="rounded-lg border p-1.5 text-xs font-bold"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Rotate 90 degrees"
                    onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                    className="rounded-lg border p-1.5 text-xs font-bold"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  >
                    <RotateCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div
                className="flex min-h-72 max-h-[460px] items-center justify-center overflow-auto rounded-xl border p-3"
                style={{ backgroundColor: "#FFFFFF", borderColor: "var(--ms-border)" }}
              >
                {previewLoading ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Loading authenticated page preview...</span>
                  </div>
                ) : previewBlobUrl ? (
                  <img
                    src={previewBlobUrl}
                    alt={`${activeDoc.original_filename} page ${pageNum}`}
                    style={{
                      width: `${zoomPct}%`,
                      transform: `rotate(${rotationDeg}deg)`,
                      transition: "transform 150ms ease",
                    }}
                    className="max-w-none object-contain"
                  />
                ) : (
                  <div className="p-4 text-center text-xs font-medium text-slate-600 space-y-1">
                    <p>{previewError || "Preview image unavailable."}</p>
                    <p>You can still review and verify the extracted text on the right.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Editable OCR Text & Structured Fields */}
            <div className="space-y-4">
              {(() => {
                const sf = activeDoc.ocr_structured_fields || {};
                const labItems = Array.isArray(sf.lab_rows)
                  ? sf.lab_rows
                  : Array.isArray(sf.tests)
                    ? sf.tests
                    : [];
                const medItems = Array.isArray(sf.medications) ? sf.medications : [];
                if (labItems.length === 0 && medItems.length === 0) return null;
                return (
                  <div
                    className="rounded-xl border p-3 space-y-2 text-xs"
                    style={{
                      backgroundColor: "var(--ms-surface-alt)",
                      borderColor: "var(--ms-border)",
                    }}
                  >
                    <span className="block font-extrabold uppercase">
                      Detected Clinical Entities
                    </span>
                    {labItems.length > 0 && (
                      <ul className="space-y-1">
                        {labItems.map((item, i) => {
                          const rec = (item && typeof item === "object" ? item : {}) as Record<
                            string,
                            unknown
                          >;
                          const label = String(rec.test_name ?? rec.name ?? "Test");
                          const val = String(rec.value ?? "");
                          const unit = String(rec.unit ?? "");
                          const needsVerif = Boolean(rec.needs_verification);
                          return (
                            <li
                              key={i}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1"
                              style={{
                                backgroundColor: "var(--ms-surface)",
                                borderColor: needsVerif
                                  ? "var(--ms-prov-uncertain-border)"
                                  : "var(--ms-border)",
                              }}
                            >
                              <span className="font-bold">
                                {label}: {val} {unit}
                              </span>
                              {needsVerif && (
                                <span className="font-extrabold" style={{ color: "var(--ms-prov-uncertain-border)" }}>
                                  Verify
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {medItems.length > 0 && (
                      <ul className="space-y-1">
                        {medItems.map((item, i) => {
                          const rec = (item && typeof item === "object" ? item : {}) as Record<
                            string,
                            unknown
                          >;
                          return (
                            <li
                              key={i}
                              className="rounded-lg border px-2.5 py-1 font-bold"
                              style={{
                                backgroundColor: "var(--ms-surface)",
                                borderColor: "var(--ms-border)",
                              }}
                            >
                              {String(rec.raw_line ?? `${rec.name ?? ""} ${rec.dose ?? ""}`.trim())}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })()}

              <div>
                <label htmlFor="ocr-raw-editor" className="mb-1.5 block text-xs font-extrabold uppercase">
                  Extracted Text (Verify &amp; Correct Unclear Values)
                </label>
                <textarea
                  id="ocr-raw-editor"
                  rows={8}
                  value={editedOcrText}
                  onChange={(e) => setEditedOcrText(e.target.value)}
                  className="w-full rounded-xl border-2 p-3 font-mono text-xs leading-relaxed"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: hasLowConfidence && !isDoctorVerified
                      ? "var(--ms-prov-uncertain-border)"
                      : "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />
              </div>

              <div>
                <label htmlFor="ocr-fields-editor" className="mb-1.5 block text-xs font-extrabold uppercase">
                  Extracted Structured Fields (JSON)
                </label>
                <textarea
                  id="ocr-fields-editor"
                  rows={6}
                  value={editedFieldsJson}
                  onChange={(e) => setEditedFieldsJson(e.target.value)}
                  className="w-full rounded-xl border-2 p-3 font-mono text-xs leading-relaxed"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: fieldsJsonError ? "var(--ms-danger-border)" : "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />
                {fieldsJsonError && (
                  <p className="mt-1 text-xs font-bold" style={{ color: "var(--ms-danger-ink)" }}>
                    {fieldsJsonError}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={busyStep !== "idle"}
                  onClick={() => void handleVerify("reject_unreadable")}
                  className="tap-target inline-flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-xs font-bold"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-danger-border)",
                    color: "var(--ms-danger-ink)",
                  }}
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  <span>Mark Unreadable</span>
                </button>

                <button
                  type="button"
                  disabled={busyStep !== "idle"}
                  onClick={() => void handleVerify("confirm")}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {busyStep === "verifying" ? "Verifying..." : "Confirm & Verify OCR"}
                  </span>
                </button>

                {onAttachToConsultation && (
                  <button
                    type="button"
                    disabled={busyStep !== "idle" || isRejected || (!isDoctorVerified && hasLowConfidence)}
                    onClick={() => void handleAttach()}
                    title={
                      hasLowConfidence && !isDoctorVerified
                        ? "Verify unclear OCR spans first before attaching"
                        : undefined
                    }
                    className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
                  >
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {busyStep === "attaching" ? "Attaching..." : "Attach to Consultation"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
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
