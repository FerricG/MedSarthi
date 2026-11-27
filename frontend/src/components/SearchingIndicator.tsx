"use client";

import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";

interface SearchingIndicatorProps {
  label?: string;
  sublabel?: string;
  compact?: boolean;
  className?: string;
}

export function SearchingIndicator({
  label = "Searching results",
  sublabel,
  compact = false,
  className = "",
}: SearchingIndicatorProps) {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((prev) => {
        if (prev === ".") return "..";
        if (prev === "..") return "...";
        if (prev === "...") return "";
        return ".";
      });
    }, 400);

    return () => clearInterval(timer);
  }, []);

  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-1.5 font-bold text-xs select-none ${className}`}
      >
        <Search
          className="h-3.5 w-3.5 animate-spin shrink-0"
          style={{ animationDuration: "2.5s" }}
          aria-hidden="true"
        />
        <span>{label}</span>
        <span
          className="inline-block w-4 text-left font-mono font-black"
          aria-hidden="true"
        >
          {dots}
        </span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-xs font-bold transition-all shadow-xs select-none animate-in fade-in duration-200 ${className}`}
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
        color: "var(--ms-ink)",
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl shadow-xs"
        style={{
          backgroundColor: "var(--ms-primary-soft)",
          color: "var(--ms-primary)",
        }}
      >
        <Search
          className="h-4 w-4 animate-spin"
          style={{ animationDuration: "3s" }}
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center">
          <span className="font-extrabold">{label}</span>
          <span
            className="inline-block w-5 text-left font-mono font-black text-sm tracking-wider pl-0.5"
            style={{ color: "var(--ms-primary)" }}
            aria-hidden="true"
          >
            {dots}
          </span>
        </div>
        {sublabel && (
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--ms-ink-muted)" }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
