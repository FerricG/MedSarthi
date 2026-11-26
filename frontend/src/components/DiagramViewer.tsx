"use client";

import React, { useEffect, useState } from "react";
import { Eye, Image as ImageIcon } from "lucide-react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import { api, type CuratedDiagram } from "@/lib/api";

const LOCAL_DIAGRAM_FALLBACKS: Record<
  string,
  Record<SupportedLocale, Omit<CuratedDiagram, "id" | "svg_path">>
> = {
  respiratory_airways: {
    en: {
      title: "How Air Moves Through Your Airways",
      description:
        "Shows the nose, upper throat, windpipe, and lungs so you can see where upper airway colds differ from deeper lung infections.",
      callouts: [
        { key: "nose_throat", label: "Nose & Upper Throat (Upper Airway)", depth: "very_simple" },
        { key: "windpipe", label: "Windpipe (Trachea)", depth: "very_simple" },
        { key: "bronchi", label: "Air Tubes (Bronchi)", depth: "detailed" },
        { key: "lungs", label: "Lungs (Air Sacs / Alveoli)", depth: "very_simple" },
      ],
    },
    hi: {
      title: "हवा आपकी श्वास नली से कैसे जाती है",
      description:
        "यह चित्र नाक, ऊपरी गला, श्वास नली और फेफड़ों को दिखाता है ताकि आप समझ सकें कि सामान्य जुकाम और फेफड़ों के संक्रमण में क्या अंतर है।",
      callouts: [
        { key: "nose_throat", label: "नाक और ऊपरी गला", depth: "very_simple" },
        { key: "windpipe", label: "श्वास नली (ट्रेकिया)", depth: "very_simple" },
        { key: "bronchi", label: "वायु नलिकाएं (ब्रॉन्काई)", depth: "detailed" },
        { key: "lungs", label: "फेफड़े (हवा की थैलियां)", depth: "very_simple" },
      ],
    },
    "hi-Latn": {
      title: "Hawa aapki saans ki nali se kaise jaati hai",
      description:
        "Yeh chitra naak, oopari gala, saans ki nali aur phephdon ko dikhata hai taaki aap samajh sakein ki normal zukam aur lung infection mein kya farq hai.",
      callouts: [
        { key: "nose_throat", label: "Naak aur Oopari Gala (Upper Airway)", depth: "very_simple" },
        { key: "windpipe", label: "Saans ki Nali (Windpipe)", depth: "very_simple" },
        { key: "bronchi", label: "Hawa ki Chhoti Naliyan (Bronchi)", depth: "detailed" },
        { key: "lungs", label: "Phephde (Lungs)", depth: "very_simple" },
      ],
    },
  },
  digestive_med_pathway: {
    en: {
      title: "How Oral Medicines Travel Through Your Body",
      description:
        "Illustrates how a swallowed tablet passes from the mouth and food pipe into the stomach and small intestine before entering the bloodstream.",
      callouts: [
        { key: "food_pipe", label: "Food Pipe (Esophagus) — Take with water", depth: "very_simple" },
        { key: "stomach", label: "Stomach — Food timing affects comfort", depth: "very_simple" },
        { key: "small_intestine", label: "Small Intestine — Medicine absorbed here", depth: "detailed" },
        { key: "bloodstream", label: "Bloodstream — Carries medicine where needed", depth: "very_simple" },
      ],
    },
    hi: {
      title: "खाने की दवा शरीर में कैसे काम करती है",
      description:
        "यह दिखाता है कि निगली गई गोली मुंह और भोजन नली से होकर पेट और छोटी आंत में जाती है और फिर खून में मिलती है।",
      callouts: [
        { key: "food_pipe", label: "भोजन नली — पानी के साथ निगलें", depth: "very_simple" },
        { key: "stomach", label: "पेट — खाने से पहले या बाद का समय मायने रखता है", depth: "very_simple" },
        { key: "small_intestine", label: "छोटी आंत — दवा यहाँ शरीर में सोखी जाती है", depth: "detailed" },
        { key: "bloodstream", label: "रक्त प्रवाह — दवा को शरीर के हिस्सों तक पहुँचाता है", depth: "very_simple" },
      ],
    },
    "hi-Latn": {
      title: "Khaane ki dawa shareer mein kaise kaam karti hai",
      description:
        "Yeh dikhata hai ki nigli gayi goli munh aur food pipe se hokar pet aur chhoti aant mein jaati hai aur phir khoon mein milti hai.",
      callouts: [
        { key: "food_pipe", label: "Food Pipe — Paani ke saath lein", depth: "very_simple" },
        { key: "stomach", label: "Pet (Stomach) — Khaane ke pehle ya baad ka time zaroori hai", depth: "very_simple" },
        { key: "small_intestine", label: "Chhoti Aant — Dawa yahan absorb hoti hai", depth: "detailed" },
        { key: "bloodstream", label: "Khoon ka Bahav — Dawa ko zaroori jagah pahunchata hai", depth: "very_simple" },
      ],
    },
  },
  heart_circulation_bp: {
    en: {
      title: "How Your Heart Pumps Blood & Blood Pressure",
      description:
        "Shows the heart pumping blood through arteries and veins, explaining what systolic (top) and diastolic (bottom) blood pressure numbers represent.",
      callouts: [
        { key: "heart_pump", label: "Heart — Pumps blood steadily", depth: "very_simple" },
        { key: "arteries", label: "Arteries — Carry blood outward (BP measured here)", depth: "very_simple" },
        { key: "bp_numbers", label: "Top (Systolic) / Bottom (Diastolic) Pressure", depth: "detailed" },
        { key: "veins", label: "Veins — Return blood to the heart", depth: "detailed" },
      ],
    },
    hi: {
      title: "दिल खून कैसे पंप करता है और ब्लड प्रेशर क्या है",
      description:
        "यह दिखाता है कि दिल धमनियों के जरिए खून कैसे पंप करता है और ऊपर व नीचे के ब्लड प्रेशर नंबर का क्या मतलब है।",
      callouts: [
        { key: "heart_pump", label: "दिल — शरीर में लगातार खून पंप करता है", depth: "very_simple" },
        { key: "arteries", label: "धमनियाँ — दिल से खून बाहर ले जाती हैं", depth: "very_simple" },
        { key: "bp_numbers", label: "ऊपर का दबाव (सिस्टोलिक) / नीचे का दबाव (डायस्टोलिक)", depth: "detailed" },
        { key: "veins", label: "शिराएँ — खून को वापस दिल तक लाती हैं", depth: "detailed" },
      ],
    },
    "hi-Latn": {
      title: "Dil khoon kaise pump karta hai aur blood pressure kya hai",
      description:
        "Yeh dikhata hai ki dil khoon ki naliyon se khoon kaise pump karta hai aur upar aur neeche ke BP numbers ka kya matlab hai.",
      callouts: [
        { key: "heart_pump", label: "Dil (Heart) — Lagatar khoon pump karta hai", depth: "very_simple" },
        { key: "arteries", label: "Arteries — Dil se khoon baahar le jaati hain", depth: "very_simple" },
        { key: "bp_numbers", label: "Upar ka BP (Systolic) / Neeche ka BP (Diastolic)", depth: "detailed" },
        { key: "veins", label: "Veins — Khoon ko wapas dil mein laati hain", depth: "detailed" },
      ],
    },
  },
};

