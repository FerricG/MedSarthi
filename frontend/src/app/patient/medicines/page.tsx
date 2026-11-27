"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Lock,
  Pill,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DiagramViewer } from "@/components/DiagramViewer";
import { ProvenanceCards } from "@/components/ProvenanceCards";
import { SearchingIndicator } from "@/components/SearchingIndicator";
import { SUPPORTED_LOCALES, useI18n, type SupportedLocale } from "@/i18n/I18nProvider";
import {
  api,
  ApiError,
  type KBTermResult,
  type MedicationListItem,
  type MedicineExplanationResult,
} from "@/lib/api";
import { getClinicalAdvisory } from "@/lib/clinicalAdvisory";

const MEDICINES_COPY: Record<
  SupportedLocale,
  {
    pageTitle: string;
    prescribedTitle: string;
    loadingMeds: string;
    noMeds: string;
    searchTitle: string;
    searchSubtitle: string;
    searchPlaceholder: string;
    searchBtn: string;
    clinicalAdvisory: string;
    loading: string;
    gatheringGuidance: string;
    searchingKB: string;
    quickTap: string;
    searchResults: string;
    doctorExactPrescription: string;
    refreshBtn: string;
    generalGuideNotice: string;
    whatItIs: string;
    commonUses: string;
    howItWorks: string;
    whyPrescribed: string;
    sideEffects: string;
    seriousWarnings: string;
    precautions: string;
    adherence: string;
    questionsForDoctor: string;
    sourcesTitle: string;
  }
