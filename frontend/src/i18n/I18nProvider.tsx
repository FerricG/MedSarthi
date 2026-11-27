"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import enDict from "@/i18n/en.json";
import hiDict from "@/i18n/hi.json";
import hiLatnDict from "@/i18n/hi-Latn.json";

export type SupportedLocale =
  | "en"
  | "hi"
  | "hi-Latn"
  | "bn"
  | "mr"
  | "ta"
  | "te"
  | "gu"
  | "kn"
  | "ml"
  | "pa";
export type I18nDictionary = typeof enDict;

export interface LocaleRegistryItem {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
  tier: "mvp" | "extensible";
}

export const SUPPORTED_LOCALES: LocaleRegistryItem[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr", tier: "mvp" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", dir: "ltr", tier: "mvp" },
  { code: "hi-Latn", label: "Hinglish", nativeLabel: "Hinglish", dir: "ltr", tier: "mvp" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", dir: "ltr", tier: "mvp" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", dir: "ltr", tier: "mvp" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", dir: "ltr", tier: "mvp" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", dir: "ltr", tier: "mvp" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", dir: "ltr", tier: "mvp" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", dir: "ltr", tier: "mvp" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", dir: "ltr", tier: "mvp" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", dir: "ltr", tier: "mvp" },
];

export const EXTENSIBLE_INDIAN_LOCALES: LocaleRegistryItem[] = [];

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function mergeDict(base: I18nDictionary, override?: DeepPartial<I18nDictionary>): I18nDictionary {
  if (!override) return base;
  return {
    ...base,
    ...override,
    nav: { ...base.nav, ...(override.nav || {}) },
    accessibility: { ...base.accessibility, ...(override.accessibility || {}) },
    safety: { ...base.safety, ...(override.safety || {}) },
    auth: { ...base.auth, ...(override.auth || {}) },
    patientHome: {
      ...base.patientHome,
      ...(override.patientHome || {}),
      actions: { ...base.patientHome.actions, ...(override.patientHome?.actions || {}) },
    },
    onboarding: { ...base.onboarding, ...(override.onboarding || {}) },
    landing: {
      ...base.landing,
      ...(override.landing || {}),
      features: { ...base.landing?.features, ...(override.landing?.features || {}) },
      demo: {
        ...base.landing?.demo,
        ...(override.landing?.demo || {}),
        steps: { ...base.landing?.demo?.steps, ...(override.landing?.demo?.steps || {}) },
      },
    },
  } as I18nDictionary;
}

