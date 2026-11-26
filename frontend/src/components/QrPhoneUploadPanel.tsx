"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Play,
  QrCode,
  RefreshCw,
  Smartphone,
  Square,
  AlertTriangle,
} from "lucide-react";
import {
  api,
  ApiError,
  type MedicalDocumentDTO,
  type RemoteUploadStatusDTO,
} from "@/lib/api";

export interface QrPhoneUploadPanelProps {
  onPrescriptionImported?: (doc: MedicalDocumentDTO) => void;
  title?: string;
}

export function QrPhoneUploadPanel({
  onPrescriptionImported,
  title = "Scan QR from Phone to Upload Prescription",
}: QrPhoneUploadPanelProps) {
  const [status, setStatus] = useState<RemoteUploadStatusDTO | null>(null);
  const [authtoken, setAuthtoken] = useState("");
  const [portInput, setPortInput] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [importingFile, setImportingFile] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await api.getRemoteUploadStatus();
      setStatus(data);
    } catch {
      // Ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initQr() {
      try {
        const data = await api.getRemoteUploadStatus();
        if (!active) return;
        setStatus(data);
        if (!data.running) {
          const started = await api.startRemoteUpload({});
          if (active) setStatus(started);
        }
      } catch {
        // Ignore transient startup errors
      }
    }
    void initQr();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!status?.running) return;
    const id = window.setInterval(() => {
      void refreshStatus();
    }, 2500);
    return () => window.clearInterval(id);
  }, [status?.running, refreshStatus]);

  async function handleStart() {
    setErrorMsg(null);
    setBusy(true);
    try {
      const portNum = Number(portInput) || 5000;
      const data = await api.startRemoteUpload({
        port: portNum,
        authtoken: authtoken.trim() || undefined,
      });
      setStatus(data);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not start QR upload server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setErrorMsg(null);
    setBusy(true);
    try {
      const data = await api.stopRemoteUpload();
      setStatus(data);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not stop QR upload server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenFolder() {
    try {
      await api.openRemoteUploadFolder();
    } catch {
      // Ignore if headless
    }
  }

  async function handleImport(filename: string) {
    setErrorMsg(null);
    setImportingFile(filename);
    try {
      const doc = await api.importRemoteUploadToPrescription(filename);
      await refreshStatus();
      onPrescriptionImported?.(doc);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not import image as prescription.");
    } finally {
      setImportingFile(null);
    }
  }

  return (
    <div
      className="rounded-2xl border-2 p-4 sm:p-5 space-y-4"
      style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <QrCode className="h-6 w-6 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <div>
            <h3 className="text-lg font-extrabold">{title}</h3>
            <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
              Works across different networks (mobile data ↔ PC Wi-Fi) via Flask + ngrok.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
            style={{
              borderColor: status?.running ? "var(--ms-primary)" : "var(--ms-border)",
              backgroundColor: status?.running ? "var(--ms-primary-soft)" : "var(--ms-surface)",
            }}
          >
            Server: {status?.server_status || "stopped"}
          </span>
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs font-extrabold"
            style={{
              borderColor: status?.tunnel_status === "connected" ? "var(--ms-primary)" : "var(--ms-border)",
              backgroundColor: status?.tunnel_status === "connected" ? "var(--ms-primary-soft)" : "var(--ms-surface)",
            }}
          >
            Tunnel: {status?.tunnel_status || "stopped"}
          </span>
        </div>
      </div>

      {!status?.running ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="password"
              value={authtoken}
              onChange={(e) => setAuthtoken(e.target.value)}
              placeholder="Optional ngrok authtoken (or set in .env)"
              className="tap-target sm:col-span-2 rounded-xl border-2 px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
            />
            <input
              type="number"
              min={1024}
              max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              placeholder="Port (5000)"
              className="tap-target rounded-xl border-2 px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
            />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleStart()}
            className="ms-btn-primary tap-target inline-flex items-center gap-2 px-5 text-sm font-extrabold"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>{busy ? "Starting Flask & ngrok..." : "Start QR Phone Upload"}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStop()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm font-extrabold"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              <span>Stop Server &amp; Tunnel</span>
            </button>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-3 text-sm"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => void handleOpenFolder()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-3 text-sm"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              <span>Open Upload Folder</span>
            </button>
          </div>

          {status.tunnel_error && (
            <div
              className="flex items-start gap-2 rounded-xl border-2 p-3 text-xs font-bold"
              style={{
                backgroundColor: "var(--ms-banner-bg)",
                borderColor: "var(--ms-banner-border)",
                color: "var(--ms-banner-ink)",
              }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{status.tunnel_error}</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 p-4 sm:flex-row" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
            {status.qr_data_url && (
              <img
                src={status.qr_data_url}
                alt="Scan QR code from phone to upload images"
                className="h-44 w-44 rounded-xl border p-1 bg-white"
              />
            )}

            <div className="flex-1 space-y-2 text-sm">
              <div className="flex items-center gap-1.5 font-extrabold">
                <Smartphone className="h-4 w-4" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <span>Scan QR code with your phone camera</span>
              </div>

              {status.public_url && (
                <div>
                  <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>
                    Public ngrok URL (Any Network)
                  </span>
                  <a
                    href={status.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-extrabold underline break-all"
                    style={{ color: "var(--ms-primary)" }}
                  >
                    <span>{status.public_url}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              )}

              {status.local_url && (
                <p className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                  Local URL: <code>{status.local_url}</code> • Folder: <code>{status.upload_dir}</code>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <p className="text-xs font-bold" style={{ color: "var(--ms-danger-ink)" }}>
          {errorMsg}
        </p>
      )}

      {/* Uploaded Images List */}
      {status && status.uploaded_count > 0 && (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--ms-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold">
              Uploaded Images on PC ({status.uploaded_count})
            </span>
            <button
              type="button"
              onClick={() => void handleOpenFolder()}
              className="text-xs font-bold underline"
              style={{ color: "var(--ms-primary)" }}
            >
              Open Folder
            </button>
          </div>
          <div className="space-y-2">
            {status.uploaded_files.map((f) => (
              <div
                key={f.filename}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                  <span className="font-bold">{f.filename}</span>
                  <span className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                    ({Math.max(1, Math.round(f.size_bytes / 1024))} KB)
                  </span>
                </div>

                {onPrescriptionImported && (
                  <button
                    type="button"
                    disabled={importingFile === f.filename}
                    onClick={() => void handleImport(f.filename)}
                    className="ms-btn-primary tap-target px-3 py-1 text-xs font-extrabold"
                  >
                    {importingFile === f.filename ? "Reading..." : "Use as Prescription →"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
