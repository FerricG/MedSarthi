"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Globe, HeartHandshake, Sparkles, Volume2 } from "lucide-react";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";

export default function PatientModeSelectorPage() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const { setLanguage } = useAccessibility();
  const { user, patientProfile } = useAuth();
  const [navigating, setNavigating] = useState<"guided" | "detailed" | null>(null);

  const MODE_COPY: Record<
    SupportedLocale,
    {
      badge: string;
      heading: string;
      sub: string;
      step1: string;
      step2: string;
      guidedBadge: string;
      guidedTitle: string;
      guidedDesc: string;
      guidedStart: string;
      detailedBadge: string;
      detailedTitle: string;
      detailedDesc: string;
      detailedStart: string;
    }
  > = {
    en: {
      badge: "Patient Welcome",
      heading: "Choose your language & how you want help today",
      sub: "No account is required to start. Pick your preferred language below, then choose either our friendly voice-guided cards or the full reading workspace.",
      step1: "1. Which language do you prefer?",
      step2: "2. How would you like to use MedSarthi?",
      guidedBadge: "Voice + Picture Cards",
      guidedTitle: "Simple Guided Helper",
      guidedDesc: "Best if medical words are hard to read or you prefer listening. Our friendly doctor narrator guides you one card at a time.",
      guidedStart: "Start Guided Helper",
      detailedBadge: "Full Reading Workspace",
      detailedTitle: "Detailed Patient Dashboard",
      detailedDesc: "Best if you are comfortable reading medical details yourself. Access all 6 patient tools directly.",
      detailedStart: "Open Detailed Dashboard",
    },
    hi: {
      badge: "रोगी स्वागत",
      heading: "अपनी भाषा चुनें और बताएं कि आज आप कैसे मदद चाहते हैं",
      sub: "शुरू करने के लिए किसी खाते की आवश्यकता नहीं है। नीचे अपनी भाषा चुनें, फिर सरल आवाज़-आधारित कार्ड या विस्तृत डैशबोर्ड चुनें।",
      step1: "1. आप कौन सी भाषा पसंद करते हैं?",
      step2: "2. आप MedSarthi का उपयोग कैसे करना चाहेंगे?",
      guidedBadge: "आवाज़ + चित्र कार्ड",
      guidedTitle: "सरल गाइडेड हेल्पर",
      guidedDesc: "यदि मेडिकल शब्द पढ़ना कठिन है या आप सुनकर समझना पसंद करते हैं। हमारी डॉक्टर नैरेटर हर कदम पर आपका मार्गदर्शन करेंगी।",
      guidedStart: "गाइडेड हेल्पर शुरू करें",
      detailedBadge: "पूर्ण रीडिंग डैशबोर्ड",
      detailedTitle: "विस्तृत रोगी डैशबोर्ड",
      detailedDesc: "यदि आप स्वयं मेडिकल जानकारी पढ़ने में सहज हैं। सभी 6 रोगी टूल्स सीधे खोलें।",
      detailedStart: "विस्तृत डैशबोर्ड खोलें",
    },
    "hi-Latn": {
      badge: "Patient Welcome",
      heading: "Apni bhasha chunein aur batayein aaj kaise madad chahiye",
      sub: "Shuru karne ke liye account zaroori nahi hai. Neeche apni bhasha chunein, phir voice-guided cards ya detailed dashboard chunein.",
      step1: "1. Aap kaun si bhasha pasand karte hain?",
      step2: "2. Aap MedSarthi kaise use karna chahenge?",
      guidedBadge: "Voice + Picture Cards",
      guidedTitle: "Simple Guided Helper",
      guidedDesc: "Agar medical words padhna mushkil hai ya aap sunkar samajhna pasand karte hain. Hamari doctor narrator har step samjhayengi.",
      guidedStart: "Guided Helper Shuru Karein",
      detailedBadge: "Full Reading Workspace",
      detailedTitle: "Detailed Patient Dashboard",
      detailedDesc: "Agar aap khud medical details padhne mein comfortable hain. Sabhi 6 tools seedhe kholein.",
      detailedStart: "Detailed Dashboard Kholein",
    },
    bn: {
      badge: "রোগীর স্বাগতম",
      heading: "আপনার ভাষা বেছে নিন এবং কীভাবে সাহায্য চান তা নির্বাচন করুন",
      sub: "শুরু করতে কোনো অ্যাকাউন্টের প্রয়োজন নেই। নিচে আপনার ভাষা নির্বাচন করুন।",
      step1: "১. আপনি কোন ভাষা পছন্দ করেন?",
      step2: "২. আপনি কীভাবে MedSarthi ব্যবহার করতে চান?",
      guidedBadge: "ভয়েস + ছবি কার্ড",
      guidedTitle: "সহজ গাইডেড হেল্পার",
      guidedDesc: "ডাক্তারদের কথা সহজভাবে শুনে এবং ছবি দেখে বুঝতে এটি সেরা।",
      guidedStart: "গাইডেড হেল্পার শুরু করুন",
      detailedBadge: "সম্পূর্ণ ড্যাশবোর্ড",
      detailedTitle: "বিস্তারিত রোগীর ড্যাশবোর্ড",
      detailedDesc: "নিজেই সব মেডিকেল রিপোর্ট ও ওষুধের তালিকা দেখতে এটি ব্যবহার করুন।",
      detailedStart: "বিস্তারিত ড্যাশবোর্ড খুলুন",
    },
    mr: {
      badge: "रुग्ण स्वागत",
      heading: "तुमची भाषा निवडा आणि आज मदत कशी हवी ते सांगा",
      sub: "सुरू करण्यासाठी खात्याची आवश्यकता नाही. खाली तुमची भाषा निवडा.",
      step1: "१. तुम्हाला कोणती भाषा आवडते?",
      step2: "२. तुम्हाला MedSarthi कसे वापरायचे आहे?",
      guidedBadge: "आवाज + चित्र कार्ड्स",
      guidedTitle: "सोपा गाईडेड मदतनीस",
      guidedDesc: "ऐकून आणि चित्रांवरून औषधे समजून घेण्यासाठी सर्वोत्तम.",
      guidedStart: "गाईडेड मदतनीस सुरू करा",
      detailedBadge: "संपूर्ण डॅशबोर्ड",
      detailedTitle: "सविस्तर रुग्ण डॅशबोर्ड",
      detailedDesc: "सर्व रिपोर्ट्स आणि औषधे स्वतः वाचण्यासाठी हे निवडा.",
      detailedStart: "सविस्तर डॅशबोर्ड उघडा",
    },
    ta: {
      badge: "நோயாளர் வரவேற்பு",
      heading: "உங்கள் மொழியைத் தேர்ந்தெடுத்து உதவியைப் பெறுங்கள்",
      sub: "தொடங்க கணக்கு தேவையில்லை. கீழே உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்.",
      step1: "1. எந்த மொழியை விரும்புகிறீர்கள்?",
      step2: "2. MedSarthi-ஐ எப்படி பயன்படுத்த விரும்புகிறீர்கள்?",
      guidedBadge: "குரல் + பட அட்டைகள்",
      guidedTitle: "எளிய வழிகாட்டி உதவியாளர்",
      guidedDesc: "கேட்டு மற்றும் படங்கள் மூலம் புரிந்துகொள்ள சிறந்தது.",
      guidedStart: "வழிகாட்டியைத் தொடங்கு",
      detailedBadge: "முழு டாஷ்போர்டு",
      detailedTitle: "விரிவான நோயாளர் டாஷ்போர்டு",
      detailedDesc: "அனைத்து அறிக்கைகளையும் நீங்களே படிக்க இதைத் தேர்ந்தெடுக்கவும்.",
      detailedStart: "டாஷ்போர்டைத் திற",
    },
    te: {
      badge: "రోగి స్వాగతం",
      heading: "మీ భాషను ఎంచుకుని సహాయం పొందండి",
      sub: "ప్రారంభించడానికి ఖాతా అవసరం లేదు. క్రింద మీ భాషను ఎంచుకోండి.",
      step1: "1. మీకు ఏ భాష కావాలి?",
      step2: "2. మీరు MedSarthi ని ఎలా ఉపయోగించాలనుకుంటున్నారు?",
      guidedBadge: "వాయిస్ + చిత్ర కార్డులు",
      guidedTitle: "సులభమైన గైడెడ్ హెల్పర్",
      guidedDesc: "విని మరియు చిత్రాలతో సులభంగా అర్థం చేసుకోవడానికి ఉత్తమం.",
      guidedStart: "గైడెడ్ హెల్పర్ ప్రారంభించండి",
      detailedBadge: "పూర్తి డ్యాష్‌బోర్డ్",
      detailedTitle: "వివరమైన రోగి డ్యాష్‌బోర్డ్",
      detailedDesc: "అన్ని రిపోర్టులను మీరే చదవడానికి దీనిని ఎంచుకోండి.",
      detailedStart: "డ్యాష్‌బోర్డ్ తెరవండి",
    },
    gu: {
      badge: "દર્દી સ્વાગત",
      heading: "તમારી ભાષા પસંદ કરો અને આજે કેવી મદદ જોઈએ છે તે પસંદ કરો",
      sub: "શરૂ કરવા માટે કોઈ ખાતાની જરૂર નથી. નીચે તમારી ભાષા પસંદ કરો.",
      step1: "૧. તમને કઈ ભાષા ગમે છે?",
      step2: "૨. તમે MedSarthi કેવી રીતે વાપરવા માંગો છો?",
      guidedBadge: "અવાજ + ચિત્ર કાર્ડ્સ",
      guidedTitle: "સરળ ગાઇડેડ હેલ્પર",
      guidedDesc: "સાંભળીને અને ચિત્રો દ્વારા દવાઓ સમજવા માટે શ્રેષ્ઠ.",
      guidedStart: "ગાઇડેડ હેલ્પર શરૂ કરો",
      detailedBadge: "સંપૂર્ણ ડેશબોર્ડ",
      detailedTitle: "વિગતવાર દર્દી ડેશબોર્ડ",
      detailedDesc: "તમારા બધા રિપોર્ટ્સ જાતે વાંચવા માટે આ પસંદ કરો.",
      detailedStart: "ડેશબોર્ડ ખોલો",
    },
    kn: {
      badge: "ರೋಗಿ ಸ್ವಾಗತ",
      heading: "ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ ಮತ್ತು ಸಹಾಯ ಪಡೆಯಿರಿ",
      sub: "ಪ್ರಾರಂಭಿಸಲು ಖಾತೆಯ ಅಗತ್ಯವಿಲ್ಲ. ಕೆಳಗೆ ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
      step1: "1. ನಿಮಗೆ ಯಾವ ಭಾಷೆ ಬೇಕು?",
      step2: "2. ನೀವು MedSarthi ಅನ್ನು ಹೇಗೆ ಬಳಸಲು ಬಯಸುತ್ತೀರಿ?",
      guidedBadge: "ಧ್ವನಿ + ಚಿತ್ರ ಕಾರ್ಡ್‌ಗಳು",
      guidedTitle: "ಸರಳ ಗೈಡೆಡ್ ಸಹಾಯಕ",
      guidedDesc: "ಕೇಳಿ ಮತ್ತು ಚಿತ್ರಗಳ ಮೂಲಕ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಉತ್ತಮವಾಗಿದೆ.",
      guidedStart: "ಗೈಡೆಡ್ ಸಹಾಯಕ ಪ್ರಾರಂಭಿಸಿ",
      detailedBadge: "ಪೂರ್ಣ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
      detailedTitle: "ವಿವರವಾದ ರೋಗಿ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
      detailedDesc: "ಎಲ್ಲಾ ವರದಿಗಳನ್ನು ನೀವೇ ಓದಲು ಇದನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
      detailedStart: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಿರಿ",
    },
    ml: {
      badge: "രോഗി സ്വാഗതം",
      heading: "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുത്ത് സഹായം നേടുക",
      sub: "ആരംഭിക്കാൻ അക്കൗണ്ട് ആവശ്യമില്ല. താഴെ നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക.",
      step1: "1. ഏത് ഭാഷയാണ് നിങ്ങൾക്ക് വേണ്ടത്?",
      step2: "2. നിങ്ങൾ എങ്ങനെ MedSarthi ഉപയോഗിക്കാൻ ആഗ്രഹിക്കുന്നു?",
      guidedBadge: "ശബ്ദം + ചിത്ര കാർഡുകൾ",
      guidedTitle: "ലളിതമായ ഗൈഡഡ് ഹെൽപ്പർ",
      guidedDesc: "കേട്ടും ചിത്രങ്ങളിലൂടെയും മരുന്നുകൾ മനസ്സിലാക്കാൻ മികച്ചത്.",
      guidedStart: "ഗൈഡഡ് ഹെൽപ്പർ തുടങ്ങുക",
      detailedBadge: "പൂർണ്ണ ഡാഷ്‌ബോർഡ്",
      detailedTitle: "വിശദമായ രോഗി ഡാഷ്‌ബോർഡ്",
      detailedDesc: "എല്ലാ റിപ്പോർട്ടുകളും സ്വയം വായിക്കാൻ ഇത് തിരഞ്ഞെടുക്കുക.",
      detailedStart: "ഡാഷ്‌ബോർഡ് തുറക്കുക",
    },
    pa: {
      badge: "ਮਰੀਜ਼ ਸਵਾਗਤ",
      heading: "ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ ਅਤੇ ਦੱਸੋ ਕਿ ਅੱਜ ਤੁਸੀਂ ਕਿਵੇਂ ਮਦਦ ਚਾਹੁੰਦੇ ਹੋ",
      sub: "ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਕਿਸੇ ਖਾਤੇ ਦੀ ਲੋੜ ਨਹੀਂ ਹੈ। ਹੇਠਾਂ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।",
      step1: "1. ਤੁਸੀਂ ਕਿਹੜੀ ਭਾਸ਼ਾ ਪਸੰਦ ਕਰਦੇ ਹੋ?",
      step2: "2. ਤੁਸੀਂ MedSarthi ਦੀ ਵਰਤੋਂ ਕਿਵੇਂ ਕਰਨਾ ਚਾਹੋਗੇ?",
      guidedBadge: "ਆਵਾਜ਼ + ਤਸਵੀਰ ਕਾਰਡ",
      guidedTitle: "ਸੌਖਾ ਗਾਈਡਡ ਹੈਲਪਰ",
      guidedDesc: "ਸੁਣ ਕੇ ਅਤੇ ਤਸਵੀਰਾਂ ਰਾਹੀਂ ਦਵਾਈਆਂ ਸਮਝਣ ਲਈ ਸਭ ਤੋਂ ਵਧੀਆ।",
      guidedStart: "ਗਾਈਡਡ ਹੈਲਪਰ ਸ਼ੁਰੂ ਕਰੋ",
      detailedBadge: "ਪੂਰਾ ਡੈਸ਼ਬੋਰਡ",
      detailedTitle: "ਵਿਸਤ੍ਰਿਤ ਮਰੀਜ਼ ਡੈਸ਼ਬੋਰਡ",
      detailedDesc: "ਸਾਰੀਆਂ ਰਿਪੋਰਟਾਂ ਖੁਦ ਪੜ੍ਹਨ ਲਈ ਇਸਨੂੰ ਚੁਣੋ।",
      detailedStart: "ਡੈਸ਼ਬੋਰਡ ਖੋਲ੍ਹੋ",
    },
  };

  const copy = MODE_COPY[locale] || MODE_COPY.en;

  function handleSelectLanguage(code: SupportedLocale) {
    setLocale(code);
    setLanguage(code);
    if (user?.role === "patient") {
      void api.updatePreferences({ preferred_language: code }).catch(() => {});
    }
  }

  async function handleChooseMode(mode: "guided" | "detailed") {
    setNavigating(mode);
    setLocale(locale);
    setLanguage(locale);
    if (user?.role === "patient") {
      try {
        await api.updatePreferences({
          preferred_language: locale,
          reading_comfort_level: mode === "guided" ? "very_simple" : "comfortable",
          explanation_depth: mode === "guided" ? "very_simple" : "detailed",
        });
      } catch {
        // Non-blocking preference sync
      }
    }
    router.push(mode === "guided" ? "/patient/guided" : "/patient/detailed");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="ms-card p-6 sm:p-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
            style={{
              backgroundColor: "var(--ms-primary-soft)",
              borderColor: "var(--ms-primary)",
              color: "var(--ms-ink)",
            }}
          >
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            <span>{copy.badge}</span>
          </span>
          {patientProfile?.name && (
            <span className="text-sm font-bold" style={{ color: "var(--ms-primary)" }}>
              {patientProfile.name}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {copy.heading}
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
          {copy.sub}
        </p>
      </section>

      {/* Step 1: Language Selector (11 Languages) */}
      <section className="ms-card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Globe className="h-6 w-6 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          <h2 className="text-xl font-extrabold">{copy.step1}</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SUPPORTED_LOCALES.map((item) => {
            const active = locale === item.code;
            return (
              <button
                key={item.code}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectLanguage(item.code)}
                className="tap-target-lg flex items-center justify-between gap-2 rounded-2xl border-2 px-4 py-3 text-left transition-colors"
                style={{
                  backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                  color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                <span>
                  <span className="block text-base font-extrabold">{item.nativeLabel}</span>
                  <span className="block text-xs opacity-85">{item.label}</span>
                </span>
                {active && <Check className="h-5 w-5 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2: Two Patient Paths */}
      <section className="space-y-3">
        <h2 className="text-xl font-extrabold px-1">{copy.step2}</h2>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Path A: Simple Voice & Picture Guided Flow (Low-literacy / Audio-first) */}
          <button
            type="button"
            disabled={navigating !== null}
            onClick={() => void handleChooseMode("guided")}
            className="ms-card tap-target-lg flex flex-col justify-between gap-5 border-2 p-6 text-left transition-transform hover:-translate-y-0.5"
            style={{
              borderColor: "var(--ms-primary)",
              backgroundColor: "var(--ms-surface)",
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "var(--ms-primary-soft)", color: "var(--ms-primary)" }}
                >
                  <Volume2 className="h-8 w-8" aria-hidden="true" />
                </span>
                <span
                  className="rounded-full px-3 py-1 text-xs font-extrabold"
                  style={{ backgroundColor: "var(--ms-primary)", color: "var(--ms-primary-ink)" }}
                >
                  {copy.guidedBadge}
                </span>
              </div>

              <h3 className="text-2xl font-extrabold">{copy.guidedTitle}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
                {copy.guidedDesc}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 text-base font-extrabold" style={{ color: "var(--ms-primary)" }}>
              <span>{navigating === "guided" ? "..." : copy.guidedStart}</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </div>
          </button>

          {/* Path B: Detailed / Educated Workspace */}
          <button
            type="button"
            disabled={navigating !== null}
            onClick={() => void handleChooseMode("detailed")}
            className="ms-card tap-target-lg flex flex-col justify-between gap-5 border-2 p-6 text-left transition-transform hover:-translate-y-0.5"
            style={{
              borderColor: "var(--ms-border)",
              backgroundColor: "var(--ms-surface)",
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "var(--ms-surface-alt)", color: "var(--ms-ink)" }}
                >
                  <BookOpen className="h-8 w-8" aria-hidden="true" />
                </span>
                <span
                  className="rounded-full border px-3 py-1 text-xs font-extrabold"
                  style={{ borderColor: "var(--ms-border)" }}
                >
                  {copy.detailedBadge}
                </span>
              </div>

              <h3 className="text-2xl font-extrabold">{copy.detailedTitle}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink-muted)" }}>
                {copy.detailedDesc}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 text-base font-extrabold" style={{ color: "var(--ms-primary)" }}>
              <span>
                <Sparkles className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
                {navigating === "detailed" ? "..." : copy.detailedStart}
              </span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
