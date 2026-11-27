"use client";

import React, { useEffect, useState } from "react";
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
  const [svgContent, setSvgContent] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  const isMermaid = visual.renderer === "mermaid" || visual.output_format === "mermaid";
  const isSvg = visual.output_format === "svg";
  const isFailed = !visual.success || (!visual.visual_url && !visual.script);

  useEffect(() => {
    if (!isMermaid || !visual.script) {
      setSvgContent("");
      return;
    }

    let isMounted = true;
    setIsRendering(true);
    setRenderError(null);

    const renderMermaid = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          fontFamily: "inherit",
          themeVariables: {
            primaryColor: "#0F766E",
            primaryTextColor: "#FFFFFF",
            primaryBorderColor: "#0D9488",
            lineColor: "#475569",
            secondaryColor: "#CCFBF1",
            tertiaryColor: "#F1F5F9",
          },
        });

        // Unique ID for mermaid render container
        const renderId = `mmd-${Math.random().toString(36).substring(2, 9)}`;

        let cleanScript = (visual.script || "").trim();
        cleanScript = cleanScript.replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();

        const { svg } = await mermaid.render(renderId, cleanScript);
        if (isMounted) {
          setSvgContent(svg);
          setIsRendering(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const errObj = err as { message?: string };
          console.error("Mermaid render error:", err);
          setRenderError(errObj?.message || "Failed to render flowchart diagram.");
          setIsRendering(false);
        }
      }
    };

    void renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [isMermaid, visual.script]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const handleDownload = () => {
    if (isMermaid && svgContent) {
      const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${visual.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    if (!visual.visual_url) return;
    const a = document.createElement("a");
    a.href = visual.visual_url;
    const ext = isSvg ? "svg" : "png";
    a.download = `${visual.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden shadow-sm transition-all ${className}`}
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b-2"
        style={{
          backgroundColor: "var(--ms-surface-alt)",
          borderColor: "var(--ms-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg shadow-sm"
            style={{
              backgroundColor: "var(--ms-primary)",
              color: "var(--ms-primary-ink)",
            }}
          >
            <Eye className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold leading-tight" style={{ color: "var(--ms-ink)" }}>
              {visual.title || "Visual Explanation"}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: "var(--ms-primary)" }}
              >
                <ShieldCheck className="h-3 w-3" />
                Sandboxed Subprocess
              </span>
              <span className="text-[11px] opacity-40">•</span>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ms-ink-muted)" }}>
                {visual.renderer}
              </span>
              {visual.latency_ms && (
                <>
                  <span className="text-[11px] opacity-40">•</span>
                  <span className="text-[11px]" style={{ color: "var(--ms-ink-muted)" }}>{visual.latency_ms}ms</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-1">
          {!isFailed && (
            <>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                title="Zoom Out"
                className="p-1.5 rounded-lg border hover:opacity-80 disabled:opacity-40 transition-colors"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom"
                className="px-2 py-1 text-xs font-bold rounded-lg border hover:opacity-80 transition-colors"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                title="Zoom In"
                className="p-1.5 rounded-lg border hover:opacity-80 disabled:opacity-40 transition-colors"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                title="Fullscreen View"
                className="p-1.5 rounded-lg border hover:opacity-80 transition-colors ml-1"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
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
              className="p-1.5 rounded-lg border transition-all"
              style={{
                backgroundColor: showScript ? "var(--ms-primary)" : "var(--ms-surface)",
                borderColor: showScript ? "var(--ms-primary)" : "var(--ms-border)",
                color: showScript ? "var(--ms-primary-ink)" : "var(--ms-ink)",
              }}
            >
              <Code className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {visual.description && (
        <div
          className="px-4 py-2 border-b-2 text-xs font-medium"
          style={{
            backgroundColor: "var(--ms-surface-alt)",
            borderColor: "var(--ms-border)",
            color: "var(--ms-ink-muted)",
          }}
        >
          {visual.description}
        </div>
      )}

      {/* Visual Canvas / Frame */}
      <div
        className="relative p-3 overflow-hidden flex items-center justify-center min-h-[220px]"
        style={{ backgroundColor: "var(--ms-surface)" }}
      >
        {isFailed ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
            <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm font-bold" style={{ color: "var(--ms-ink)" }}>
              Visual Execution Failed
            </p>
            <p className="text-xs mt-1 mb-3" style={{ color: "var(--ms-ink-muted)" }}>
              {visual.error_message || "The sandbox encountered an execution error while compiling this visual."}
            </p>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors"
                style={{
                  backgroundColor: "var(--ms-primary)",
                  color: "var(--ms-primary-ink)",
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Visual Generation
              </button>
            )}
          </div>
        ) : isMermaid ? (
          isRendering ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-2">
              <div
                className="h-6 w-6 border-2 border-t-transparent animate-spin rounded-full"
                style={{ borderColor: "var(--ms-primary)", borderTopColor: "transparent" }}
              />
              <span className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                Rendering interactive flowchart...
              </span>
            </div>
          ) : renderError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
              <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
              <p className="text-sm font-bold" style={{ color: "var(--ms-ink)" }}>
                Flowchart Syntax Error
              </p>
              <p className="text-xs mt-1 mb-3" style={{ color: "var(--ms-ink-muted)" }}>
                {renderError}
              </p>
              <div
                className="w-full overflow-x-auto p-3 rounded-xl border text-left"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                }}
              >
                <pre className="text-xs font-mono whitespace-pre" style={{ color: "var(--ms-ink)" }}>
                  {visual.script}
                </pre>
              </div>
            </div>
          ) : (
            <div
              className="overflow-auto max-h-[500px] w-full flex items-center justify-center p-4 [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto select-none"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out",
              }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )
        ) : (
          <div className="overflow-auto max-h-[460px] w-full flex items-center justify-center p-2">
            <img
              src={visual.visual_url || ""}
              alt={visual.title}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
                transition: "transform 0.15s ease-out",
                borderColor: "var(--ms-border)",
              }}
              className="max-w-full h-auto object-contain rounded-lg shadow-sm border-2 select-none"
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
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t-2 text-xs"
        style={{
          backgroundColor: "var(--ms-surface-alt)",
          borderColor: "var(--ms-border)",
        }}
      >
        <div className="text-[11px] italic" style={{ color: "var(--ms-ink-muted)" }}>
          Educational Illustration • Not diagnostic
        </div>
        <div className="flex items-center gap-2">
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border hover:opacity-80 transition-colors"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
          {!isFailed && (visual.visual_url || svgContent) && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold shadow-sm transition-colors hover:opacity-90"
              style={{
                backgroundColor: "var(--ms-primary)",
                color: "var(--ms-primary-ink)",
              }}
            >
              <Download className="h-3 w-3" />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
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
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors text-white"
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
            {isMermaid && svgContent ? (
              <div
                className="w-full h-full flex items-center justify-center p-6 bg-white rounded-xl shadow-2xl [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:h-auto [&_svg]:mx-auto"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            ) : (
              <img
                src={visual.visual_url || ""}
                alt={visual.title}
                className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-neutral-800"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