> = {
  en: {
    pageTitle: "Understand my medicine",
    prescribedTitle: "Your Prescribed Medicines",
    loadingMeds: "Loading your medicines...",
    noMeds: "No shared prescription medicines found yet. You can still search any medicine below to learn general information.",
    searchTitle: "Search & Learn Any Medicine",
    searchSubtitle: "Instant lookup across common generic and brand names",
    searchPlaceholder: "Look up any medicine (e.g., Ibuprofen, Dolo, Pan 40, Metformin, Cetirizine)...",
    searchBtn: "Search Medicine",
    clinicalAdvisory: "Please consult your doctor for clinical guidance.",
    loading: "loading",
    gatheringGuidance: "Gathering clinical guidance for",
    searchingKB: "Searching verified medicine knowledge...",
    quickTap: "Quick Tap:",
    searchResults: "Search Results (Tap to Explain):",
    doctorExactPrescription: "Doctor's Exact Prescription (Unchanged)",
    refreshBtn: "Refresh in Current Language",
    generalGuideNotice: "General medicine guide only — no specific dose was provided by your doctor here. Ask your doctor or pharmacist for your exact dose.",
    whatItIs: "1. What this medicine is",
    commonUses: "2. Common medical uses",
    howItWorks: "3. How it works",
    whyPrescribed: "4. Why it was prescribed for you",
    sideEffects: "5. Common Side Effects",
    seriousWarnings: "6. Serious Warnings — When to Get Help",
    precautions: "7. Precautions & Food / Interactions",
    adherence: "8. Why Taking It On Schedule Matters",
    questionsForDoctor: "9. Helpful Questions for Your Doctor or Pharmacist",
    sourcesTitle: "Information source:",
  },
  hi: {
    pageTitle: "अपनी दवाइयों को समझें",
    prescribedTitle: "आपकी निर्धारित दवाइयाँ",
    loadingMeds: "दवाइयाँ लोड हो रही हैं...",
    noMeds: "अभी कोई निर्धारित दवाइयाँ नहीं मिलीं। आप नीचे किसी भी दवा की सामान्य जानकारी खोज सकते हैं।",
    searchTitle: "किसी भी दवा को खोजें और समझें",
    searchSubtitle: "जेनेरिक और ब्रांड नामों में तुरंत खोज",
    searchPlaceholder: "दवा का नाम लिखें (जैसे, Ibuprofen, Dolo, Pan 40, Metformin, Cetirizine)...",
    searchBtn: "दवा खोजें",
    clinicalAdvisory: "क्लिनिकल मार्गदर्शन के लिए कृपया अपने डॉक्टर से परामर्श लें।",
    loading: "लोड हो रहा है",
    gatheringGuidance: "क्लिनिकल मार्गदर्शन प्राप्त किया जा रहा है:",
    searchingKB: "सत्यापित चिकित्सा ज्ञान खोजा जा रहा है...",
    quickTap: "त्वरित चयन:",
    searchResults: "खोज परिणाम (विस्तार के लिए टैप करें):",
    doctorExactPrescription: "डॉक्टर की मूल पर्ची (अपरिवर्तित)",
    refreshBtn: "वर्तमान भाषा में ताज़ा करें",
    generalGuideNotice: "यह केवल सामान्य जानकारी है — यहाँ कोई व्यक्तिगत खुराक नहीं लिखी है। अपनी सही खुराक के लिए डॉक्टर से पूछें।",
    whatItIs: "1. यह दवा क्या है",
    commonUses: "2. सामान्य उपयोग",
    howItWorks: "3. यह शरीर में कैसे काम करती है",
    whyPrescribed: "4. यह आपके लिए क्यों लिखी गई",
    sideEffects: "5. सामान्य दुष्प्रभाव",
    seriousWarnings: "6. गंभीर चेतावनियाँ — तुरंत डॉक्टर से कब मिलें",
    precautions: "7. सावधानियाँ और खान-पान संबंधी निर्देश",
    adherence: "8. समय पर दवा लेना क्यों आवश्यक है",
    questionsForDoctor: "9. डॉक्टर या फार्मासिस्ट से पूछने योग्य प्रश्न",
    sourcesTitle: "सत्यापित स्रोत:",
  },
  "hi-Latn": {
    pageTitle: "Apni dawaiyon ko samjhein",
    prescribedTitle: "Aapki Prescribed Dawaiyan",
    loadingMeds: "Dawaiyan load ho rahi hain...",
    noMeds: "Abhi koi prescribed medicine nahi mili. Aap neeche kisi bhi medicine ki general information search kar sakte hain.",
    searchTitle: "Kisi bhi dawa ko search aur learn karein",
    searchSubtitle: "Generic aur brand names mein instant lookup",
    searchPlaceholder: "Dawa ka naam likhein (jaise, Ibuprofen, Dolo, Pan 40, Metformin, Cetirizine)...",
    searchBtn: "Medicine Search Karein",
    clinicalAdvisory: "Clinical guidance ke liye kripya apne doctor se consult karein.",
    loading: "loading",
    gatheringGuidance: "Clinical guidance gather ho rahi hai:",
    searchingKB: "Verified medical knowledge search ho raha hai...",
    quickTap: "Quick Tap:",
    searchResults: "Search Results (Explain karne ke liye tap karein):",
    doctorExactPrescription: "Doctor ki Exact Prescription (Unchanged)",
    refreshBtn: "Current Language mein Refresh Karein",
    generalGuideNotice: "Yeh keval general medicine guide hai — yahan specific dose nahi likhi hai. Apni exact dose ke liye doctor se puchein.",
    whatItIs: "1. Yeh dawa kya hai",
    commonUses: "2. Common medical uses",
    howItWorks: "3. Yeh body mein kaise kaam karti hai",
    whyPrescribed: "4. Yeh aapke liye kyun likhi gayi",
    sideEffects: "5. Common Side Effects",
    seriousWarnings: "6. Serious Warnings — Doctor se turant kab milein",
    precautions: "7. Precautions aur Food / Interactions",
    adherence: "8. Regular schedule par lena kyun zaroori hai",
    questionsForDoctor: "9. Doctor ya Pharmacist se puchne layak questions",
    sourcesTitle: "Information source:",
  },
  bn: {
    pageTitle: "আপনার ওষুধ বুঝুন",
    prescribedTitle: "আপনার প্রেসক্রিপশনের ওষুধ",
    loadingMeds: "ওষুধ লোড হচ্ছে...",
    noMeds: "এখনো কোনো প্রেসক্রিপশনের ওষুধ পাওয়া যায়নি। আপনি নিচে যেকোনো ওষুধ অনুসন্ধান করতে পারেন।",
    searchTitle: "যেকোনো ওষুধ খুঁজুন এবং জানুন",
    searchSubtitle: "জেনেরিক এবং ব্র্যান্ডের নামে তাত্ক্ষণিক অনুসন্ধান",
    searchPlaceholder: "ওষুধের নাম লিখুন (যেমন, Ibuprofen, Dolo, Pan 40, Metformin, Cetirizine)...",
    searchBtn: "ওষুধ খুঁজুন",
    clinicalAdvisory: "চিকিৎসাগত নির্দেশনার জন্য দয়া করে আপনার ডাক্তারের সাথে পরামর্শ করুন।",
    loading: "লোড হচ্ছে",
    gatheringGuidance: "নির্দেশিকা সংগ্রহ করা হচ্ছে:",
    searchingKB: "যাচাইকৃত তথ্য অনুসন্ধান করা হচ্ছে...",
    quickTap: "দ্রুত বাছুন:",
    searchResults: "অনুসন্ধানের ফলাফল:",
    doctorExactPrescription: "ডাক্তারের মূল প্রেসক্রিপশন (অপরিবর্তিত)",
    refreshBtn: "বর্তমান ভাষায় রিফ্রেশ করুন",
    generalGuideNotice: "এটি কেবল সাধারণ নির্দেশিকা — নির্দিষ্ট ডোজ জানার জন্য আপনার ডাক্তারের সাথে পরামর্শ করুন।",
    whatItIs: "১. এই ওষুধটি কী",
    commonUses: "২. সাধারণ ব্যবহার",
    howItWorks: "৩. এটি কীভাবে কাজ করে",
    whyPrescribed: "৪. এটি আপনার জন্য কেন দেওয়া হয়েছে",
    sideEffects: "৫. সাধারণ পার্শ্বপ্রতিক্রিয়া",
    seriousWarnings: "৬. জরুরি সতর্কতা",
    precautions: "৭. সতর্কতা ও খাদ্যের সাথে সম্পর্ক",
    adherence: "৮. সময়মতো ওষুধ খাওয়ার গুরুত্ব",
    questionsForDoctor: "৯. ডাক্তারকে জিজ্ঞাসা করার প্রশ্ন",
    sourcesTitle: "তথ্যের উৎস:",
  },
  mr: {
    pageTitle: "तुमची औषधे समजून घ्या",
    prescribedTitle: "तुमची लिहून दिलेली औषधे",
    loadingMeds: "औषधे लोड होत आहेत...",
    noMeds: "अद्याप कोणतीही औषधे आढळली नाहीत. आपण खाली कोणत्याही औषधाची सामान्य माहिती शोधू शकता.",
    searchTitle: "कोणतेही औषध शोधा आणि माहिती मिळवा",
    searchSubtitle: "जेनेरिक आणि ब्रँड नावांमध्ये झटपट शोध",
    searchPlaceholder: "औषधाचे नाव शोधा (उदा. Ibuprofen, Dolo, Pan 40, Metformin, Cetirizine)...",
    searchBtn: "औषध शोधा",
    clinicalAdvisory: "वैद्यकीय मार्गदर्शनासाठी कृपया आपल्या डॉक्टरांचा सल्ला घ्या.",
    loading: "लोड होत आहे",
    gatheringGuidance: "माहिती मिळवत आहे:",
    searchingKB: "माहिती शोधत आहे...",
    quickTap: "झटपट निवडा:",
    searchResults: "शोध परिणाम:",
    doctorExactPrescription: "डॉक्टरांचे मूळ प्रिस्क्रिप्शन (अपरिवर्तित)",
    refreshBtn: "सध्याच्या भाषेत रीफ्रेश करा",
    generalGuideNotice: "ही केवळ सामान्य माहिती आहे — अचूक डोससाठी आपल्या डॉक्टरांचा सल्ला घ्या.",
    whatItIs: "१. हे औषध काय आहे",
    commonUses: "२. सामान्य उपयोग",
    howItWorks: "३. हे कसे कार्य करते",
    whyPrescribed: "४. हे तुम्हाला का दिले आहे",
    sideEffects: "५. सामान्य दुष्परिणाम",
    seriousWarnings: "६. गंभीर इशारे — त्वरित मदत कधी घ्यावी",
    precautions: "७. घ्यावयाची काळजी",
    adherence: "८. वेळेवर औषध घेण्याचे महत्त्व",
    questionsForDoctor: "९. डॉक्टरांना विचारण्यासाठी प्रश्न",
    sourcesTitle: "माहितीचा स्रोत:",
  },
  ta: {
    pageTitle: "உங்கள் மருந்துகளைப் புரிந்துகொள்ளுங்கள்",
    prescribedTitle: "உங்கள் பரிந்துரைக்கப்பட்ட மருந்துகள்",
    loadingMeds: "மருந்துகள் ஏற்றப்படுகின்றன...",
    noMeds: "மருந்துகள் எதுவும் காணப்படவில்லை. கீழே ஏதேனும் மருந்தைத் தேடலாம்.",
    searchTitle: "எந்த மருந்தையும் தேடி அறியுங்கள்",
    searchSubtitle: "பொதுவான மற்றும் பிராண்ட் பெயர்களில் உடனடி தேடல்",
    searchPlaceholder: "மருந்தின் பெயரைத் தேடுங்கள் (எ.கா. Ibuprofen, Dolo, Pan 40)...",
    searchBtn: "மருந்து தேடுக",
    clinicalAdvisory: "மருத்துவ வழிகாட்டுதலுக்கு உங்கள் மருத்துவரை அணுகவும்.",
    loading: "ஏற்றப்படுகிறது",
    gatheringGuidance: "வழிகாட்டுதல் பெறப்படுகிறது:",
    searchingKB: "தகவல் தேடப்படுகிறது...",
    quickTap: "விரைவு தேர்வு:",
    searchResults: "தேடல் முடிவுகள்:",
    doctorExactPrescription: "மருத்துவரின் அசல் மருந்துச்சீட்டு (மாற்றப்படவில்லை)",
    refreshBtn: "தற்போதைய மொழியில் புதுப்பிக்கவும்",
    generalGuideNotice: "பொதுவான தகவல் மட்டுமே — துல்லியமான அளவுக்கு மருத்துவரை அணுகவும்.",
    whatItIs: "1. இந்த மருந்து என்ன",
    commonUses: "2. பொதுவான பயன்பாடுகள்",
    howItWorks: "3. இது எவ்வாறு செயல்படுகிறது",
    whyPrescribed: "4. இது உங்களுக்கு ஏன் பரிந்துரைக்கப்பட்டது",
    sideEffects: "5. பொதுவான பக்க விளைவுகள்",
    seriousWarnings: "6. தீவிர எச்சரிக்கைகள்",
    precautions: "7. முன்னெச்சரிக்கைகள்",
    adherence: "8. சரியான நேரத்தில் எடுப்பதன் முக்கியத்துவம்",
    questionsForDoctor: "9. மருத்துவரிடம் கேட்க வேண்டிய கேள்விகள்",
    sourcesTitle: "தகவல் ஆதாரம்:",
  },
  te: {
    pageTitle: "మీ మందులను అర్థం చేసుకోండి",
    prescribedTitle: "మీ సూచించిన మందులు",
    loadingMeds: "మందులు లోడ్ అవుతున్నాయి...",
    noMeds: "ఇంకా మందులు ఏవీ కనుగొనబడలేదు. మీరు క్రింద ఏదైనా మందును శోధించవచ్చు.",
    searchTitle: "ఏదైనా మందును శోధించండి మరియు తెలుసుకోండి",
    searchSubtitle: "సాధారణ మరియు బ్రాండ్ పేర్లలో తక్షణ శోధన",
    searchPlaceholder: "మందు పేరును శోధించండి (ఉదా. Ibuprofen, Dolo, Pan 40)...",
    searchBtn: "మందును శోధించండి",
    clinicalAdvisory: "క్లినికల్ మార్గదర్శకత్వం కోసం దయచేసి మీ వైద్యుడిని సంప్రదించండి.",
    loading: "లోడ్ అవుతోంది",
    gatheringGuidance: "మార్గదర్శకత్వం సేకరిస్తోంది:",
    searchingKB: "వైద్య సమాచారం శోధిస్తోంది...",
    quickTap: "త్వరిత ఎంపిక:",
    searchResults: "శోధన ఫలితాలు:",
    doctorExactPrescription: "డాక్టర్ అసలు ప్రిస్క్రిప్షన్ (మార్చబడలేదు)",
    refreshBtn: "ప్రస్తుత భాషలో రిఫ్రెష్ చేయండి",
    generalGuideNotice: "సాధారణ గైడ్ మాత్రమే — ఖచ్చితమైన మోతాదు కోసం మీ వైద్యుడిని సంప్రదించండి.",
    whatItIs: "1. ఈ మందు ఏమిటి",
    commonUses: "2. సాధారణ ఉపయోగాలు",
    howItWorks: "3. ఇది ఎలా పనిచేస్తుంది",
    whyPrescribed: "4. ఇది మీకు ఎందుకు సూచించబడింది",
    sideEffects: "5. సాధారణ దుష్ప్రభావాలు",
    seriousWarnings: "6. తీవ్రమైన హెచ్చరికలు",
    precautions: "7. జాగ్రత్తలు",
    adherence: "8. సమయానికి మందులు తీసుకోవడం ఎందుకు ముఖ్యం",
    questionsForDoctor: "9. డాక్టర్‌ని అడగవలసిన ప్రశ్నలు",
    sourcesTitle: "సమాచార మూలం:",
  },
  gu: {
    pageTitle: "તમારી દવાઓ સમજો",
    prescribedTitle: "તમારી નિર્ધારિત દવાઓ",
    loadingMeds: "દવાઓ લોડ થઈ રહી છે...",
    noMeds: "હજુ સુધી કોઈ દવાઓ મળી નથી. તમે નીચે કોઈપણ દવા શોધી શકો છો.",
    searchTitle: "કોઈપણ દવા શોધો અને જાણો",
    searchSubtitle: "સામાન્ય અને બ્રાન્ડ નામોમાં ઝડપી શોધ",
    searchPlaceholder: "દવાનું નામ શોધો (દા.ત., Ibuprofen, Dolo, Pan 40)...",
    searchBtn: "દવા શોધો",
    clinicalAdvisory: "તબીબી માર્ગદર્શન માટે કૃપા કરીને તમારા ડૉક્ટરની સલાહ લો.",
    loading: "લોડ થઈ રહ્યું છે",
    gatheringGuidance: "માર્ગદર્શન મેળવી રહ્યું છે:",
    searchingKB: "માહિતી શોધી રહ્યું છે...",
    quickTap: "ઝડપી પસંદગી:",
    searchResults: "શોધ પરિણામો:",
    doctorExactPrescription: "ડૉક્ટરનું મૂળ પ્રિસ્ક્રિપ્શન (અપરિવર્તિત)",
    refreshBtn: "વર્તમાન ભાષામાં રિફ્રેશ કરો",
    generalGuideNotice: "માત્ર સામાન્ય માહિતી — સચોટ ડોઝ માટે તમારા ડૉક્ટરને પૂછો.",
    whatItIs: "૧. આ દવા શું છે",
    commonUses: "૨. સામાન્ય ઉપયોગો",
    howItWorks: "૩. તે કેવી રીતે કાર્ય કરે છે",
    whyPrescribed: "૪. તે તમને કેમ આપવામાં આવી",
    sideEffects: "૫. સામાન્ય આડઅસરો",
    seriousWarnings: "૬. ગંભીર ચેતવણીઓ",
    precautions: "૭. સાવચેતીઓ",
    adherence: "૮. સમયસર દવા લેવાનું મહત્વ",
    questionsForDoctor: "૯. ડૉક્ટરને પૂછવાના પ્રશ્નો",
    sourcesTitle: "માહિતી સ્ત્રોત:",
  },
  kn: {
    pageTitle: "ನಿಮ್ಮ ಔಷಧಿಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಿ",
    prescribedTitle: "ನಿಮಗೆ ಸೂಚಿಸಲಾದ ಔಷಧಿಗಳು",
    loadingMeds: "ಔಷಧಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ...",
    noMeds: "ಯಾವುದೇ ಔಷಧಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ. ನೀವು ಕೆಳಗೆ ಯಾವುದೇ ಔಷಧಿಯನ್ನು ಹುಡುಕಬಹುದು.",
    searchTitle: "ಯಾವುದೇ ಔಷಧಿಯನ್ನು ಹುಡುಕಿ ಮತ್ತು ತಿಳಿಯಿರಿ",
    searchSubtitle: "ಜೆನೆರಿಕ್ ಮತ್ತು ಬ್ರ್ಯಾಂಡ್ ಹೆಸರುಗಳಲ್ಲಿ ತ್ವರಿತ ಹುಡುಕಾಟ",
    searchPlaceholder: "ಔಷಧಿಯ ಹೆಸರನ್ನು ಹುಡುಕಿ (ಉದಾ. Ibuprofen, Dolo, Pan 40)...",
    searchBtn: "ಔಷಧಿ ಹುಡುಕಿ",
    clinicalAdvisory: "ವೈದ್ಯಕೀಯ ಮಾರ್ಗದರ್ಶನಕ್ಕಾಗಿ ದಯವಿಟ್ಟು ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    gatheringGuidance: "ಮಾರ್ಗದರ್ಶನ ಪಡೆಯಲಾಗುತ್ತಿದೆ:",
    searchingKB: "ಮಾಹಿತಿ ಹುಡುಕಲಾಗುತ್ತಿದೆ...",
    quickTap: "ತ್ವರಿತ ಆಯ್ಕೆ:",
    searchResults: "ಹುಡುಕಾಟದ ಫಲಿತಾಂಶಗಳು:",
    doctorExactPrescription: "ವೈದ್ಯರ ಮೂಲ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ (ಬದಲಾಗದೆ ಉಳಿದಿದೆ)",
    refreshBtn: "ಪ್ರಸ್ತುತ ಭಾಷೆಯಲ್ಲಿ ರಿಫ್ರೆಶ್ ಮಾಡಿ",
    generalGuideNotice: "ಸಾಮಾನ್ಯ ಮಾಹಿತಿ ಮಾತ್ರ — ನಿಖರವಾದ ಡೋಸ್‌ಗಾಗಿ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    whatItIs: "1. ಈ ಔಷಧಿ ಯಾವುದು",
    commonUses: "2. ಸಾಮಾನ್ಯ ಉಪಯೋಗಗಳು",
    howItWorks: "3. ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
    whyPrescribed: "4. ಇದನ್ನು ನಿಮಗೆ ಏಕೆ ಸೂಚಿಸಲಾಗಿದೆ",
    sideEffects: "5. ಸಾಮಾನ್ಯ ಅಡ್ಡಪರಿಣಾಮಗಳು",
    seriousWarnings: "6. ಗಂಭೀರ ಎಚ್ಚರಿಕೆಗಳು",
    precautions: "7. ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು",
    adherence: "8. ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಪ್ರಾಮುಖ್ಯತೆ",
    questionsForDoctor: "9. ವೈದ್ಯರನ್ನು ಕೇಳಬೇಕಾದ ಪ್ರಶ್ನೆಗಳು",
    sourcesTitle: "ಮಾಹಿತಿ ಮೂಲ:",
  },
  ml: {
    pageTitle: "നിങ്ങളുടെ മരുന്നുകൾ മനസ്സിലാക്കുക",
    prescribedTitle: "നിങ്ങൾക്ക് നിർദ്ദേശിച്ച മരുന്നുകൾ",
    loadingMeds: "മരുന്നുകൾ ലഭ്യമാക്കുന്നു...",
    noMeds: "മരുന്നുകളൊന്നും കണ്ടെത്തിയില്ല. നിങ്ങൾക്ക് താഴെ തിരയാവുന്നതാണ്.",
    searchTitle: "ഏത് മരുന്നും തിരഞ്ഞ് മനസ്സിലാക്കുക",
    searchSubtitle: "ജനറിക്, ബ്രാൻഡ് നാമങ്ങളിൽ തൽക്ഷണ തിരയൽ",
    searchPlaceholder: "മരുന്നിന്റെ പേര് തിരയുക (ഉദാ. Ibuprofen, Dolo, Pan 40)...",
    searchBtn: "മരുന്ന് തിരയുക",
    clinicalAdvisory: "ക്ലിനിക്കൽ മാർഗ്ഗനിർദ്ദേശത്തിനായി ദയവായി നിങ്ങളുടെ ഡോക്ടറെ സമീപിക്കുക.",
    loading: "ലോഡ് ചെയ്യുന്നു",
    gatheringGuidance: "വിവരങ്ങൾ ശേഖരിക്കുന്നു:",
    searchingKB: "വിവരങ്ങൾ തിരയുന്നു...",
    quickTap: "വേഗത്തിലുള്ള തിരഞ്ഞെടുപ്പ്:",
    searchResults: "തിരയൽ ഫലങ്ങൾ:",
    doctorExactPrescription: "ഡോക്ടറുടെ യഥാർത്ഥ കുറിപ്പടി (മാറ്റമില്ലാതെ)",
    refreshBtn: "നിലവിലെ ഭാഷയിൽ പുതുക്കുക",
    generalGuideNotice: "പൊതുവായ വിവരം മാത്രം — കൃത്യമായ അളവിന് ഡോക്ടറോട് ചോദിക്കുക.",
    whatItIs: "1. ഈ മരുന്ന് എന്താണ്",
    commonUses: "2. സാധാരണ ഉപയോഗങ്ങൾ",
    howItWorks: "3. ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു",
    whyPrescribed: "4. ഇത് നിങ്ങൾക്ക് എന്തിനാണ് നൽകിയത്",
    sideEffects: "5. പാർശ്വഫലങ്ങൾ",
    seriousWarnings: "6. ഗുരുതരമായ മുന്നറിയിപ്പുകൾ",
    precautions: "7. മുൻകരുതലുകൾ",
    adherence: "8. കൃത്യസമയത്ത് കഴിക്കേണ്ടതിന്റെ പ്രാധാന്യം",
    questionsForDoctor: "9. ഡോക്ടറോട് ചോദിക്കേണ്ട ചോദ്യങ്ങൾ",
    sourcesTitle: "വിവര ഉറവിടം:",
  },
  pa: {
    pageTitle: "ਆਪਣੀਆਂ ਦਵਾਈਆਂ ਨੂੰ ਸਮਝੋ",
    prescribedTitle: "ਤੁਹਾਡੀਆਂ ਤਜਵੀਜ਼ ਕੀਤੀਆਂ ਦਵਾਈਆਂ",
    loadingMeds: "ਦਵਾਈਆਂ ਲੋਡ ਹੋ ਰਹੀਆਂ ਹਨ...",
    noMeds: "ਅਜੇ ਕੋਈ ਦਵਾਈਆਂ ਨਹੀਂ ਮਿਲੀਆਂ। ਤੁਸੀਂ ਹੇਠਾਂ ਕਿਸੇ ਵੀ ਦਵਾਈ ਦੀ ਜਾਣਕਾਰੀ ਖੋਜ ਸਕਦੇ ਹੋ।",
    searchTitle: "ਕਿਸੇ ਵੀ ਦਵਾਈ ਨੂੰ ਖੋਜੋ ਅਤੇ ਜਾਣੋ",
    searchSubtitle: "ਜੈਨਰਿਕ ਅਤੇ ਬ੍ਰਾਂਡ ਨਾਵਾਂ ਵਿੱਚ ਤੁਰੰਤ ਖੋਜ",
    searchPlaceholder: "ਦਵਾਈ ਦਾ ਨਾਮ ਖੋਜੋ (ਜਿਵੇਂ, Ibuprofen, Dolo, Pan 40)...",
    searchBtn: "ਦਵਾਈ ਖੋਜੋ",
    clinicalAdvisory: "ਕਲੀਨਿਕਲ ਮਾਰਗਦਰਸ਼ਨ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਕਰੋ।",
    loading: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ",
    gatheringGuidance: "ਜਾਣਕਾਰੀ ਪ੍ਰਾਪਤ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ:",
    searchingKB: "ਜਾਣਕਾਰੀ ਖੋਜੀ ਜਾ ਰਹੀ ਹੈ...",
    quickTap: "ਤੁਰੰਤ ਚੋਣ:",
    searchResults: "ਖੋਜ ਨਤੀਜੇ:",
    doctorExactPrescription: "ਡਾਕਟਰ ਦੀ ਅਸਲ ਪਰਚੀ (ਬਿਨਾਂ ਬਦਲਾਅ)",
    refreshBtn: "ਮੌਜੂਦਾ ਭਾਸ਼ਾ ਵਿੱਚ ਰਿਫ੍ਰੈਸ਼ ਕਰੋ",
    generalGuideNotice: "ਸਿਰਫ਼ ਆਮ ਜਾਣਕਾਰੀ — ਸਹੀ ਖੁਰਾਕ ਲਈ ਆਪਣੇ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
    whatItIs: "1. ਇਹ ਦਵਾਈ ਕੀ ਹੈ",
    commonUses: "2. ਆਮ ਵਰਤੋਂ",
    howItWorks: "3. ਇਹ ਕਿਵੇਂ ਕੰਮ ਕਰਦੀ ਹੈ",
    whyPrescribed: "4. ਇਹ ਤੁਹਾਨੂੰ ਕਿਉਂ ਦਿੱਤੀ ਗਈ ਹੈ",
    sideEffects: "5. ਆਮ ਮਾੜੇ ਪ੍ਰਭਾਵ",
    seriousWarnings: "6. ਗੰਭੀਰ ਚੇਤਾਵਨੀਆਂ",
    precautions: "7. ਸਾਵਧਾਨੀਆਂ",
    adherence: "8. ਸਮੇਂ ਸਿਰ ਦਵਾਈ ਲੈਣ ਦੀ ਮਹੱਤਤਾ",
    questionsForDoctor: "9. ਡਾਕਟਰ ਨੂੰ ਪੁੱਛਣ ਵਾਲੇ ਸਵਾਲ",
    sourcesTitle: "ਜਾਣਕਾਰੀ ਦਾ ਸਰੋਤ:",
  },
};

