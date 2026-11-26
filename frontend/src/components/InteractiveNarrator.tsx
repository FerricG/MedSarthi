"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import {
  MITHI_VOICE_OPTIONS,
  speakTextWithMithi,
  stopActiveMithiNarration,
} from "@/components/AudioPlayer";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import { type AudioSpeed } from "@/lib/api";

export type NarratorPose =
  | "greeting"
  | "scanning"
  | "explaining"
  | "listening"
  | "celebrating";

export interface InteractiveNarratorProps {
  message: string;
  pose?: NarratorPose;
  language?: SupportedLocale;
  autoSpeak?: boolean;
  speakerName?: string;
  voice?: string;
}

export function InteractiveNarrator({
  message,
  pose = "explaining",
  language,
  autoSpeak = true,
  speakerName = "Dr. Sarthi",
  voice = "charvi",
}: InteractiveNarratorProps) {
  const { prefs, setAudioSpeed } = useAccessibility();
  const { locale } = useI18n();
  const activeLang = language || locale;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(voice);
  const stopRef = useRef<(() => void) | null>(null);

  const stopSpeaking = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    stopActiveMithiNarration();
    setIsSpeaking(false);
  }, []);

  const speakNow = useCallback(
    (overrideSpeed?: AudioSpeed, overrideVoice?: string) => {
      if (muted || !message.trim()) return;
      stopSpeaking();
      setIsSpeaking(true);
      stopRef.current = speakTextWithMithi(
        message,
        activeLang,
        overrideSpeed ?? prefs.audioSpeed,
        overrideVoice ?? selectedVoice,
        () => {
          setIsSpeaking(false);
        }
      );
    },
    [activeLang, message, muted, prefs.audioSpeed, selectedVoice, stopSpeaking]
  );

  useEffect(() => {
    if (autoSpeak && !muted && message.trim()) {
      const timer = window.setTimeout(() => {
        speakNow();
      }, 150);
      return () => {
        window.clearTimeout(timer);
        stopSpeaking();
      };
    }
    return () => {
      stopSpeaking();
    };
  }, [autoSpeak, message, muted, speakNow, stopSpeaking]);

  const poseStatusLabel: Record<NarratorPose, string> = {
    greeting: "Welcoming you",
    scanning: "Reading your prescription",
    explaining: "Explaining clearly",
    listening: "Listening to you",
    celebrating: "Great job!",
  };

  return (
    <div
      className="ms-card p-4 sm:p-5"
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: isSpeaking ? "var(--ms-primary)" : "var(--ms-border)",
      }}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Interactive Animated Female Doctor SVG */}
        <button
          type="button"
          onClick={() => (isSpeaking ? stopSpeaking() : speakNow())}
          aria-label={isSpeaking ? `Pause ${speakerName}` : `Tap ${speakerName} to hear again`}
          title={isSpeaking ? "Tap to pause voice" : "Tap doctor to hear again"}
          className="group relative shrink-0 rounded-2xl border-2 p-2 transition-transform hover:scale-[1.02] focus:outline-none"
          style={{
            backgroundColor: "var(--ms-primary-soft)",
            borderColor: isSpeaking ? "var(--ms-primary)" : "var(--ms-border)",
          }}
        >
          <svg
            viewBox="0 0 180 190"
            className="h-36 w-36 sm:h-40 sm:w-40"
            role="img"
            aria-label={`${speakerName} animated female doctor avatar`}
          >
            <style>{`
              @keyframes msFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
              @keyframes msWave { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-16deg); } }
              @keyframes msTalk { 0%, 100% { ry: 2.5px; } 50% { ry: 6px; } }
              @keyframes msBlink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.12); } }
              @keyframes msPulse { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.06); } }
              .ms-doc-body { animation: msFloat 3.4s ease-in-out infinite; transform-origin: center; }
              .ms-doc-wave { animation: msWave 1.1s ease-in-out infinite; transform-origin: 136px 128px; }
              .ms-doc-eye { animation: msBlink 4.2s ease-in-out infinite; transform-origin: center; }
              .ms-doc-mouth-talk { animation: msTalk 0.28s ease-in-out infinite; }
              .ms-doc-ring { animation: msPulse 1.5s ease-in-out infinite; transform-origin: center; }
            `}</style>

            {/* Listening / Speaking Aura */}
            {(isSpeaking || pose === "listening") && (
              <circle
                cx="90"
                cy="95"
                r="82"
                fill="none"
                stroke={pose === "listening" ? "#d97706" : "#0f766e"}
                strokeWidth="3"
                strokeDasharray="8 6"
                className="ms-doc-ring"
              />
            )}

            <g className="ms-doc-body">
              {/* Hair Bun + Back Hair (Female Doctor) */}
              <circle cx="90" cy="30" r="17" fill="#2c1e1a" />
              <path
                d="M54 68 C54 34, 126 34, 126 68 L128 98 C120 105, 60 105, 52 98 Z"
                fill="#2c1e1a"
              />

              {/* White Doctor Coat + Teal Scrubs */}
              <path
                d="M42 182 C44 134, 62 122, 90 122 C118 122, 136 134, 138 182 Z"
                fill="#ffffff"
                stroke="#0f766e"
                strokeWidth="2.5"
              />
              {/* Inner Teal Top */}
              <path d="M74 122 L90 156 L106 122 Z" fill="#0f766e" />
              {/* Coat Lapels */}
              <path d="M74 122 L62 150 L78 158 Z" fill="#e6f4f1" stroke="#0f766e" strokeWidth="1.5" />
              <path d="M106 122 L118 150 L102 158 Z" fill="#e6f4f1" stroke="#0f766e" strokeWidth="1.5" />

              {/* Stethoscope */}
              <path
                d="M68 126 C62 148, 72 164, 90 164 C108 164, 118 148, 112 126"
                fill="none"
                stroke="#1e293b"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle cx="90" cy="166" r="6" fill="#94a3b8" stroke="#1e293b" strokeWidth="2" />

              {/* Neck */}
              <rect x="81" y="106" width="18" height="20" rx="8" fill="#e7b490" />

              {/* Face */}
              <ellipse cx="90" cy="76" rx="28" ry="33" fill="#f1c29b" />
              {/* Hair Bangs */}
              <path
                d="M62 66 C66 44, 114 44, 118 66 C106 54, 74 54, 62 66 Z"
                fill="#2c1e1a"
              />
              {/* Bindi */}
              <circle cx="90" cy="64" r="2.2" fill="#b91c1c" />

              {/* Eyes */}
              <g className="ms-doc-eye">
                <ellipse cx="78" cy="75" rx="3.4" ry="4" fill="#1e293b" />
                <ellipse cx="102" cy="75" rx="3.4" ry="4" fill="#1e293b" />
                <circle cx="79" cy="73.5" r="1.1" fill="#ffffff" />
                <circle cx="103" cy="73.5" r="1.1" fill="#ffffff" />
              </g>

              {/* Warm Eyebrows */}
              <path d="M72 67 Q78 64 84 67" fill="none" stroke="#2c1e1a" strokeWidth="2" strokeLinecap="round" />
              <path d="M96 67 Q102 64 108 67" fill="none" stroke="#2c1e1a" strokeWidth="2" strokeLinecap="round" />

              {/* Rosy Cheeks */}
              <ellipse cx="70" cy="84" rx="4.5" ry="2.5" fill="#f43f5e" opacity="0.22" />
              <ellipse cx="110" cy="84" rx="4.5" ry="2.5" fill="#f43f5e" opacity="0.22" />

              {/* Mouth: Animated Speaking vs Warm Smile */}
              {isSpeaking ? (
                <ellipse
                  cx="90"
                  cy="92"
                  rx="6.5"
                  ry="4"
                  fill="#991b1b"
                  className="ms-doc-mouth-talk"
                />
              ) : (
                <path
                  d="M81 90 Q90 98 99 90"
                  fill="none"
                  stroke="#991b1b"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
              )}

              {/* Pose-Specific Hands / Props */}
              {pose === "greeting" && (
                <g className="ms-doc-wave">
                  <path
                    d="M132 140 L152 106"
                    stroke="#ffffff"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  <circle cx="154" cy="102" r="8" fill="#f1c29b" />
                </g>
              )}

              {pose === "scanning" && (
                <g>
                  <rect x="26" y="132" width="34" height="42" rx="4" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                  <line x1="32" y1="142" x2="54" y2="142" stroke="#b45309" strokeWidth="2" />
                  <line x1="32" y1="150" x2="52" y2="150" stroke="#b45309" strokeWidth="2" />
                  <line x1="32" y1="158" x2="48" y2="158" stroke="#b45309" strokeWidth="2" />
                </g>
              )}

              {pose === "explaining" && (
                <g className="ms-doc-wave">
                  <path
                    d="M130 144 L148 124"
                    stroke="#ffffff"
                    strokeWidth="11"
                    strokeLinecap="round"
                  />
                  <circle cx="150" cy="122" r="7.5" fill="#f1c29b" />
                </g>
              )}

              {pose === "listening" && (
                <g>
                  <circle cx="144" cy="82" r="14" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                  <path d="M140 76 L140 88 M145 73 L145 91 M150 78 L150 86" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round" />
                </g>
              )}

              {pose === "celebrating" && (
                <g className="ms-doc-wave">
                  <path
                    d="M132 142 L150 112"
                    stroke="#ffffff"
                    strokeWidth="11"
                    strokeLinecap="round"
                  />
                  <circle cx="152" cy="109" r="7.5" fill="#f1c29b" />
                  <text x="148" y="88" fontSize="18">★</text>
                </g>
              )}
            </g>
          </svg>

          <span
            className="mt-1 block rounded-full px-2.5 py-0.5 text-center text-xs font-extrabold"
            style={{
              backgroundColor: "var(--ms-surface)",
              color: "var(--ms-primary)",
            }}
          >
            {speakerName} • {isSpeaking ? "Speaking..." : poseStatusLabel[pose]}
          </span>
        </button>

        {/* Speech Bubble + Audio Controls */}
        <div className="flex-1 space-y-3">
          <div
            className="rounded-2xl border-2 p-4 text-base font-bold leading-relaxed sm:text-lg"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          >
            {message}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (isSpeaking ? stopSpeaking() : speakNow())}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              {isSpeaking ? (
                <>
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  <span>Pause Voice</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>Hear {speakerName}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => speakNow()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-sm"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Replay</span>
            </button>

            {/* Voice Dropdown */}
            <select
              aria-label="Narrator voice"
              value={selectedVoice}
              onChange={(e) => {
                const nextV = e.target.value;
                setSelectedVoice(nextV);
                if (isSpeaking) speakNow(prefs.audioSpeed, nextV);
              }}
              className="tap-target rounded-xl border-2 px-2.5 py-1.5 text-xs font-bold"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              <optgroup label="Female Doctor Voices">
                {MITHI_VOICE_OPTIONS.filter((v) => v.gender === "female").map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Male Doctor Voices">
                {MITHI_VOICE_OPTIONS.filter((v) => v.gender === "male").map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              type="button"
              onClick={() => {
                const nextSpeed: AudioSpeed = prefs.audioSpeed <= 0.85 ? 1.0 : 0.85;
                setAudioSpeed(nextSpeed);
                speakNow(nextSpeed);
              }}
              className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-sm"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              <span>{prefs.audioSpeed <= 0.85 ? "Normal Speed (1.0x)" : "Slower (0.85x)"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!muted) stopSpeaking();
                setMuted((m) => !m);
              }}
              aria-pressed={muted}
              className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-sm"
            >
              {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
