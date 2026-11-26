"use client";

import React, { useState } from "react";
import {
  Code,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  AlertCircle,
} from "lucide-react";
import type { VisualArtifactDTO } from "@/lib/api";

interface VisualArtifactViewerProps {
  visual: VisualArtifactDTO;
  onRegenerate?: () => void;
  className?: string;
}

export function VisualArtifactViewer({
  visual,
  onRegenerate,
  className = "",
}: VisualArtifactViewerProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showScript, setShowScript] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const isFailed = !visual.success || !visual.visual_url;
  const isMermaid = visual.renderer === "mermaid" || visual.output_format === "mermaid";
  const isSvg = visual.output_format === "svg";

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const handleDownload = () => {
    if (!visual.visual_url) return;
    const a = document.createElement("a");
    a.href = visual.visual_url;
    const ext = isSvg ? "svg" : isMermaid ? "txt" : "png";
    a.download = `${visual.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className={`rounded-2xl border border-teal-200 dark:border-teal-800/60 bg-gradient-to-b from-teal-50/50 to-white dark:from-teal-950/20 dark:to-neutral-900 overflow-hidden shadow-sm transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-teal-100/60 dark:bg-teal-900/40 border-b border-teal-200 dark:border-teal-800/50">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
            <Eye className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
              {visual.title || "Visual Explanation"}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 dark:text-teal-300">
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Sandboxed Subprocess
              </span>
              <span className="text-[11px] text-neutral-400">•</span>
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                {visual.renderer}
              </span>
              {visual.latency_ms && (
                <>
                  <span className="text-[11px] text-neutral-400">•</span>
                  <span className="text-[11px] text-neutral-500">{visual.latency_ms}ms</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-1">
          {!isFailed && !isMermaid && (
            <>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                title="Zoom Out"
                className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-teal-200/50 dark:hover:bg-teal-800/50 disabled:opacity-40 transition-colors"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom"
                className="px-2 py-1 text-xs font-semibold rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-teal-200/50 dark:hover:bg-teal-800/50 transition-colors"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                title="Zoom In"
                className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-teal-200/50 dark:hover:bg-teal-800/50 disabled:opacity-40 transition-colors"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                title="Fullscreen View"
                className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-teal-200/50 dark:hover:bg-teal-800/50 transition-colors ml-1"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </>
          )}
          {visual.script && (
            <button
              type="button"
              onClick={() => setShowScript((prev) => !prev)}
              title="Toggle Script"
              className={`p-1.5 rounded-lg transition-colors ${
                showScript
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-teal-200/50 dark:hover:bg-teal-800/50"
              }`}
            >
              <Code className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {visual.description && (
        <div className="px-4 py-2 bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-teal-100 dark:border-teal-900/30 text-xs text-neutral-600 dark:text-neutral-400">
          {visual.description}
        </div>
      )}

      {/* Visual Canvas / Frame */}
      <div className="relative p-3 overflow-hidden flex items-center justify-center min-h-[220px] bg-white dark:bg-neutral-950/80">
        {isFailed ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
            <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Visual Execution Failed
            </p>
            <p className="text-xs text-neutral-500 mt-1 mb-3">
              {visual.error_message || "The sandbox encountered an execution error while compiling this visual."}
            </p>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-sm transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Visual Generation
              </button>
            )}
          </div>
        ) : isMermaid ? (
          <div className="w-full overflow-x-auto p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-300 whitespace-pre">
              {visual.script}
            </pre>
          </div>
        ) : (
          <div className="overflow-auto max-h-[460px] w-full flex items-center justify-center p-2">
            <img
              src={visual.visual_url || ""}
              alt={visual.title}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out",
              }}
              className="max-w-full h-auto object-contain rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 select-none"
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Script Accordion */}
      {showScript && visual.script && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-950 p-4 text-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-neutral-400 uppercase">
              Isolated Execution Script ({visual.renderer})
            </span>
            <span className="text-[11px] text-emerald-400">Validated AST Sandbox</span>
          </div>
          <pre className="text-xs font-mono overflow-x-auto bg-neutral-900 p-3 rounded-lg border border-neutral-800 text-emerald-300/90 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
            {visual.script}
          </pre>
        </div>
      )}

      {/* Footer & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900/60 border-t border-teal-100 dark:border-teal-900/40 text-xs">
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">
          Educational Illustration • Not diagnostic
        </div>
        <div className="flex items-center gap-2">
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
          {!isFailed && visual.visual_url && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors"
            >
              <Download className="h-3 w-3" />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && visual.visual_url && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 text-white">
            <div>
              <h3 className="text-base font-bold">{visual.title}</h3>
              <p className="text-xs text-neutral-400">High-Resolution Sandboxed Visualization</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 hover:text-white transition-colors"
                title="Exit Fullscreen"
              >
                <Minimize2 className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={visual.visual_url}
              alt={visual.title}
              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-neutral-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