const POPULAR_MEDICINES: Array<{
  name: string;
  category: string;
  aliases: string[];
}> = [
  { name: "Paracetamol", category: "Fever & Pain Relief", aliases: ["Dolo 650", "Dolo", "Crocin", "Calpol", "Acetaminophen", "PCM"] },
  { name: "Ibuprofen", category: "Pain & Swelling Reliever", aliases: ["Combiflam", "Brufen", "Advil", "Motrin", "Ibugesic"] },
  { name: "Pantoprazole", category: "Acidity & Gas Relief", aliases: ["Pan 40", "Pan40", "Pantocid", "Pantosec", "Pantodac"] },
  { name: "Omeprazole", category: "Stomach Acid Reducer", aliases: ["Omez", "Prilosec"] },
  { name: "Cetirizine", category: "Allergy, Cold & Sneezing", aliases: ["Cetzine", "Okacet", "Zyrtec", "Alerid"] },
  { name: "Levocetirizine", category: "Runny Nose & Allergy", aliases: ["Levocet", "Vozet", "L-Cet"] },
  { name: "Montelukast", category: "Asthma & Chest Congestion", aliases: ["Montek LC", "Montair LC", "Singulair"] },
  { name: "Azithromycin", category: "Antibiotic for Infections", aliases: ["Azithral", "Azee", "Zithromax"] },
  { name: "Amoxicillin", category: "Antibiotic for Bacterial Illness", aliases: ["Mox", "Novamox", "Amoxil", "Augmentin"] },
  { name: "Cefixime", category: "Antibiotic", aliases: ["Taxim-O", "Zifi", "Mahacef"] },
  { name: "Metformin", category: "Blood Sugar Control (Diabetes)", aliases: ["Glycomet", "Glucophage", "Metfor"] },
  { name: "Amlodipine", category: "Blood Pressure Control", aliases: ["Amlong", "Amlokind", "Norvasc"] },
  { name: "Atorvastatin", category: "Cholesterol Management", aliases: ["Atorva", "Lipitor", "Storvas"] },
  { name: "Telmisartan", category: "High Blood Pressure", aliases: ["Telma", "Telmikind", "Micardis"] },
  { name: "Losartan", category: "Blood Pressure", aliases: ["Losacar", "Cozaar"] },
  { name: "Aspirin", category: "Blood Thinner & Heart Health", aliases: ["Ecosprin", "Disprin", "ASA"] },
  { name: "Diclofenac", category: "Joint Pain & Inflammation", aliases: ["Voveran", "Voltaren"] },
  { name: "Ondansetron", category: "Nausea & Vomiting Relief", aliases: ["Emeset", "Zofran", "Vomikind"] },
  { name: "Ranitidine", category: "Heartburn & Acidity", aliases: ["Rantac", "Zantac"] },
  { name: "Salbutamol", category: "Breathing Inhaler", aliases: ["Asthalin", "Ventolin"] },
];