const REGIONAL_OVERRIDES: Partial<Record<SupportedLocale, DeepPartial<I18nDictionary>>> = {
  bn: {
    nav: { patientHome: "হোম", instructions: "ডাক্তারের পরামর্শ", reports: "রিপোর্ট", medicines: "ওষুধ", talk: "প্রশ্ন করুন", listen: "শুনুন", history: "ইতিহাস", settings: "সেটিংস", signIn: "সাইন ইন", register: "অ্যাকাউন্ট খুলুন" },
    patientHome: { greeting: "আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?", subtitle: "সহজভাবে শুরু করতে নিচের যেকোনো একটি বড় বোতামে ট্যাপ করুন।", welcomePrefix: "স্বাগতম," },
    landing: {
      heroBadge: "ডাক্তার-ভিত্তিক ক্লিনিক্যাল যোগাযোগ সেতু — কোনো সাধারণ চ্যাটবট নয়",
      heroTitle: "আপনার ডাক্তারের পরামর্শ স্পষ্টভাবে, শান্তভাবে এবং আপনার নিজের ভাষায় বুঝুন।",
      heroSubtitle: "মেডসারথি শুধুমাত্র আপনার ডাক্তারের দেওয়া তথ্য এবং যাচাইকৃত চিকিৎসা জ্ঞানের ভিত্তিতে ব্যাখ্যা করে — অস্পষ্ট প্রেসক্রিপশনে কোনো অনুমান করে না, ওষুধের মাত্রা বদলায় না এবং আপনার সুবিধাজনক ফন্ট ও অডিও প্রদান করে।",
      continueAs: "{name} হিসেবে এগিয়ে যান",
      useWithoutAccount: "অ্যাকাউন্ট ছাড়া ব্যবহার করুন",
      useWithoutAccountGuest: "অ্যাকাউন্ট ছাড়া ব্যবহার করুন (অতিথি)",
      guestWorkspaceDesc: "তাত্ক্ষণিক ব্যক্তিগত স্পেস — সাইন-আপ ছাড়াই রিপোর্ট আপলোড করুন, প্রশ্ন করুন এবং শুনুন",
      features: {
        provenanceTitle: "৪-শ্রেণী উৎস স্পষ্টতা",
        provenanceDesc: "ডাক্তারের কথা, সহজ সারাংশ, যাচাইকৃত তথ্য ও অজানা বিষয় আলাদা রাখা হয়েছে।",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "এক ট্যাপে ভাষা পরিবর্তন, চিকিৎসার তথ্য বা ওষুধের মাত্রা পরিবর্তন ছাড়াই।",
        accessibleVoiceTitle: "অ্যাক্সেসযোগ্য ভয়েস ও WCAG AAA",
        accessibleVoiceDesc: "বড় বোতাম, ০.৭৫x–১.২৫x অডিও হাইলাইটিং এবং স্পষ্ট অডিও সমর্থন।",
        integrityGateTitle: "নিরাপত্তা যাচাইকরণ গেট",
        integrityGateDesc: "ওষুধের মাত্রা ও সময় যাচাই করে — অস্পষ্ট স্ক্যানে কোনো ভুল অনুমান করে না।",
      },
      demo: {
        subtitle: "তাত্ক্ষণিক সিন্থেটিক লগইন বা ৭-ধাপের নির্দেশিকা দেখুন।",
        patientDesc: "৬টি বৈশিষ্ট্য সহ রোগী হোম খুলুন (সর্দি-কাশি ও রক্তচাপ রিপোর্ট সহ)",
        doctorDesc: "নিরাপত্তা পরীক্ষা ও OCR টুলস সহ ডাক্তার ওয়ার্কস্পেস খুলুন",
        walkthroughTitle: "৭-ধাপের নির্দেশিত ডেমো গাইড",
        launchStep1: "ধাপ ১ এখন শুরু করুন",
        stepLabel: "ধাপ {step}",
        openStep: "খুলুন",
      },
    },
  },
  mr: {
    nav: { patientHome: "मुख्य पान", instructions: "डॉक्टरांचा सल्ला", reports: "रिपोर्ट", medicines: "औषधे", talk: "प्रश्न विचारा", listen: "ऐका", history: "इतिहास", settings: "सेटिंग्ज", signIn: "साइन इन", register: "खाते उघडा" },
    patientHome: { greeting: "आज मी तुम्हाला कशी मदत करू शकते?", subtitle: "सुरू करण्यासाठी खालील एका मोठ्या बटनावर टॅप करा.", welcomePrefix: "स्वागत आहे," },
    landing: {
      heroBadge: "डॉक्टर-आधारित क्लिनिकल संवाद सेतू — कोणताही सामान्य चॅटबॉट नाही",
      heroTitle: "तुमच्या डॉक्टरांचा सल्ला स्पष्ट, शांतपणे आणि स्वतःच्या भाषेत समजून घ्या.",
      heroSubtitle: "मेडसारथी फक्त तुमच्या डॉक्टरांनी दिलेल्या माहितीनुसार आणि प्रमाणित वैद्यकीय ज्ञानावर आधारित स्पष्टीकरण देतो — अस्पष्ट चिठ्ठ्यांवर अंदाज लावत नाही, डोस बदलत नाही आणि तुमच्या सोयीनुसार फॉन्ट व ऑडिओ देतो.",
      continueAs: "{name} म्हणून पुढे जा",
      useWithoutAccount: "खात्याशिवाय वापरा",
      useWithoutAccountGuest: "खात्याशिवाय वापरा (अतिथी)",
      guestWorkspaceDesc: "झटपट खाजगी जागा — साइन-अप न करता रिपोर्ट अपलोड करा, प्रश्न विचारा आणि ऐका",
      features: {
        provenanceTitle: "४-श्रेणी स्रोत स्पष्टता",
        provenanceDesc: "डॉक्टरांचे शब्द, सोपा सारांश, प्रमाणित तथ्ये आणि अज्ञात माहिती स्पष्टपणे वेगळी ठेवली जाते.",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "संदर्भ किंवा औषधांचा डोस न बदलता एका टॅपमध्ये भाषा बदला.",
        accessibleVoiceTitle: "सुलभ आवाज आणि WCAG AAA",
        accessibleVoiceDesc: "मोठी बटणे, ०.७५x–१.२५x ऑडिओ हायलाइटिंग आणि हाय कॉन्ट्रास्ट.",
        integrityGateTitle: "सुरक्षा पडताळणी गेट",
        integrityGateDesc: "औषधांचा डोस आणि वेळ तपासते — अस्पष्ट चिठ्ठ्यांवर खोटे अंदाज लावत नाही.",
      },
      demo: {
        subtitle: "झटपट सिंथेटिक लॉगिन किंवा ७-टप्प्यांची डेमो मार्गदर्शिका पहा.",
        patientDesc: "६ कृतींसह पेशंट होम उघडा (सर्दी-पडसे आणि रक्तदाब रिपोर्ट)",
        doctorDesc: "सुरक्षा तपासणी आणि OCR सह डॉक्टर कार्यक्षेत्र उघडा",
        walkthroughTitle: "७-टप्प्यांची मार्गदर्शित डेमो",
        launchStep1: "टप्पा १ आता सुरू करा",
        stepLabel: "टप्पा {step}",
        openStep: "उघडा",
      },
    },
  },
  ta: {
    nav: { patientHome: "முகப்பு", instructions: "மருத்துவர் அறிவுரை", reports: "அறிக்கைகள்", medicines: "மருந்துகள்", talk: "கேள்வி கேளுங்கள்", listen: "கேளுங்கள்", history: "வரலாறு", settings: "அமைப்புகள்", signIn: "உள்நுழைக", register: "பதிவு செய்க" },
    patientHome: { greeting: "இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?", subtitle: "தொடங்க கீழே உள்ள ஒரு பெரிய பொத்தானைத் தட்டவும்.", welcomePrefix: "நல்வரவு," },
    landing: {
      heroBadge: "மருத்துவர் அடிப்படையிலான மருத்துவத் தகவல் பாலம் — பொதுவான சாட்பாட் அல்ல",
      heroTitle: "உங்கள் மருத்துவரின் ஆலோசனையைத் தெளிவாக, அமைதியாக மற்றும் உங்கள் சொந்த மொழியில் புரிந்து கொள்ளுங்கள்.",
      heroSubtitle: "மெட்சாரதி உங்கள் மருத்துவர் வழங்கிய தகவல்கள் மற்றும் சரிபார்க்கப்பட்ட மருத்துவ அறிவின் அடிப்படையில் மட்டுமே விளக்குகிறது — தவறான யூகங்கள் செய்யாது, அளவுகளை மாற்றாது.",
      continueAs: "{name} ஆக தொடரவும்",
      useWithoutAccount: "கணக்கு இல்லாமல் பயன்படுத்தவும்",
      useWithoutAccountGuest: "கணக்கு இல்லாமல் பயன்படுத்தவும் (விருந்தினர்)",
      guestWorkspaceDesc: "உடனடி தனிப்பட்ட பணியிடம் — பதிவு செய்யாமல் அறிக்கைகளைப் பதிவேற்றவும், கேட்கவும்",
      features: {
        provenanceTitle: "4-வகை தகவல் மூலம்",
        provenanceDesc: "மருத்துவர் சொற்கள், எளிய விளக்கம், சரிபார்க்கப்பட்ட உண்மைகள் தனித்தனியாகக் காட்டப்படும்.",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "மருத்துவ அளவுகளை மாற்றாமல் ஒரே தொடுதலில் மொழி மாற்றம்.",
        accessibleVoiceTitle: "எளிதான குரல் & WCAG AAA",
        accessibleVoiceDesc: "பெரிய பொத்தான்கள், 0.75x–1.25x வேகத்தில் ஒலி ஹைலைட்டிங்.",
        integrityGateTitle: "பாதுகாப்பு சரிபார்ப்பு கேட்",
        integrityGateDesc: "மருந்து அளவுகளையும் நேரத்தையும் உறுதி செய்கிறது.",
      },
      demo: {
        subtitle: "உடனடி டெமோ உள்நுழைவு அல்லது 7-படி வழிகாட்டியைப் பார்க்கவும்.",
        patientDesc: "6 செயல்களுடன் நோயாளி முகப்பைத் திறக்கவும்",
        doctorDesc: "சரிபார்ப்பு கருவிகளுடன் மருத்துவர் பணியிடத்தைத் திறக்கவும்",
        walkthroughTitle: "7-படி வழிகாட்டப்பட்ட டெமோ",
        launchStep1: "படி 1-ஐ இப்போது தொடங்கவும்",
        stepLabel: "படி {step}",
        openStep: "திறக்கவும்",
      },
    },
  },
  te: {
    nav: { patientHome: "హోమ్", instructions: "డాక్టర్ సూచనలు", reports: "రిపోర్టులు", medicines: "మందులు", talk: "ప్రశ్న అడగండి", listen: "వినండి", history: "చరిత్ర", settings: "సెట్టింగ్‌లు", signIn: "సైన్ ఇన్", register: "నమోదు" },
    patientHome: { greeting: "ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?", subtitle: "ప్రారంభించడానికి క్రింది పెద్ద బటన్‌పై నొక్కండి.", welcomePrefix: "స్వాగతం," },
    landing: {
      heroBadge: "డాక్టర్ ఆధారిత క్లినికల్ కమ్యూనికేషన్ బ్రిడ్జ్ — సాధారణ చాట్‌బాట్ కాదు",
      heroTitle: "మీ డాక్టర్ సలహాను స్పష్టంగా, ప్రశాంతంగా మరియు మీ స్వంత భాషలో అర్థం చేసుకోండి.",
      heroSubtitle: "మెడ్‌సారథి మీ డాక్టర్ అందించిన వివరాలు మరియు ధృవీకరించబడిన వైద్య పరిజ్ఞానం ఆధారంగా మాత్రమే వివరిస్తుంది — ఎటువంటి తప్పుడు ఊహలు చేయదు, మందుల మోతాదులను మార్చదు.",
      continueAs: "{name} గా కొనసాగించండి",
      useWithoutAccount: "ఖాతా లేకుండా ఉపయోగించండి",
      useWithoutAccountGuest: "ఖాతా లేకుండా ఉపయోగించండి (అతిథి)",
      guestWorkspaceDesc: "తక్షణ ప్రైవేట్ వర్క్‌స్పేస్ — సైన్-అప్ లేకుండా రిపోర్టులను అప్‌లోడ్ చేయండి, ప్రశ్నలు అడగండి",
      features: {
        provenanceTitle: "4-వర్గాల మూల స్పష్టత",
        provenanceDesc: "డాక్టర్ మాటలు, సరళమైన వివరణ, ధృవీకరించబడిన వాస్తవాలు వేరుగా చూపబడతాయి.",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "సందర్భం లేదా మందుల మోతాదు మారకుండా ఒకే ట్యాప్‌తో భాషను మార్చండి.",
        accessibleVoiceTitle: "సులభమైన వాయిస్ & WCAG AAA",
        accessibleVoiceDesc: "పెద్ద బటన్లు, 0.75x–1.25x ఆడియో హైలైటింగ్ మరియు అధిక కాంట్రాస్ట్.",
        integrityGateTitle: "భద్రతా ధృవీకరణ గేట్",
        integrityGateDesc: "మందుల మోతాదు మరియు సమయాన్ని ఖచ్చితంగా సరిచూస్తుంది.",
      },
      demo: {
        subtitle: "తక్షణ సింథటిక్ లాగిన్ లేదా 7-దశల డెమో గైడ్ చూడండి.",
        patientDesc: "6 చర్యలతో పేషెంట్ హోమ్ తెరవండి",
        doctorDesc: "భద్రతా తనిఖీలతో డాక్టర్ వర్క్‌స్పేస్ తెరవండి",
        walkthroughTitle: "7-దశల గైడెడ్ డెమో",
        launchStep1: "దశ 1 ఇప్పుడు ప్రారంభించండి",
        stepLabel: "దశ {step}",
        openStep: "తెరవండి",
      },
    },
  },
  gu: {
    nav: { patientHome: "હોમ", instructions: "ડૉક્ટરની સલાહ", reports: "રિપોર્ટ", medicines: "દવાઓ", talk: "પ્રશ્ન પૂછો", listen: "સાંભળો", history: "ઇતિહાસ", settings: "સેટિંગ્સ", signIn: "સાઇન ઇન", register: "નોંધણી" },
    patientHome: { greeting: "આજે હું તમને કેવી રીતે મદદ કરી શકું?", subtitle: "શરૂ કરવા માટે નીચેના મોટા બટન પર ટૅપ કરો.", welcomePrefix: "સ્વાગત છે," },
    landing: {
      heroBadge: "ડૉક્ટર-આધારિત ક્લિનિકલ સંવાદ સેતુ — કોઈ સામાન્ય ચેટબૉટ નથી",
      heroTitle: "તમારા ડૉક્ટરની સલાહને સ્પષ્ટ, શાંતિથી અને તમારી પોતાની ભાષામાં સમજો.",
      heroSubtitle: "મેડસારથી ફક્ત તમારા ડૉક્ટરે આપેલી માહિતી અને પ્રમાણિત તબીબી જ્ઞાનના આધારે સમજાવે છે — અસ્પષ્ટ પ્રિસ્ક્રિપ્શન પર કોઈ અનુમાન લગાવતું નથી, ડોઝ બદલતું નથી.",
      continueAs: "{name} તરીકે આગળ વધો",
      useWithoutAccount: "ખાતા વગર ઉપયોગ કરો",
      useWithoutAccountGuest: "ખાતા વગર ઉપયોગ કરો (અતિથિ)",
      guestWorkspaceDesc: "ત્વરિત ખાનગી વર્કસ્પેસ — સાઇન-અપ વિના રિપોર્ટ અપલોડ કરો, પ્રશ્નો પૂછો અને સાંભળો",
      features: {
        provenanceTitle: "4-શ્રેણી સ્ત્રોત સ્પષ્ટતા",
        provenanceDesc: "ડૉક્ટરના શબ્દો, સરળ સારાંશ, પ્રમાણિત તથ્યો અલગથી દર્શાવવામાં આવે છે.",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "દવાઓનો ડોઝ બદલ્યા વગર એક ક્લિકમાં ભાષા બદલો.",
        accessibleVoiceTitle: "સરળ અવાજ અને WCAG AAA",
        accessibleVoiceDesc: "મોટા બટન, 0.75x–1.25x ઑડિયો હાઇલાઇટિંગ અને હાઇ કન્ટ્રાસ્ટ.",
        integrityGateTitle: "સુરક્ષા ચકાસણી ગેટ",
        integrityGateDesc: "દવાઓનો ડોઝ અને સમય ચકાસે છે — કોઈ ખોટા અનુમાન લગાવતું નથી.",
      },
      demo: {
        subtitle: "ત્વરિત સિન્થેટિક લૉગિન અથવા 7-પગલાંની ડેમો માર્ગદર્શિકਾ જુઓ.",
        patientDesc: "6 સુવિધાઓ સાથે દર્દી હોમ ખોલો",
        doctorDesc: "ચકાસણી ટૂલ્સ સાથે ડૉક્ટર વર્કસ્પેસ ખોલો",
        walkthroughTitle: "7-પગલાંની માર્ગદર્શિત ડેમો",
        launchStep1: "પગલું 1 હમણાં શરૂ કરો",
        stepLabel: "પગલું {step}",
        openStep: "ખોલો",
      },
    },
  },
  kn: {
    nav: { patientHome: "ಮುಖಪುಟ", instructions: "ವೈದ್ಯರ ಸಲಹೆ", reports: "ವರದಿಗಳು", medicines: "ಔಷಧಿಗಳು", talk: "ಪ್ರಶ್ನೆ ಕೇಳಿ", listen: "ಕೇಳಿ", history: "ಇತಿಹಾಸ", settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು", signIn: "ಸೈನ್ ಇನ್", register: "ನೋಂದಣಿ" },
    patientHome: { greeting: "ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?", subtitle: "ಪ್ರಾರಂಭಿಸಲು ಕೆಳಗಿನ ದೊಡ್ಡ ಬಟನ್ ಟ್ಯಾಪ್ ಮಾಡಿ.", welcomePrefix: "ಸ್ವಾಗತ," },
    landing: {
      heroBadge: "ವೈದ್ಯರ ಆಧಾರಿತ ಕ್ಲಿನಿಕಲ್ ಸಂವಹನ ಸೇತು — ಯಾವುದೇ ಸಾಮಾನ್ಯ ಚಾಟ್‌ಬಾಟ್ ಅಲ್ಲ",
      heroTitle: "ನಿಮ್ಮ ವೈದ್ಯರ ಸಲಹೆಯನ್ನು ಸ್ಪಷ್ಟವಾಗಿ, ಶಾಂತವಾಗಿ ಮತ್ತು ನಿಮ್ಮ ಸ್ವಂತ ಭಾಷೆಯಲ್ಲಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಿ.",
      heroSubtitle: "ಮೆಡ್‌ಸಾರಥಿ ನಿಮ್ಮ ವೈದ್ಯರು ನೀಡಿದ ಮಾಹಿತಿ ಮತ್ತು ಪರಿಶೀಲಿಸಿದ ವೈದ್ಯಕೀಯ ಜ್ಞಾನದ ಆಧಾರದ ಮೇಲೆ ಮಾತ್ರ ವಿವರಿಸುತ್ತದೆ — ಅಸ್ಪಷ್ಟ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ಗಳ ಮೇಲೆ ಊಹೆ ಮಾಡುವುದಿಲ್ಲ, ಡೋಸ್ ಬದಲಾಯಿಸುವುದಿಲ್ಲ.",
      continueAs: "{name} ಆಗಿ ಮುಂದುವರಿಯಿರಿ",
      useWithoutAccount: "ಖಾತೆ ಇಲ್ಲದೆ ಬಳಸಿ",
      useWithoutAccountGuest: "ಖಾತೆ ಇಲ್ಲದೆ ಬಳಸಿ (ಅತಿಥಿ)",
      guestWorkspaceDesc: "ತಕ್ಷಣದ ಖಾಸಗಿ ಕಾರ್ಯಸ್ಥಳ — ಸೈನ್-ಅಪ್ ಇಲ್ಲದೆ ವರದಿಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ, ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಿ ಮತ್ತು ಆಲಿಸಿ",
      features: {
        provenanceTitle: "4-ವರ್ಗಗಳ ಮೂಲ ಸ್ಪಷ್ಟತೆ",
        provenanceDesc: "ವೈದ್ಯರ ಮಾತುಗಳು, ಸರಳ ವಿವರಣೆ, ಪರಿಶೀಲಿಸಿದ ಸತ್ಯಗಳು ಪ್ರತ್ಯೇಕವಾಗಿ ಕಾಣಿಸುತ್ತವೆ.",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "ಔಷಧದ ಡೋಸ್ ಬದಲಾಗದೆ ಒಂದೇ ಟ್ಯಾಪ್‌ನಲ್ಲಿ ಭಾಷೆ ಬದಲಾಯಿಸಿ.",
        accessibleVoiceTitle: "ಸುಲಭ ಧ್ವನಿ & WCAG AAA",
        accessibleVoiceDesc: "ದೊಡ್ಡ ಬಟನ್‌ಗಳು, 0.75x–1.25x ಆಡಿಯೊ ಹೈಲೈಟ್ ಮಾಡುವಿಕೆ ಮತ್ತು ಹೈ ಕಾಂಟ್ರಾಸ್ಟ್.",
        integrityGateTitle: "ಸುರಕ್ಷತಾ ಪರಿಶೀಲನಾ ಗೇಟ್",
        integrityGateDesc: "ಔಷಧಿ ಡೋಸ್ ಮತ್ತು ಸಮಯವನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ — ತಪ್ಪು ಊಹೆಗಳನ್ನು ಮಾಡುವುದಿಲ್ಲ.",
      },
      demo: {
        subtitle: "ತಕ್ಷಣದ ಸಿಂಥೆಟಿಕ್ ಲಾಗಿನ್ ಅಥವಾ 7-ಹಂತಗಳ ಡೆಮೊ ಮಾರ್ಗದರ್ಶಿ ನೋಡಿ.",
        patientDesc: "6 ಕ್ರಿಯೆಗಳೊಂದಿಗೆ ರೋಗಿಯ ಮುಖಪುಟ ತೆರೆಯಿರಿ",
        doctorDesc: "ಪರಿಶೀಲನಾ ಪರಿಕರಗಳೊಂದಿಗೆ ವೈದ್ಯರ ಕಾರ್ಯಸ್ಥಳ ತೆರೆಯಿರಿ",
        walkthroughTitle: "7-ಹಂತಗಳ ಮಾರ್ಗದರ್ಶಿತ ಡೆಮೊ",
        launchStep1: "ಹಂತ 1 ಅನ್ನು ಈಗಲೇ ಪ್ರಾರಂಭಿಸಿ",
        stepLabel: "ಹಂತ {step}",
        openStep: "ತೆರೆಯಿರಿ",
      },
    },
  },
  ml: {
    nav: { patientHome: "ഹോം", instructions: "ഡോക്ടറുടെ നിർദ്ദേശം", reports: "റിപ്പോർട്ടുകൾ", medicines: "മരുന്നുകൾ", talk: "ചോദ്യം ചോദിക്കൂ", listen: "കേൾക്കൂ", history: "ചരിത്രം", settings: "സെറ്റിംഗുകൾ", signIn: "സൈൻ ഇൻ", register: "രജിസ്റ്റർ" },
    patientHome: { greeting: "ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?", subtitle: "ആരംഭിക്കാൻ താഴെയുള്ള വലിയ ബട്ടണിൽ ടാപ്പ് ചെയ്യുക.", welcomePrefix: "സ്വാഗതം," },
    landing: {
      heroBadge: "ഡോക്ടർ അധിഷ്ഠിത ക്ലിനിക്കൽ ആശയവിനിമയ പാലം — സാധാരണ ചാറ്റ്ബോട്ട് അല്ല",
      heroTitle: "നിങ്ങളുടെ ഡോക്ടറുടെ നിർദ്ദേശങ്ങൾ വ്യക്തമായും ശാന്തമായും നിങ്ങളുടെ സ്വന്തം ഭാഷയിൽ മനസ്സിലാക്കുക.",
      heroSubtitle: "മെഡ്‌സാരഥി നിങ്ങളുടെ ഡോക്ടർ നൽകിയ വിവരങ്ങളുടെയും സ്ഥിരീകരിച്ച മെഡിക്കൽ അറിവിന്റെയും അടിസ്ഥാനത്തിൽ മാത്രം വിശദീകരിക്കുന്നു — മരുന്നിന്റെ അളവ് മാറ്റുകയോ തെറ്റായ ഊഹങ്ങൾ നടത്തുകയോ ഇല്ല.",
      continueAs: "{name} ആയി തുടരുക",
      useWithoutAccount: "അക്കൗണ്ട് ഇല്ലാതെ ഉപയോഗിക്കുക",
      useWithoutAccountGuest: "അക്കൗണ്ട് ഇല്ലാതെ ഉപയോഗിക്കുക (ഗസ്റ്റ്)",
      guestWorkspaceDesc: "തൽക്ഷണ സ്വകാര്യ വർക്ക്‌സ്‌പെയ്‌സ് — സൈൻ-അപ്പ് ഇല്ലാതെ റിപ്പോർട്ടുകൾ അപ്‌ലോഡ് ചെയ്യുക, കേൾക്കുക",
      features: {
        provenanceTitle: "4-തരം ഉറവിട വ്യക്തത",
        provenanceDesc: "ഡോക്ടറുടെ വാക്കുകൾ, ലളിതമായ സംഗ്രഹം, വസ്തുതകൾ എന്നിവ പ്രത്യേകമായി കാണിക്കുന്നു.",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "മരുന്നിന്റെ അളവുകൾ മാറ്റാതെ ഒരു ടാപ്പിൽ ഭാഷ മാറ്റാം.",
        accessibleVoiceTitle: "ലളിതമായ വോയ്‌സ് & WCAG AAA",
        accessibleVoiceDesc: "വലിയ ബട്ടണുകൾ, 0.75x–1.25x ഓഡിയോ ഹൈലൈറ്റിംഗ്, ഉയർന്ന കോൺട്രാസ്റ്റ്.",
        integrityGateTitle: "സുരക്ഷാ പരിശോധന ഗേറ്റ്",
        integrityGateDesc: "മരുന്നിന്റെ അളവും സമയവും കൃത്യമായി പരിശോധിക്കുന്നു.",
      },
      demo: {
        subtitle: "തൽക്ഷണ സിന്തറ്റിക് ലോഗിൻ അല്ലെങ്കിൽ 7-ഘട്ട ഡെമോ ഗൈഡ് കാണുക.",
        patientDesc: "6 ഫീച്ചറുകളോടെ പേഷ്യന്റ് ഹോം തുറക്കുക",
        doctorDesc: "പരിശോധനാ ടൂളുകളോടെ ഡോക്ടർ വർക്ക്‌സ്‌പെയ്‌സ് തുറക്കുക",
        walkthroughTitle: "7-ഘട്ട ഗൈഡഡ് ഡെമോ",
        launchStep1: "ഘട്ടം 1 ഇപ്പോൾ ആരംഭിക്കുക",
        stepLabel: "ഘട്ടം {step}",
        openStep: "തുറക്കുക",
      },
    },
  },
  pa: {
    nav: { patientHome: "ਮੁੱਖ ਪੰਨਾ", instructions: "ਡਾਕਟਰ ਦੀ ਸਲਾਹ", reports: "ਰਿਪੋਰਟਾਂ", medicines: "ਦਵਾਈਆਂ", talk: "ਸਵਾਲ ਪੁੱਛੋ", listen: "ਸੁਣੋ", history: "ਇਤਿਹਾਸ", settings: "ਸੈਟਿੰਗਾਂ", signIn: "ਸਾਈਨ ਇਨ", register: "ਰਜਿਸਟਰ" },
    patientHome: { greeting: "ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੀ ਹਾਂ?", subtitle: "ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਵੱਡੇ ਬਟਨ ਤੇ ਟੈਪ ਕਰੋ।", welcomePrefix: "ਜੀ ਆਇਆਂ ਨੂੰ," },
    landing: {
      heroBadge: "ਡਾਕਟਰ-ਅਧਾਰਿਤ ਕਲੀਨਿਕਲ ਸੰਚਾਰ ਪੁਲ — ਕੋਈ ਆਮ ਚੈਟਬੋਟ ਨਹੀਂ",
      heroTitle: "ਆਪਣੇ ਡਾਕਟਰ ਦੀ ਸਲਾਹ ਨੂੰ ਸਪਸ਼ਟ, ਸ਼ਾਂਤ ਅਤੇ ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਸਮਝੋ।",
      heroSubtitle: "ਮੈਡਸਾਰਥੀ ਸਿਰਫ਼ ਤੁਹਾਡੇ ਡਾਕਟਰ ਦੁਆਰਾ ਦਿੱਤੀ ਗਈ ਜਾਣਕਾਰੀ ਅਤੇ ਪ੍ਰਮਾਣਿਤ ਡਾਕਟਰੀ ਗਿਆਨ ਦੇ ਆਧਾਰ 'ਤੇ ਹੀ ਸਮਝਾਉਂਦਾ ਹੈ — ਅਸਪਸ਼ਟ ਪਰਚੀਆਂ 'ਤੇ ਕੋਈ ਅੰਦਾਜ਼ਾ ਨਹੀਂ ਲਗਾਉਂਦਾ, ਖੁਰਾਕ ਨਹੀਂ ਬਦਲਦਾ।",
      continueAs: "{name} ਵਜੋਂ ਜਾਰੀ ਰੱਖੋ",
      useWithoutAccount: "ਖਾਤੇ ਤੋਂ ਬਿਨਾਂ ਵਰਤੋ",
      useWithoutAccountGuest: "ਖਾਤੇ ਤੋਂ ਬਿਨਾਂ ਵਰਤੋ (ਮਹਿਮਾਨ)",
      guestWorkspaceDesc: "ਤੁਰੰਤ ਨਿੱਜੀ ਵਰਕਸਪੇਸ — ਬਿਨਾਂ ਸਾਈਨ-ਅੱਪ ਦੇ ਰਿਪੋਰਟਾਂ ਅੱਪਲੋਡ ਕਰੋ, ਸਵਾਲ ਪੁੱਛੋ ਅਤੇ ਸੁਣੋ",
      features: {
        provenanceTitle: "4-ਸ਼੍ਰੇਣੀ ਸਰੋਤ ਸਪਸ਼ਟਤਾ",
        provenanceDesc: "ਡਾਕਟਰ ਦੇ ਸ਼ਬਦ, ਸਰਲ ਸਾਰ, ਪ੍ਰਮਾਣਿਤ ਤੱਥ ਸਪਸ਼ਟ ਤੌਰ 'ਤੇ ਵੱਖਰੇ ਦਿਖਾਈ ਦਿੰਦੇ ਹਨ।",
        multilingualTitle: "English • हिन्दी • Hinglish",
        multilingualDesc: "ਦਵਾਈਆਂ ਦੀ ਖੁਰਾਕ ਬਦਲੇ ਬਿਨਾਂ ਇੱਕ ਟੈਪ ਵਿੱਚ ਭਾਸ਼ਾ ਬਦਲੋ।",
        accessibleVoiceTitle: "ਸੌਖੀ ਆਵਾਜ਼ ਅਤੇ WCAG AAA",
        accessibleVoiceDesc: "ਵੱਡੇ ਬਟਨ, 0.75x–1.25x ਆਡੀਓ ਹਾਈਲਾਈਟਿੰਗ ਅਤੇ ਉੱਚ ਕੰਟਰਾਸਟ।",
        integrityGateTitle: "ਸੁਰੱਖਿਆ ਜਾਂਚ ਗੇਟ",
        integrityGateDesc: "ਦਵਾਈ ਦੀ ਖੁਰਾਕ ਅਤੇ ਸਮੇਂ ਦੀ ਪੁਸ਼ਟੀ ਕਰਦਾ ਹੈ — ਗਲਤ ਅੰਦਾਜ਼ੇ ਨਹੀਂ ਲਗਾਉਂਦਾ।",
      },
      demo: {
        subtitle: "ਤੁਰੰਤ ਸਿੰਥੈਟਿਕ ਲੌਗਇਨ ਜਾਂ 7-ਪੜਾਵਾਂ ਵਾਲੀ ਡੈਮੋ ਗਾਈਡ ਦੇਖੋ।",
        patientDesc: "6 ਸੁਵਿਧਾਵਾਂ ਵਾਲਾ ਮਰੀਜ਼ ਹੋਮ ਖੋਲ੍ਹੋ",
        doctorDesc: "ਜਾਂਚ ਟੂਲਸ ਨਾਲ ਡਾਕਟਰ ਵਰਕਸਪੇਸ ਖੋਲ੍ਹੋ",
        walkthroughTitle: "7-ਪੜਾਵਾਂ ਵਾਲੀ ਗਾਈਡਡ ਡੈਮੋ",
        launchStep1: "ਪੜਾਅ 1 ਹੁਣੇ ਸ਼ੁਰੂ ਕਰੋ",
        stepLabel: "ਪੜਾਅ {step}",
        openStep: "ਖੋਲ੍ਹੋ",
      },
    },
  },
};

const DICTIONARIES: Record<SupportedLocale, I18nDictionary> = {
  en: enDict,
  hi: hiDict,
  "hi-Latn": hiLatnDict,
  bn: mergeDict(enDict, REGIONAL_OVERRIDES.bn),
  mr: mergeDict(enDict, REGIONAL_OVERRIDES.mr),
  ta: mergeDict(enDict, REGIONAL_OVERRIDES.ta),
  te: mergeDict(enDict, REGIONAL_OVERRIDES.te),
  gu: mergeDict(enDict, REGIONAL_OVERRIDES.gu),
  kn: mergeDict(enDict, REGIONAL_OVERRIDES.kn),
  ml: mergeDict(enDict, REGIONAL_OVERRIDES.ml),
  pa: mergeDict(enDict, REGIONAL_OVERRIDES.pa),
};

const LOCALE_STORAGE_KEY = "medsarthi_locale";

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: I18nDictionary;
  formatMessage: (template: string, vars: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY) as SupportedLocale | null;
      if (saved && saved in DICTIONARIES) {
        setLocaleState(saved);
      }
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: DICTIONARIES[locale] ?? enDict,
      formatMessage,
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return ctx;
}
