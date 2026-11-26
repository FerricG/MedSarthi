"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square, Volume2, User, UserCheck } from "lucide-react";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import {
  api,
  fetchAuthenticatedBlobUrl,
  type AudioSpeed,
  type TtsCue,
} from "@/lib/api";

const SPEED_OPTIONS: AudioSpeed[] = [0.75, 0.85, 1.0, 1.15, 1.25];

export const MITHI_VOICE_OPTIONS = [
  { id: "charvi", label: "Charvi (Female - Doctor Default)", gender: "female" },
  { id: "vaidehi", label: "Vaidehi (Female - Calm)", gender: "female" },
  { id: "ahana", label: "Ahana (Female - Clear)", gender: "female" },
  { id: "malini", label: "Malini (Female - Gentle)", gender: "female" },
  { id: "jahnavi", label: "Jahnavi (Female - Expressive)", gender: "female" },
  { id: "satvik", label: "Satvik (Male - Doctor Default)", gender: "male" },
  { id: "anirban", label: "Anirban (Male - Calm)", gender: "male" },
  { id: "nakul", label: "Nakul (Male - Clear)", gender: "male" },
  { id: "vasant", label: "Vasant (Male - Friendly)", gender: "male" },
  { id: "siddhant", label: "Siddhant (Male - Deep)", gender: "male" },
];

export function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}

export function getSpeechLangTag(locale: SupportedLocale): string {
  const map: Record<SupportedLocale, string> = {
    en: "en-IN",
    hi: "hi-IN",
    "hi-Latn": "hi-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    ta: "ta-IN",
    te: "te-IN",
    gu: "gu-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    pa: "pa-IN",
  };
  return map[locale] || "en-IN";
}

let activeGlobalStop: (() => void) | null = null;
let globalSpeechSeq = 0;

export function stopActiveMithiNarration(): void {
  globalSpeechSeq += 1;
  activeGlobalStop?.();
  activeGlobalStop = null;
}

// Backward compatibility alias
export const stopActivePiperNarration = stopActiveMithiNarration;

/**
 * Stream Mithi v2 Flash TTS WAV audio from /api/speech/tts with global overlap prevention.
 */
export function speakTextWithMithi(
  text: string,
  locale: SupportedLocale = "en",
  speed: AudioSpeed = 1.0,
  voicePreference: string = "charvi",
  onEnd?: () => void,
  onError?: (msg: string) => void
): () => void {
  const cleaned = text.trim();
  if (!cleaned) {
    onEnd?.();
    return () => {};
  }

  stopActiveMithiNarration();
  const mySeq = ++globalSpeechSeq;

  let cancelled = false;
  let audioEl: HTMLAudioElement | null = null;
  let blobUrl: string | null = null;

  const stop = () => {
    cancelled = true;
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl = null;
    }
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  };

  activeGlobalStop = stop;

  void (async () => {
    try {
      const res = await api.textToSpeech({
        text: cleaned,
        language: locale,
        voice_preference: voicePreference,
        audio_speed: speed,
      });
      if (cancelled || globalSpeechSeq !== mySeq || !res.stream_url) {
        onEnd?.();
        return;
      }
      const url = await fetchAuthenticatedBlobUrl(res.stream_url);
      if (cancelled || globalSpeechSeq !== mySeq) {
        URL.revokeObjectURL(url);
        onEnd?.();
        return;
      }
      blobUrl = url;
      const audio = new Audio(url);
      audioEl = audio;
      audio.onended = () => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
        }
        if (activeGlobalStop === stop) activeGlobalStop = null;
        onEnd?.();
      };
      audio.onerror = () => {
        stop();
        onError?.("Audio playback failed.");
        onEnd?.();
      };
      await audio.play();
    } catch (err) {
      stop();
      onError?.(err instanceof Error ? err.message : "Mithi v2 Flash TTS failed.");
      onEnd?.();
    }
  })();

  return () => {
    stop();
    if (activeGlobalStop === stop) activeGlobalStop = null;
  };
}

// Backward compatibility alias
export function speakTextWithPiper(
  text: string,
  locale: SupportedLocale = "en",
  speed: AudioSpeed = 1.0,
  onEnd?: () => void,
  onError?: (msg: string) => void
): () => void {
  return speakTextWithMithi(text, locale, speed, "charvi", onEnd, onError);
}