function getLocalInstantMatches(query: string): KBTermResult[] {
  const norm = query.trim().toLowerCase();
  if (!norm) return [];
  const hits: KBTermResult[] = [];
  const seen = new Set<string>();

  for (const item of POPULAR_MEDICINES) {
    const nameMatch = item.name.toLowerCase().includes(norm);
    const aliasMatch = item.aliases.some((a) => a.toLowerCase().includes(norm));
    if (nameMatch || aliasMatch) {
      if (!seen.has(item.name.toLowerCase())) {
        seen.add(item.name.toLowerCase());
        hits.push({
          id: `med_${item.name.toLowerCase()}`,
          entry_type: "medicine",
          canonical_name: item.name,
          slug: item.name.toLowerCase().replace(/\s+/g, "-"),
          aliases: item.aliases,
          body_system: "general",
          simple_en: `${item.name} (${item.category})`,
          detailed_en: `${item.name} is commonly used for ${item.category}. Also known as ${item.aliases.join(", ")}.`,
          localized_name: item.name,
          source_name: "Verified Medical Knowledge",
          source_url: "https://medlineplus.gov",
        });
      }
    }
  }
  return hits;
}

function MedicinesWorkspace() {
  const { t, locale } = useI18n();
  const copy = MEDICINES_COPY[locale] || MEDICINES_COPY.en;

  const [meds, setMeds] = useState<MedicationListItem[]>([]);
  const [selectedMed, setSelectedMed] = useState<MedicationListItem | null>(null);
  const [explained, setExplained] = useState<MedicineExplanationResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KBTermResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dots, setDots] = useState(".");

  const [loading, setLoading] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const explanationCacheRef = useRef<Map<string, MedicineExplanationResult>>(new Map());

  // Continuous moving dots animation timer for the loading indicator
  useEffect(() => {
    if (!searching && !explaining) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."));
    }, 280);
    return () => clearInterval(interval);
  }, [searching, explaining]);

  useEffect(() => {
    let active = true;
    async function loadMeds() {
      setLoading(true);
      try {
        const items = await api.listMedications();
        if (!active) return;
        setMeds(items);
        if (items.length > 0) {
          setSelectedMed(items[0]);
          void explainSelected(items[0]);
        }
      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof ApiError ? err.message : "Could not load your medicines.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadMeds();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function explainSelected(med: MedicationListItem, langOverride = locale) {
    setSelectedMed(med);
    setErrorMsg(null);

    const cacheKey = `${med.medicine_name.trim().toLowerCase()}_${langOverride}`;
    if (explanationCacheRef.current.has(cacheKey)) {
      setExplained(explanationCacheRef.current.get(cacheKey)!);
      return;
    }

    setExplaining(true);
    try {
      const raw = await api.explainMedicine({
        medicine_name: med.medicine_name,
        doctor_dosage_instruction: med.locked_instruction,
        consultation_id: med.consultation_id ?? undefined,
        target_language: langOverride,
      });
      const mp = raw.medication_parts ?? {};
      const provGen = raw.provenance?.general_education ?? [];
      const citationsFromProv = provGen.flatMap((g) =>
        g.citations?.length
          ? g.citations
          : g.source_name && g.source_url
            ? [{ source_name: g.source_name, source_url: g.source_url }]
            : []
      );
      const computed: MedicineExplanationResult = {
        ...raw,
        drug_class: raw.drug_class ?? mp.drug_category,
        what_it_is:
          raw.what_it_is ??
          mp.what_it_is ??
          raw.provenance?.ai_simplified?.summary ??
          "Prescribed medicine",
        common_purposes: raw.common_purposes ?? mp.common_uses ?? "",
        how_it_works: raw.how_it_works ?? mp.general_mechanism ?? "",
        why_prescribed_for_you:
          raw.why_prescribed_for_you ??
          mp.prescribed_reason ??
          "Ask your doctor if the specific reason was not written on your note.",
        common_side_effects: raw.common_side_effects ?? mp.common_side_effects ?? [],
        serious_warnings:
          raw.serious_warnings ?? raw.red_flag_side_effects ?? mp.warnings ?? [],
        precautions: raw.precautions ?? mp.precautions ?? [],
        food_and_interactions: raw.food_and_interactions ?? mp.food_and_interactions,
        adherence_guidance: raw.adherence_guidance ?? mp.adherence_importance ?? "",
        questions_for_doctor: raw.questions_for_doctor ?? mp.questions_for_doctor ?? [],
        citations: raw.citations ?? citationsFromProv,
        diagram: raw.diagram ?? raw.visual_diagrams?.[0] ?? null,
      };
      explanationCacheRef.current.set(cacheKey, computed);
      setExplained(computed);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not explain this medicine.");
    } finally {
      setExplaining(false);
    }
  }

  async function handleSearchMedicine(e?: React.FormEvent, directTerm?: string) {
    if (e) e.preventDefault();
    const query = (directTerm ?? searchQuery).trim();
    if (!query) return;

    setSearching(true);
    // 1. Instant local index lookup (0ms response)
    const localMatches = getLocalInstantMatches(query);
    if (localMatches.length > 0) {
      setSearchResults(localMatches);
    }

    // Immediately explain the best matching medicine without forcing a second click
    const initialTarget = localMatches[0]?.canonical_name || (query.charAt(0).toUpperCase() + query.slice(1));
    void explainSelected({
      medicine_name: initialTarget,
      dose: "",
      frequency: "General Medical Knowledge Lookup",
      warnings: [],
      locked_instruction: "",
    });

    try {
      // 2. Fetch backend matches concurrently
      const apiResults = await api.searchMedicines(query, locale, 5);
      const combined = [...localMatches];
      for (const item of apiResults) {
        if (!combined.some((c) => c.canonical_name.toLowerCase() === item.canonical_name.toLowerCase())) {
          combined.push(item);
        }
      }
      if (combined.length === 0) {
        // Fallback candidate card so user always has an instant option to tap
        const clean = query.charAt(0).toUpperCase() + query.slice(1);
        combined.push({
          id: `med_${clean.toLowerCase()}`,
          entry_type: "medicine",
          canonical_name: clean,
          slug: clean.toLowerCase().replace(/\s+/g, "-"),
          aliases: [],
          body_system: "general",
          simple_en: `${clean} — Tap to learn educational guidance, general uses, and precautions.`,
          detailed_en: `${clean} is a therapeutic medicine. Always confirm dosages and directions with your doctor.`,
          localized_name: clean,
          source_name: "Verified Medical Knowledge",
          source_url: "https://medlineplus.gov",
        });
      }
      setSearchResults(combined);
    } catch {
      if (localMatches.length === 0) {
        const clean = query.charAt(0).toUpperCase() + query.slice(1);
        setSearchResults([
          {
            id: `med_${clean.toLowerCase()}`,
            entry_type: "medicine",
            canonical_name: clean,
            slug: clean.toLowerCase().replace(/\s+/g, "-"),
            aliases: [],
            body_system: "general",
            simple_en: `${clean} — Tap to learn educational guidance, general uses, and precautions.`,
            detailed_en: `${clean} is a therapeutic medicine. Always confirm dosages and directions with your doctor.`,
            localized_name: clean,
            source_name: "Verified Medical Knowledge",
            source_url: "https://medlineplus.gov",
          },
        ]);
      }
    } finally {
      setSearching(false);
    }
  }

  function handleQuickSearch(name: string) {
    setSearchQuery(name);
    void handleSearchMedicine(undefined, name);
    void explainSelected({
      medicine_name: name,
      dose: "",
      frequency: "General Medical Knowledge Lookup",
      warnings: [],
      locked_instruction: "",
    });
  }

  return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{copy.pageTitle}</h1>
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-2xl border-2 p-4 text-sm font-bold"
            style={{
              backgroundColor: "var(--ms-prov-uncertain-bg)",
              borderColor: "var(--ms-prov-uncertain-border)",
            }}
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--ms-prov-uncertain-border)" }} aria-hidden="true" />
            <span>{t.safety.medicineProhibition}</span>
          </div>
        </header>

        {/* Prescribed Medicines List */}
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">{copy.prescribedTitle}</h2>
          {loading ? (
            <div className="ms-card p-6 text-center text-sm font-bold">{copy.loadingMeds}</div>
          ) : meds.length === 0 ? (
            <div className="ms-card p-6 text-sm" style={{ color: "var(--ms-ink-muted)" }}>
              {copy.noMeds}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {meds.map((med, idx) => {
                const active = selectedMed?.medicine_name === med.medicine_name && selectedMed?.dose === med.dose;
                return (
                  <button
                    key={`${med.medicine_name}-${idx}`}
                    type="button"
                    onClick={() => void explainSelected(med)}
                    className="ms-card tap-target-lg flex items-start gap-3 p-4 text-left"
                    style={{
                      backgroundColor: active ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                      borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <Pill className="mt-1 h-6 w-6 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                    <div className="space-y-1">
                      <span className="block text-lg font-extrabold">
                        {med.medicine_name} {med.dose}
                      </span>
                      <span className="block text-sm font-semibold">{med.frequency}</span>
                      {med.warnings.length > 0 && (
                        <span className="block text-xs font-bold" style={{ color: "var(--ms-danger-ink)" }}>
                          Warning: {med.warnings[0]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Search General Medicine KB */}
        <section className="ms-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <Search className="h-4 w-4" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <span>{copy.searchTitle}</span>
            </h2>
            <span className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
              {copy.searchSubtitle}
            </span>
          </div>

          <form onSubmit={(e) => void handleSearchMedicine(e)} className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              <label htmlFor="med-search" className="sr-only">
                {copy.searchTitle}
              </label>
              <input
                id="med-search"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim().length >= 2) {
                    const instant = getLocalInstantMatches(val);
                    if (instant.length > 0) {
                      setSearchResults(instant);
                    }
                  }
                }}
                placeholder={copy.searchPlaceholder}
                className="tap-target flex-1 rounded-xl border-2 px-4 py-2.5 text-sm"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="ms-btn-secondary tap-target inline-flex items-center justify-center gap-2 px-4 text-sm min-w-[155px]"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>{copy.searchBtn}</span>
              </button>
            </div>
            {/* Clinical Advisory in really small font right below the text field */}
            <p className="text-[11px] font-medium leading-tight select-none pt-0.5" style={{ color: "var(--ms-ink-muted)" }}>
              {copy.clinicalAdvisory}
            </p>
          </form>

          {/* Continuous Moving Dots Loading Indicator just below the Search Medicine button */}
          {(searching || explaining) && (
            <div
              className="flex items-center gap-2 pt-1 text-sm font-extrabold"
              style={{ color: "var(--ms-primary)" }}
              role="status"
              aria-live="polite"
            >
              <span>{copy.loading}{dots}</span>
              <span className="inline-flex items-center gap-1.5" aria-hidden="true">
                <span
                  className="h-2 w-2 rounded-full animate-bounce [animation-delay:-0.32s]"
                  style={{ backgroundColor: "var(--ms-primary)" }}
                />
                <span
                  className="h-2 w-2 rounded-full animate-bounce [animation-delay:-0.16s]"
                  style={{ backgroundColor: "var(--ms-primary)" }}
                />
                <span
                  className="h-2 w-2 rounded-full animate-bounce"
                  style={{ backgroundColor: "var(--ms-primary)" }}
                />
              </span>
              <span className="text-xs font-semibold" style={{ color: "var(--ms-ink-muted)" }}>
                {explaining
                  ? `${copy.gatheringGuidance} ${selectedMed?.medicine_name || "medicine"}...`
                  : copy.searchingKB}
              </span>
            </div>
          )}

          {/* Quick Popular Medicines Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--ms-ink-muted)" }}>
              {copy.quickTap}
            </span>
            {[
              "Paracetamol (Dolo)",
              "Ibuprofen (Combiflam)",
              "Pantoprazole (Pan 40)",
              "Cetirizine",
              "Azithromycin",
              "Amoxicillin",
              "Metformin",
              "Atorvastatin",
            ].map((quickName) => (
              <button
                key={quickName}
                type="button"
                disabled={searching || explaining}
                onClick={() => handleQuickSearch(quickName.split(" ")[0])}
                className="tap-target inline-flex items-center gap-1 rounded-lg border-2 px-2.5 py-1 text-xs font-extrabold transition-all hover:scale-105"
                style={{
                  backgroundColor: "var(--ms-surface)",
                  borderColor: "var(--ms-border)",
                  color: "var(--ms-ink)",
                }}
              >
                <Pill className="h-3.5 w-3.5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                <span>{quickName}</span>
              </button>
            ))}
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--ms-ink-muted)" }}>
                {copy.searchResults}
              </span>
              <div className="flex flex-wrap gap-2">
                {searchResults.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() =>
                      void explainSelected({
                        medicine_name: item.canonical_name,
                        dose: "",
                        frequency: "General Medical Knowledge Lookup",
                        warnings: [],
                        locked_instruction: "",
                      })
                    }
                    className="tap-target rounded-xl border-2 px-3.5 py-2 text-sm font-bold transition-all hover:scale-105"
                    style={{
                      backgroundColor: "var(--ms-surface-alt)",
                      borderColor: "var(--ms-primary)",
                      color: "var(--ms-ink)",
                    }}
                  >
                    {item.canonical_name}
                  </button>
                ))}
              </div>
            </div>
          )}
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

        {/* Locked Doctor Prescription Banner */}
        {selectedMed && (
          <section
            className="rounded-2xl border-2 border-l-8 p-5 space-y-2"
            style={{
              backgroundColor: "var(--ms-prov-doctor-bg)",
              borderColor: "var(--ms-prov-doctor-border)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <Lock className="h-5 w-5" aria-hidden="true" />
                <span>{copy.doctorExactPrescription}</span>
              </h2>
              <button
                type="button"
                disabled={explaining}
                onClick={() => void explainSelected(selectedMed, locale)}
                className="ms-btn-primary tap-target inline-flex items-center gap-1.5 px-4 text-xs"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>{explaining ? "Updating..." : copy.refreshBtn}</span>
              </button>
            </div>
            {selectedMed.locked_instruction ? (
              <p className="text-base font-bold">{selectedMed.locked_instruction}</p>
            ) : (
              <p className="text-sm font-semibold">
                {copy.generalGuideNotice}
              </p>
            )}
          </section>
        )}

        {/* 10-Part KB-Grounded Medicine Breakdown */}
        {explaining ? (
          <div className="ms-card p-8 text-center font-bold">Loading medicine guide...</div>
        ) : explained && (
          <div className="space-y-5">
            <AudioPlayer
              text={`${explained.medicine_name}. ${explained.what_it_is ?? ""} ${explained.why_prescribed_for_you ?? ""} ${(explained.serious_warnings ?? []).join(". ")}`}
              language={locale}
              label={`Listen to ${explained.medicine_name} guide`}
            />

            <section className="ms-card p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-extrabold">{explained.medicine_name}</h2>
                  {explained.drug_class && (
                    <p className="text-sm font-bold" style={{ color: "var(--ms-primary)" }}>
                      Category: {explained.drug_class}
                    </p>
                  )}
                </div>
                {explained.brand_examples && explained.brand_examples.length > 0 && (
                  <span className="rounded-xl border px-3 py-1 text-xs font-bold" style={{ borderColor: "var(--ms-border)" }}>
                    Common brands: {explained.brand_examples.join(", ")}
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">{copy.whatItIs}</h3>
                  <p className="text-sm leading-relaxed">{explained.what_it_is}</p>
                </div>

                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">{copy.commonUses}</h3>
                  <p className="text-sm leading-relaxed">{explained.common_purposes}</p>
                </div>

                <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">{copy.howItWorks}</h3>
                  <p className="text-sm leading-relaxed">{explained.how_it_works}</p>
                </div>

                <div
                  className="rounded-xl border-2 p-4 space-y-1"
                  style={{
                    backgroundColor: "var(--ms-prov-ai-bg)",
                    borderColor: "var(--ms-prov-ai-border)",
                  }}
                >
                  <h3 className="text-sm font-extrabold uppercase">{copy.whyPrescribed}</h3>
                  <p className="text-sm font-semibold leading-relaxed">{explained.why_prescribed_for_you}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">{copy.sideEffects}</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(explained.common_side_effects ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div
                  className="rounded-xl border-2 p-4 space-y-2"
                  style={{
                    backgroundColor: "var(--ms-danger-bg)",
                    borderColor: "var(--ms-danger-border)",
                    color: "var(--ms-danger-ink)",
                  }}
                >
                  <h3 className="text-sm font-extrabold uppercase flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <span>{copy.seriousWarnings}</span>
                  </h3>
                  <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
                    {(explained.serious_warnings ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">{copy.precautions}</h3>
                  {explained.food_and_interactions && (
                    <p className="text-sm font-medium">{explained.food_and_interactions}</p>
                  )}
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(explained.precautions ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ms-border)" }}>
                  <h3 className="text-sm font-extrabold uppercase">{copy.adherence}</h3>
                  <p className="text-sm leading-relaxed">{explained.adherence_guidance}</p>
                </div>
              </div>

              {(explained.questions_for_doctor ?? []).length > 0 && (
                <div
                  className="rounded-xl border p-4 space-y-2"
                  style={{
                    backgroundColor: "var(--ms-surface-alt)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <h3 className="text-sm font-extrabold uppercase">{copy.questionsForDoctor}</h3>
                  <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
                    {(explained.questions_for_doctor ?? []).map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {explained.citations && explained.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {explained.citations.map((cit, i) => (
                    <a
                      key={i}
                      href={cit.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-target inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold underline"
                      style={{ borderColor: "var(--ms-border)" }}
                    >
                      <span>{copy.sourcesTitle} {cit.source_name}</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            {explained.provenance && <ProvenanceCards provenance={explained.provenance} />}

            <DiagramViewer
              diagramId={
                explained.diagram?.id ||
                (explained.medicine_name.toLowerCase().includes("amlodipine")
                  ? "heart_circulation_bp"
                  : "digestive_med_pathway")
              }
              diagram={explained.diagram}
              language={locale}
            />

            {/* Safety disclaimer at bottom of page */}
            <div
              className="rounded-xl border p-3 text-center text-xs font-semibold"
              style={{
                backgroundColor: "var(--ms-surface-alt)",
                borderColor: "var(--ms-border)",
                color: "var(--ms-ink-muted)",
              }}
            >
              {copy.clinicalAdvisory}
            </div>
          </div>
        )}
      </div>
  );
}

export default function PatientMedicinesPage() {
  return (
    <PatientGate>
      <MedicinesWorkspace />
    </PatientGate>
  );
}