export interface DiagramViewerProps {
  diagramId: string;
  diagram?: CuratedDiagram | null;
  language?: SupportedLocale;
  compact?: boolean;
}

export function DiagramViewer({
  diagramId,
  diagram: initialDiagram,
  language,
  compact = false,
}: DiagramViewerProps) {
  const { locale } = useI18n();
  const { prefs } = useAccessibility();
  const effectiveLang = language ?? locale;

  const [fetched, setFetched] = useState<CuratedDiagram | null>(initialDiagram ?? null);
  const [showDetailedCallouts, setShowDetailedCallouts] = useState(
    prefs.explanationDepth === "detailed" || prefs.explanationDepth === "deep_dive"
  );

  useEffect(() => {
    if (initialDiagram) {
      setFetched(initialDiagram);
      return;
    }
    let active = true;
    api
      .getDiagrams(diagramId, effectiveLang)
      .then((list) => {
        if (active && Array.isArray(list) && list.length > 0) {
          setFetched(list[0]);
        }
      })
      .catch(() => {
        // Local fallback metadata handles offline or unauthenticated views seamlessly
      });
    return () => {
      active = false;
    };
  }, [diagramId, effectiveLang, initialDiagram]);

  const fallbackLocale =
    LOCAL_DIAGRAM_FALLBACKS[diagramId]?.[effectiveLang] ??
    LOCAL_DIAGRAM_FALLBACKS[diagramId]?.en;

  const resolved: CuratedDiagram | null = fetched
    ? fetched
    : fallbackLocale
      ? {
          id: diagramId,
          svg_path: `/diagrams/${diagramId}.svg`,
          ...fallbackLocale,
        }
      : null;

  if (!resolved) return null;

  const visibleCallouts = showDetailedCallouts
    ? resolved.callouts
    : resolved.callouts.filter((c) => c.depth === "very_simple");

  const svgSrc = resolved.svg_path.startsWith("/")
    ? resolved.svg_path
    : `/diagrams/${diagramId}.svg`;

  return (
    <section
      className={`ms-card ${compact ? "p-3.5" : "p-5"} space-y-4`}
      aria-label={resolved.title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <ImageIcon className="h-5 w-5 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <h3 className="text-lg font-extrabold">{resolved.title}</h3>
        </div>
        <span
          className="rounded-full border px-3 py-0.5 text-xs font-bold"
          style={{
            backgroundColor: "var(--ms-primary-soft)",
            borderColor: "var(--ms-primary)",
            color: "var(--ms-ink)",
          }}
        >
          Verified Educational Picture
        </span>
      </div>

      <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
        {resolved.description}
      </p>

      <div
        className="overflow-hidden rounded-xl border-2 p-2"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "var(--ms-border)",
        }}
      >
        {/* Curated verified static SVG */}
        <img
          src={svgSrc}
          alt={`${resolved.title}: ${resolved.description}`}
          className="mx-auto max-h-96 w-full object-contain"
        />
      </div>

      {resolved.callouts && resolved.callouts.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold">Key Parts Shown:</h4>
            {resolved.callouts.some((c) => c.depth !== "very_simple") && (
              <button
                type="button"
                onClick={() => setShowDetailedCallouts((v) => !v)}
                className="tap-target inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold"
                style={{ borderColor: "var(--ms-border)" }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showDetailedCallouts ? "Show simple labels" : "Show detailed labels"}</span>
              </button>
            )}
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {visibleCallouts.map((c) => (
              <li
                key={c.key}
                className="rounded-xl border p-2.5 text-sm font-semibold"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                }}
              >
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <AudioPlayer
          text={`${resolved.title}. ${resolved.description} ${visibleCallouts.map((c) => c.label).join(". ")}`}
          language={effectiveLang}
          label="Listen to picture description"
          compact
          showTranscriptLines={false}
        />
      )}

      <p className="text-xs font-medium" style={{ color: "var(--ms-ink-muted)" }}>
        {resolved.disclaimer ||
          "Educational anatomical illustration for understanding only — not diagnostic medical imagery."}
      </p>
    </section>
  );
}