export interface AudioPlayerProps {
  text: string;
  sentences?: string[];
  language?: SupportedLocale;
  explanationId?: string;
  messageId?: string;
  label?: string;
  compact?: boolean;
  showTranscriptLines?: boolean;
  defaultVoice?: string;
  onActiveSentenceChange?: (index: number | null) => void;
}

type PlaybackStatus = "idle" | "loading" | "playing" | "paused";

export function AudioPlayer({
  text,
  sentences: customSentences,
  language,
  explanationId,
  messageId,
  label,
  compact = false,
  showTranscriptLines = true,
  defaultVoice = "charvi",
  onActiveSentenceChange,
}: AudioPlayerProps) {
  const { t, locale, formatMessage } = useI18n();
  const { prefs, setAudioSpeed } = useAccessibility();
  const effectiveLang = language ?? locale;

  const sentences = useMemo(
    () => (customSentences && customSentences.length > 0 ? customSentences : splitIntoSentences(text)),
    [customSentences, text]
  );

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [speed, setSpeed] = useState<AudioSpeed>(prefs.audioSpeed);
  const [voice, setVoice] = useState<string>(defaultVoice);
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const cuesRef = useRef<TtsCue[]>([]);
  const speechTokenRef = useRef(0);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setSpeed(prefs.audioSpeed);
  }, [prefs.audioSpeed]);

  useEffect(() => {
    onActiveSentenceChange?.(activeSentenceIdx);
    if (activeSentenceIdx !== null && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeSentenceIdx, onActiveSentenceChange]);

  const cleanupPlayback = useCallback(() => {
    speechTokenRef.current += 1;
    stopActiveMithiNarration();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
      audioElRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupPlayback();
    };
  }, [cleanupPlayback]);

  // Stop if text changes underneath player
  useEffect(() => {
    cleanupPlayback();
    setStatus("idle");
    setActiveSentenceIdx(null);
  }, [text, effectiveLang, cleanupPlayback]);

  const startPlayback = useCallback(
    async (startIdx = 0, targetSpeed: AudioSpeed = speed, targetVoice: string = voice) => {
      if (!text.trim()) return;
      const myToken = ++speechTokenRef.current;
      cleanupPlayback();
      speechTokenRef.current = myToken;
      setStatus("loading");
      setErrorMsg(null);

      try {
        const res = await api.textToSpeech({
          text,
          language: effectiveLang,
          voice_preference: targetVoice,
          audio_speed: targetSpeed,
          explanation_id: explanationId,
          message_id: messageId,
        });

        if (speechTokenRef.current !== myToken) return;
        cuesRef.current = res.cues || [];
        if (!res.stream_url) {
          throw new Error("Mithi v2 Flash stream URL missing.");
        }

        const blobUrl = await fetchAuthenticatedBlobUrl(res.stream_url);
        if (speechTokenRef.current !== myToken) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        blobUrlRef.current = blobUrl;
        const audio = new Audio(blobUrl);
        audio.playbackRate = 1.0;
        audioElRef.current = audio;

        if (startIdx > 0 && cuesRef.current[startIdx]) {
          audio.currentTime = cuesRef.current[startIdx].start_ms / 1000;
        }

        audio.ontimeupdate = () => {
          const ms = audio.currentTime * 1000;
          const cues = cuesRef.current;
          if (cues.length > 0) {
            const found = cues.findIndex((c) => ms >= c.start_ms && ms <= c.end_ms);
            if (found >= 0) setActiveSentenceIdx(found);
          }
        };
        audio.onended = () => {
          setStatus("idle");
          setActiveSentenceIdx(null);
        };
        audio.onerror = () => {
          setStatus("idle");
          setActiveSentenceIdx(null);
          setErrorMsg("Unable to play Mithi TTS audio.");
        };

        await audio.play();
        setStatus("playing");
        setActiveSentenceIdx(startIdx);
      } catch (err) {
        setStatus("idle");
        setActiveSentenceIdx(null);
        setErrorMsg(err instanceof Error ? err.message : "Mithi v2 Flash failed to generate speech.");
      }
    },
    [text, speed, voice, cleanupPlayback, effectiveLang, explanationId, messageId]
  );

  const handlePause = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      setStatus("paused");
    }
  };

  const handleResume = () => {
    if (audioElRef.current) {
      void audioElRef.current.play();
      setStatus("playing");
    }
  };

  const handleStop = () => {
    cleanupPlayback();
    setStatus("idle");
    setActiveSentenceIdx(null);
  };

  const handleReplay = () => {
    void startPlayback(0, speed, voice);
  };

  const handleSpeedSelect = (nextSpeed: AudioSpeed) => {
    setSpeed(nextSpeed);
    setAudioSpeed(nextSpeed);
    if (status === "playing") {
      void startPlayback(activeSentenceIdx ?? 0, nextSpeed, voice);
    }
  };

  const handleVoiceSelect = (nextVoice: string) => {
    setVoice(nextVoice);
    if (status === "playing") {
      void startPlayback(activeSentenceIdx ?? 0, speed, nextVoice);
    }
  };

  return (
    <div
      className={`rounded-2xl border-2 ${compact ? "p-3" : "p-4"} space-y-3`}
      style={{
        backgroundColor: "var(--ms-surface)",
        borderColor: "var(--ms-border)",
      }}
      role="region"
      aria-label={label || t.audio.listen}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {status === "idle" || status === "loading" ? (
            <button
              type="button"
              disabled={status === "loading" || sentences.length === 0}
              onClick={() => void startPlayback(0, speed, voice)}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
              <span>{status === "loading" ? t.audio.generating : label || t.audio.listen}</span>
            </button>
          ) : status === "playing" ? (
            <button
              type="button"
              onClick={handlePause}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <Pause className="h-5 w-5" aria-hidden="true" />
              <span>{t.audio.pause}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResume}
              className="ms-btn-primary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <Play className="h-5 w-5" aria-hidden="true" />
              <span>{t.audio.resume}</span>
            </button>
          )}

          {(status === "playing" || status === "paused") && (
            <>
              <button
                type="button"
                onClick={handleStop}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-sm"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                <span>{t.audio.stop}</span>
              </button>
              <button
                type="button"
                onClick={handleReplay}
                className="ms-btn-secondary tap-target inline-flex items-center gap-1.5 px-3 text-sm"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>{t.audio.replay}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Voice Selector */}
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4" style={{ color: "var(--ms-ink-muted)" }} aria-hidden="true" />
            <select
              aria-label="Voice model"
              value={voice}
              onChange={(e) => handleVoiceSelect(e.target.value)}
              className="tap-target rounded-lg border px-2 py-1 text-xs font-bold"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink)",
              }}
            >
              <optgroup label="Female Voices">
                {MITHI_VOICE_OPTIONS.filter((v) => v.gender === "female").map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Male Voices">
                {MITHI_VOICE_OPTIONS.filter((v) => v.gender === "male").map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Speed Selector (0.75x - 1.25x) */}
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t.audio.speed}>
            <span className="mr-1 text-xs font-bold" style={{ color: "var(--ms-ink-muted)" }}>
              {t.audio.speed}:
            </span>
            {SPEED_OPTIONS.map((opt) => {
              const active = speed === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSpeedSelect(opt)}
                  aria-pressed={active}
                  className="tap-target rounded-lg border-2 px-2.5 py-1 text-xs font-extrabold"
                  style={{
                    backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                    color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                  }}
                >
                  {opt}x
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Status & Error Info */}
      {errorMsg && (
        <p role="alert" className="text-xs font-bold" style={{ color: "var(--ms-danger-ink)" }}>
          {errorMsg}
        </p>
      )}

      {activeSentenceIdx !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold" aria-live="polite">
          <span style={{ color: "var(--ms-primary)" }}>
            {formatMessage(t.audio.sentenceProgress, {
              current: activeSentenceIdx + 1,
              total: sentences.length,
            })}
          </span>
          <span style={{ color: "var(--ms-ink-muted)" }}>Mithi v2 Flash (RTX 3050 GPU)</span>
        </div>
      )}

      {/* Synchronized Highlightable Sentences */}
      {showTranscriptLines && sentences.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {sentences.map((line, idx) => {
            const isCurrent = activeSentenceIdx === idx;
            return (
              <button
                key={idx}
                ref={isCurrent ? activeLineRef : undefined}
                type="button"
                onClick={() => void startPlayback(idx, speed, voice)}
                aria-current={isCurrent ? "true" : undefined}
                className="block w-full rounded-xl border-2 px-3 py-2 text-left text-sm leading-relaxed transition-colors"
                style={{
                  backgroundColor: isCurrent ? "var(--ms-primary-soft)" : "var(--ms-surface-alt)",
                  borderColor: isCurrent ? "var(--ms-primary)" : "transparent",
                  color: "var(--ms-ink)",
                  fontWeight: isCurrent ? 700 : 500,
                }}
              >
                {line}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
