"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DiagramViewer } from "@/components/DiagramViewer";
import { IntegrityNotice } from "@/components/IntegrityNotice";
import { ProvenanceCards } from "@/components/ProvenanceCards";
import { TermLookupModal } from "@/components/TermLookupModal";
import { useI18n } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  fetchAuthenticatedBlobUrl,
  normalizeProvenance,
  type CuratedDiagram,
  type IntegrityReport,
  type MedicalDocumentDTO,
  type ProvenancePayload,
} from "@/lib/api";

function ReportsWorkspace() {
  const { locale } = useI18n();

  const [docs, setDocs] = useState<MedicalDocumentDTO[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<MedicalDocumentDTO | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const [docType, setDocType] = useState<MedicalDocumentDTO["document_type"]>("lab_report");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const [correctedText, setCorrectedText] = useState("");
  const [explanation, setExplanation] = useState<{
    provenance: ProvenancePayload;
    integrity?: IntegrityReport;
    diagrams?: CuratedDiagram[];
    warning?: string;
  } | null>(null);

  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  async function refreshDocs(selectId?: string) {
    setLoadingList(true);
    try {
      const list = await api.listDocuments();
      setDocs(list);
      const target =
        (selectId ? list.find((d) => d.id === selectId) : null) ??
        (selectedDoc ? list.find((d) => d.id === selectedDoc.id) : null) ??
        list[0] ??
        null;
      if (target) {
        selectDocument(target);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load your reports.");
    } finally {
      setLoadingList(false);
    }
  }

  function selectDocument(doc: MedicalDocumentDTO) {
    setSelectedDoc(doc);
    setCorrectedText(doc.ocr_raw_text || "");
    setExplanation(null);
    setErrorMsg(null);
  }

  useEffect(() => {
    void refreshDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setPreviewBlobUrl(null);
    setPreviewError(false);

    if (!selectedDoc) return;

    const previewPath =
      selectedDoc.signed_preview_url ||
      selectedDoc.preview_url ||
      api.getDocumentPreviewUrl(selectedDoc.id, 1);

    fetchAuthenticatedBlobUrl(previewPath)
      .then((url) => {
        if (active) {
          createdUrl = url;
          setPreviewBlobUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (active) setPreviewError(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [selectedDoc]);

  async function handleUploadAndExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setErrorMsg(null);
    setUploading(true);
    try {
      const uploaded = await api.uploadDocument(selectedFile, docType);
      setSelectedFile(null);
      setExtracting(true);
      const extracted = await api.extractDocument(uploaded.id);
      await refreshDocs(extracted.id);
      selectDocument(extracted);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Upload or reading failed.");
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  }

  async function handleVerify(decision: "confirm" | "reject_unreadable") {
    if (!selectedDoc) return;
    setVerifying(true);
    setErrorMsg(null);
    try {
      const updated = await api.verifyDocument(selectedDoc.id, {
        corrected_ocr_text: correctedText,
        verification_decision: decision,
      });
      setSelectedDoc(updated);
      await refreshDocs(updated.id);
      if (decision === "confirm") {
        await handleExplainDocument(updated);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not save verification.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleExplainDocument(docOverride?: MedicalDocumentDTO) {
    const target = docOverride ?? selectedDoc;
    if (!target) return;
    setExplaining(true);
    setErrorMsg(null);
    try {
      const res = await api.explainDocument(target.id, {
        target_language: locale,
      });
      setExplanation({
        provenance: normalizeProvenance(res.provenance),
        integrity: res.integrity,
        diagrams: res.visual_diagrams,
        warning: res.ocr_warning,
      });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not explain this report.");
    } finally {
      setExplaining(false);
    }
  }

  async function handleDelete(docId: string) {
    try {
      await api.deleteDocument(docId);
      setSelectedDoc(null);
      setExplanation(null);
      await refreshDocs();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not delete report.");
    }
  }

  const needsVerification =
    selectedDoc &&
    selectedDoc.verification_status === "unverified" &&
    (selectedDoc.processing_status === "needs_verification" ||
      (selectedDoc.ocr_confidence_score !== null && selectedDoc.ocr_confidence_score < 0.75) ||
      (selectedDoc.uncertain_spans && selectedDoc.uncertain_spans.length > 0));
  const isRejectedUnreadable = selectedDoc?.verification_status === "rejected_unreadable";

  const structuredFields = selectedDoc?.ocr_structured_fields as
    | {
        tests?: Array<{ name?: string; test_name?: string; value: string; unit?: string; reference_range?: string }>;
        lab_rows?: Array<{ name?: string; test_name?: string; value: string; unit?: string; reference_range?: string }>;
      }
    | null
    | undefined;
  const detectedLabRows = structuredFields?.tests ?? structuredFields?.lab_rows ?? [];

  return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Understand my report</h1>
          <p className="text-sm" style={{ color: "var(--ms-ink-muted)" }}>
            Upload a lab report or prescription (PDF, PNG, JPG). If any number or medicine name is hard to read,
            MedSarthi will ask you to check the image instead of guessing.
          </p>
        </header>

        {/* Upload Form */}
        <section className="ms-card p-5 sm:p-6 space-y-4">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <Upload className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <span>Upload a Lab Report or Prescription</span>
          </h2>

          <form onSubmit={(e) => void handleUploadAndExtract(e)} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="doc-type" className="mb-1.5 block text-xs font-extrabold uppercase">
                Paper Type
              </label>
              <select
                id="doc-type"
                value={docType}
                onChange={(e) => setDocType(e.target.value as MedicalDocumentDTO["document_type"])}
                className="tap-target w-full rounded-xl border-2 px-3 py-2.5 text-sm font-bold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                <option value="lab_report">Lab Report</option>
                <option value="prescription">Prescription</option>
                <option value="discharge_summary">Discharge Summary</option>
                <option value="clinical_note">Doctor Note</option>
                <option value="other">Other Medical Paper</option>
              </select>
            </div>

            <div>
              <label htmlFor="doc-file" className="mb-1.5 block text-xs font-extrabold uppercase">
                Choose File (PDF, PNG, JPG)
              </label>
              <input
                id="doc-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="tap-target w-full rounded-xl border-2 px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={!selectedFile || uploading || extracting}
                className="ms-btn-primary tap-target-lg flex w-full items-center justify-center gap-2 px-4 text-sm disabled:opacity-50"
              >
                {uploading || extracting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>{extracting ? "Reading text..." : "Uploading..."}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5" aria-hidden="true" />
                    <span>Upload &amp; Read</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

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

        {/* Saved Reports List */}
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">Your Reports &amp; Prescriptions</h2>
          {loadingList ? (
            <div className="ms-card p-6 text-center text-sm font-bold">Loading documents...</div>
          ) : docs.length === 0 ? (
            <div className="ms-card p-6 text-center text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              No reports uploaded yet. Upload one above to begin.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((doc) => {
                const active = selectedDoc?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => selectDocument(doc)}
                    className="ms-card tap-target-lg flex items-start justify-between gap-3 p-4 text-left"
                    style={{
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                      backgroundColor: active ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                    }}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                        <span className="font-extrabold text-sm break-all">{doc.original_filename}</span>
                      </div>
                      <span className="block text-xs font-semibold capitalize" style={{ color: "var(--ms-ink-muted)" }}>
                        {doc.document_type.replace("_", " ")} • {doc.verification_status.replace("_", " ")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Selected Document Workspace: Preview + No-Guessing OCR Verification + Explanation */}
        {selectedDoc && (
          <section className="ms-card p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--ms-border)" }}>
              <div>
                <h2 className="text-xl font-extrabold">{selectedDoc.original_filename}</h2>
                <p className="text-xs font-bold" style={{ color: "var(--ms-ink-muted)" }}>
                  Status: {selectedDoc.processing_status.replace(/_/g, " ")} •{" "}
                  Verification: {selectedDoc.verification_status.replace(/_/g, " ")}
                  {selectedDoc.ocr_confidence_score !== null &&
                    ` • Clarity: ${Math.round(selectedDoc.ocr_confidence_score * 100)}%`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {!needsVerification && !isRejectedUnreadable && (
                  <button
                    type="button"
                    disabled={explaining}
                    onClick={() => void handleExplainDocument()}
                    className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>{explaining ? "Preparing simple guide..." : "Explain This Report"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(selectedDoc.id)}
                  className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-xs"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            {/* Rejected / Marked for Doctor Review Banner */}
            {isRejectedUnreadable && (
              <div
                role="status"
                className="rounded-2xl border-2 border-dotted p-4 space-y-1.5"
                style={{
                  backgroundColor: "var(--ms-prov-uncertain-bg)",
                  borderColor: "var(--ms-prov-uncertain-border)",
                }}
              >
                <h3 className="text-base font-extrabold">
                  Held for your doctor&apos;s review
                </h3>
                <p className="text-sm">
                  You marked this paper as hard to read, so MedSarthi will not guess or explain it automatically.
                  Please ask your doctor to review the original paper, or upload a clearer photo or PDF above.
                </p>
              </div>
            )}

            {/* No-Guessing Mandatory Verification Gate when confidence < 0.75 */}
            {needsVerification && (
              <div
                role="alert"
                className="rounded-2xl border-2 border-dotted p-4 space-y-3"
                style={{
                  backgroundColor: "var(--ms-prov-uncertain-bg)",
                  borderColor: "var(--ms-prov-uncertain-border)",
                }}
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" style={{ color: "var(--ms-prov-uncertain-border)" }} aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-extrabold">
                      Some parts were hard to read clearly — MedSarthi will not guess
                    </h3>
                    <p className="text-sm">
                      Please compare the paper preview on the left with the text on the right, fix any
                      unclear words or numbers, and tap <strong>Confirm &amp; Explain</strong>. If you are
                      not sure, tap <strong>Ask My Doctor Instead</strong>.
                    </p>
                  </div>
                </div>

                {selectedDoc.uncertain_spans && selectedDoc.uncertain_spans.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedDoc.uncertain_spans.map((span, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border p-2.5 text-xs space-y-0.5"
                        style={{
                          backgroundColor: "var(--ms-surface)",
                          borderColor: "var(--ms-prov-uncertain-border)",
                        }}
                      >
                        <span className="font-extrabold uppercase">
                          {span.field} ({Math.round(span.confidence * 100)}% clarity)
                        </span>
                        <p className="font-bold">Read as: &ldquo;{span.text}&rdquo;</p>
                        <p style={{ color: "var(--ms-ink-muted)" }}>{span.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Split-Screen Preview + Extracted Text / Lab Table */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-extrabold uppercase flex items-center gap-1.5">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span>Original Document Preview</span>
                </h3>
                <div
                  className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-2xl border-2 p-3"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  {previewBlobUrl ? (
                    <img
                      src={previewBlobUrl}
                      alt={`Preview of ${selectedDoc.original_filename}`}
                      className="max-h-96 w-full object-contain"
                    />
                  ) : previewError ? (
                    <div className="p-4 text-center text-xs space-y-2" style={{ color: "var(--ms-ink-muted)" }}>
                      <p className="font-bold">Synthetic Demo Sample (Text Record)</p>
                      <p className="whitespace-pre-wrap text-left font-mono text-xs">
                        {selectedDoc.ocr_raw_text || "Preview image not stored for synthetic seed record."}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs font-bold">Loading document preview...</span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="ocr-verify-box" className="block text-sm font-extrabold uppercase">
                  Extracted Report Text (Editable to Verify)
                </label>
                <textarea
                  id="ocr-verify-box"
                  rows={8}
                  value={correctedText}
                  onChange={(e) => setCorrectedText(e.target.value)}
                  className="w-full rounded-2xl border-2 p-3.5 text-sm leading-relaxed"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: needsVerification
                      ? "var(--ms-prov-uncertain-border)"
                      : "var(--ms-border)",
                    color: "var(--ms-ink)",
                  }}
                />

                {detectedLabRows.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold uppercase">Detected Lab Values</h4>
                      <div className="space-y-1.5">
                        {detectedLabRows.map((test, idx) => {
                          const label = test.name ?? test.test_name ?? `Lab Test ${idx + 1}`;
                          return (
                            <div
                              key={idx}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm"
                              style={{ borderColor: "var(--ms-border)" }}
                            >
                              <button
                                type="button"
                                onClick={() => setActiveTerm(label)}
                                className="font-extrabold underline decoration-dotted"
                                style={{ color: "var(--ms-primary)" }}
                              >
                                {label}
                              </button>
                              <span className="font-bold">
                                {test.value} {test.unit || ""}
                                {test.reference_range ? ` (Ref: ${test.reference_range})` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {needsVerification && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => void handleVerify("confirm")}
                      className="ms-btn-primary tap-target-lg inline-flex items-center gap-2 px-5 text-sm"
                    >
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                      <span>Confirm Text &amp; Explain</span>
                    </button>
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => void handleVerify("reject_unreadable")}
                      className="ms-btn-secondary tap-target-lg inline-flex items-center gap-2 px-4 text-sm"
                    >
                      <HelpCircle className="h-5 w-5" aria-hidden="true" />
                      <span>Ask My Doctor Instead</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Report Explanation */}
        {explanation && (
          <section className="space-y-4">
            {explanation.warning && (
              <div
                className="rounded-xl border-2 p-3.5 text-sm font-bold"
                style={{
                  backgroundColor: "var(--ms-prov-uncertain-bg)",
                  borderColor: "var(--ms-prov-uncertain-border)",
                }}
              >
                {explanation.warning}
              </div>
            )}

            {explanation.integrity && <IntegrityNotice report={explanation.integrity} />}

            {explanation.provenance.ai_simplified.summary && (
              <AudioPlayer
                text={explanation.provenance.ai_simplified.summary}
                language={locale}
                label="Listen to report explanation"
              />
            )}

            <ProvenanceCards
              provenance={explanation.provenance}
              onTermClick={(term) => setActiveTerm(term)}
            />

            {explanation.diagrams &&
              explanation.diagrams.map((d) => (
                <DiagramViewer key={d.id} diagramId={d.id} diagram={d} language={locale} />
              ))}
          </section>
        )}

        <TermLookupModal
          initialTerm={activeTerm}
          language={locale}
          onClose={() => setActiveTerm(null)}
        />
      </div>
  );
}

export default function PatientReportsPage() {
  return (
    <PatientGate>
      <ReportsWorkspace />
    </PatientGate>
  );
}
