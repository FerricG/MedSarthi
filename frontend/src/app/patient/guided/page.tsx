"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  Clock,
  Edit3,
  FileCheck2,
  FileText,
  Languages,
  LogIn,
  MessageCircle,
  Pill,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Moon,
  Upload,
  UserCheck,
  AlertTriangle,
  ExternalLink,
  FlaskConical,
  Globe,
  Image as ImageIcon,
  Zap,
} from "lucide-react";
import { InteractiveNarrator, type NarratorPose } from "@/components/InteractiveNarrator";
import { QrPhoneUploadPanel } from "@/components/QrPhoneUploadPanel";
import { ReportsWorkspace } from "@/components/ReportsWorkspace";
import { SearchingIndicator } from "@/components/SearchingIndicator";
import { VisualArtifactViewer } from "@/components/VisualArtifactViewer";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LOCALES, type SupportedLocale, useI18n } from "@/i18n/I18nProvider";
import { getClinicalAdvisory } from "@/lib/clinicalAdvisory";
import {
  api,
  ApiError,
  type CitationRef,
  type MedicalDocumentDTO,
  type ProvenancePayload,
  type VisualArtifactDTO,
} from "@/lib/api";

interface GuidedChatMessage {
  role: "patient" | "assistant";
  text: string;
  visual_artifact?: VisualArtifactDTO | null;
  citations?: CitationRef[];
}

const GUIDED_NARRATOR_SCRIPTS: Record<
  SupportedLocale,
  {
    step1: string;
    step2: string;
    step3Confirmed: (name: string, age: string, gender: string) => string;
    step3Editing: string;
    step4Default: string;
    step5Default: string;
    step6Prompt: string;
    step6Rated: string;
    stepLabels: string[];
  }
> = {
  en: {
    step1: "Namaste! I am Dr. Sarthi. I will help you understand your prescription in English. You can tap the big green button to start right away without any account, or sign in if you want Email or SMS alerts.",
    step2: "Please take a clear photo of your prescription, upload a picture, or tap Sample Prescription so I can read it for you.",
    step3Confirmed: (name, age, gender) => `I read your name as ${name}, age ${age}, and gender ${gender}. Is this correct?`,
    step3Editing: "No problem! Please say your name, age, and gender using the microphone button, or type it below.",
    step4Default: "Here is your simple medicine guide.",
    step5Default: "Do you have any questions about your medicines or prescription? You can speak with the microphone or type your question.",
    step6Prompt: "Your prescription and questions are safely recorded! A doctor will check everything within 24 hours. Please tap a star below to rate how helpful I was today.",
    step6Rated: "Thank you so much for your rating! A doctor will verify your prescription and questions within 24 hours. Take care!",
    stepLabels: ["Start", "Prescription Photo", "Check Details", "Medicines", "Questions", "Review & Rating"],
  },
  hi: {
    step1: "नमस्ते! मैं डॉ. सारथी हूँ। मैं आपकी पर्ची को हिन्दी में समझने में आपकी मदद करूँगी। आप बिना किसी खाते के तुरंत शुरू करने के लिए बड़े हरे बटन पर टैप कर सकते हैं, या ईमेल व एसएमएस अलर्ट के लिए साइन इन कर सकते हैं।",
    step2: "कृपया अपनी पर्ची की एक साफ़ तस्वीर लें, फ़ोटो अपलोड करें, या सैंपल पर्ची पर टैप करें ताकि मैं इसे आपके लिए पढ़ सकूँ।",
    step3Confirmed: (name, age, gender) => `मैंने आपका नाम ${name}, उम्र ${age}, और लिंग ${gender} पढ़ा है। क्या यह सही है?`,
    step3Editing: "कोई बात नहीं! कृपया माइक्रोफ़ोन बटन दबाकर अपना नाम, उम्र और लिंग बताएं या नीचे लिखें।",
    step4Default: "यह आपकी दवाइयों की सरल और स्पष्ट जानकारी है।",
    step5Default: "क्या आपकी दवाइयों या पर्ची के बारे में आपका कोई सवाल है? आप माइक्रोफ़ोन से बोल सकते हैं या अपना सवाल लिख सकते हैं।",
    step6Prompt: "आपकी पर्ची और सवाल सुरक्षित रूप से दर्ज कर लिए गए हैं! 24 घंटे के अंदर डॉक्टर सब कुछ जाँचेंगे। कृपया नीचे तारा दबाकर बताएं कि आज मेरी मदद कैसी लगी।",
    step6Rated: "रेटिंग देने के लिए बहुत-बहुत धन्यवाद! डॉक्टर 24 घंटे में आपकी पर्ची की जाँच करेंगे। अपना ख़्याल रखें!",
    stepLabels: ["शुरू करें", "पर्ची की फोटो", "विवरण जांचें", "दवाइयाँ", "प्रश्न पूछें", "समीक्षा और रेटिंग"],
  },
  "hi-Latn": {
    step1: "Namaste! Main Dr. Sarthi hoon. Main aapki prescription ko Hinglish mein samajhne mein madad karungi. Aap bina kisi account ke turant start karne ke liye bade green button par tap kar sakte hain, ya Email aur SMS alerts ke liye sign in kar sakte hain.",
    step2: "Kripya apni prescription ki saaf photo lein, picture upload karein, ya Sample Prescription par tap karein taaki main ise aapke liye padh sakun.",
    step3Confirmed: (name, age, gender) => `Maine aapka naam ${name}, age ${age}, aur gender ${gender} padha hai. Kya yeh sahi hai?`,
    step3Editing: "Koi baat nahi! Kripya microphone button dabakar apna naam, age aur gender batayein ya neeche type karein.",
    step4Default: "Yeh aapki dawaiyon ki saral guide hai.",
    step5Default: "Kya aapki dawaiyon ya prescription ke baare mein aapka koi sawaal hai? Aap mic se bol sakte hain ya type kar sakte hain.",
    step6Prompt: "Aapki prescription aur questions safely record ho gaye hain! 24 ghante ke andar doctor sab check karenge. Kripya neeche star tap karke batayein ki meri madad kaisi lagi.",
    step6Rated: "Rating dene ke liye bahut-bahut shukriya! Doctor 24 ghante mein aapki prescription verify karenge. Apna khayal rakhein!",
    stepLabels: ["Start", "Prescription Photo", "Details Check", "Medicines", "Questions", "Review & Rating"],
  },
  bn: {
    step1: "নমস্কার! আমি ডঃ সারথি। আপনার প্রেসক্রিপশন বাংলায় বুঝতে আমি সাহায্য করব। অ্যাকাউন্ট ছাড়াই শুরু করতে বড় সবুজ বোতামে চাপুন, অথবা অ্যালার্ট পেতে সাইন ইন করুন।",
    step2: "দয়া করে আপনার প্রেসক্রিপশনের একটি পরিষ্কার ছবি তুলুন, ছবি আপলোড করুন, বা নমুনা প্রেসক্রিপশনে চাপুন যাতে আমি এটি পড়ে শোনাতে পারি।",
    step3Confirmed: (name, age, gender) => `আমি আপনার নাম ${name}, বয়স ${age}, এবং লিঙ্গ ${gender} পড়েছি। এটি কি সঠিক?`,
    step3Editing: "কোনো সমস্যা নেই! মাইক্রোফোন বোতাম ব্যবহার করে আপনার নাম, বয়স এবং লিঙ্গ বলুন বা নিচে লিখুন।",
    step4Default: "এখানে আপনার ওষুধের সহজ নির্দেশিকা রয়েছে।",
    step5Default: "আপনার ওষুধ বা প্রেসক্রিপশন সম্পর্কে কোনো প্রশ্ন আছে? আপনি মাইকে বলতে পারেন বা লিখে জানাতে পারেন।",
    step6Prompt: "আপনার প্রেসক্রিপশন ও প্রশ্ন নিরাপদে সংরক্ষিত হয়েছে! ২৪ ঘণ্টার মধ্যে একজন ডাক্তার সবকিছু পরীক্ষা করবেন। রেটিং দিতে নিচে স্টারে ট্যাপ করুন।",
    step6Rated: "রেটিং দেওয়ার জন্য অনেক ধন্যবাদ! ২৪ ঘণ্টার মধ্যে ডাক্তার সবকিছু যাচাই করবেন। ভালো থাকবেন!",
    stepLabels: ["শুরু", "প্রেসক্রিপশন ছবি", "বিবরণ পরীক্ষা", "ওষুধ", "প্রশ্ন", "রেটিং"],
  },
  mr: {
    step1: "नमस्ते! मी डॉ. सारथी आहे. तुमची डॉक्टरांची चिठ्ठी मराठीत समजून घेण्यासाठी मी मदत करेन. खात्याशिवाय सुरू करण्यासाठी मोठ्या हिरव्या बटनावर टॅप करा, किंवा अलर्टसाठी साइन इन करा.",
    step2: "कृपया तुमच्या प्रिस्क्रिप्शनचा स्पष्ट फोटो घ्या, फोटो अपलोड करा किंवा नमुना प्रिस्क्रिप्शनवर टॅप करा जेणेकरून मी ते वाचू शकेन.",
    step3Confirmed: (name, age, gender) => `मी तुमचे नाव ${name}, वय ${age}, आणि लिंग ${gender} वाचले आहे. हे बरोबर आहे का?`,
    step3Editing: "काही हरकत नाही! मायक्रोफोन बटण दाबून तुमचे नाव, वय आणि लिंग सांगा किंवा खाली टाईप करा.",
    step4Default: "येथे तुमच्या औषधांची सोपी माहिती आहे.",
    step5Default: "तुमच्या औषधांबद्दल किंवा प्रिस्क्रिप्शनबद्दल काही प्रश्न आहेत का? तुम्ही बोलू शकता किंवा टाईप करू शकता.",
    step6Prompt: "तुमचे प्रिस्क्रिप्शन आणि प्रश्न सुरक्षितपणे नोंदवले गेले आहेत! २४ तासांत डॉक्टर सर्व तपासतील. कृपया खालील स्टारवर टॅप करून अभिप्राय द्या.",
    step6Rated: "अभिप्राय दिल्याबद्दल धन्यवाद! डॉक्टर २४ तासांत तपासणी करतील. काळजी घ्या!",
    stepLabels: ["सुरू करा", "प्रिस्क्रिप्शन फोटो", "माहिती तपासा", "औषधे", "प्रश्न", "अभिप्राय"],
  },
  ta: {
    step1: "வணக்கம்! நான் டாக்டர் சாரதி. உங்கள் மருத்துவச் சீட்டைத் தமிழில் புரிந்துகொள்ள நான் உங்களுக்கு உதவுவேன். கணக்கு இல்லாமல் தொடங்க பெரிய பச்சை பொத்தானைத் தட்டவும்.",
    step2: "தயவுசெய்து உங்கள் மருத்துவச் சீட்டின் தெளிவான புகைப்படத்தை எடுக்கவும், அல்லது பதிவேற்றவும், அல்லது மாதிரிச் சீட்டைத் தட்டவும்.",
    step3Confirmed: (name, age, gender) => `உங்கள் பெயர் ${name}, வயது ${age}, மற்றும் பாலினம் ${gender} எனப் படித்துள்ளேன். இது சரியானதா?`,
    step3Editing: "பரவாயில்லை! மைக்ரோஃபோன் பொத்தானைப் பயன்படுத்தி உங்கள் பெயர், வயது, மற்றும் பாலினத்தைக் கூறவும்.",
    step4Default: "இங்கே உங்கள் மருந்துகளின் எளிய வழிகாட்டி உள்ளது.",
    step5Default: "உங்கள் மருந்துகள் அல்லது மருத்துவச் சீட்டு பற்றி ஏதேனும் கேள்விகள் உள்ளதா? நீங்கள் பேசலாம் அல்லது தட்டச்சு செய்யலாம்.",
    step6Prompt: "உங்கள் மருத்துவச் சீட்டும் கேள்விகளும் பாதுகாப்பாகப் பதிவு செய்யப்பட்டுள்ளன! 24 மணி நேரத்திற்குள் மருத்துவர் சரிபார்ப்பார். மதிப்பீடு செய்ய கீழே உள்ள நட்சத்திரத்தைத் தட்டவும்.",
    step6Rated: "மதிப்பீடு செய்ததற்கு மிக்க நன்றி! 24 மணி நேரத்திற்குள் மருத்துவர் சரிபார்ப்பார். நலமுடன் இருங்கள்!",
    stepLabels: ["தொடங்கு", "சீட்டு புகைப்படம்", "விவரங்கள்", "மருந்துகள்", "கேள்விகள்", "மதிப்பீடு"],
  },
  te: {
    step1: "నమస్కారం! నేను డాక్టర్ సారథి. మీ ప్రిస్క్రిప్షన్‌ను తెలుగులో అర్థం చేసుకోవడానికి నేను మీకు సహాయం చేస్తాను. ఖాతా లేకుండా ప్రారంభించడానికి పెద్ద ఆకుపచ్చ బటన్‌ను నొక్కండి.",
    step2: "దయచేసి మీ ప్రిస్క్రిప్షన్ యొక్క స్పష్టమైన ఫోటో తీయండి, అప్‌లోడ్ చేయండి లేదా శాంపిల్ ప్రిస్క్రిప్షన్‌ను నొక్కండి.",
    step3Confirmed: (name, age, gender) => `నేను మీ పేరు ${name}, వయస్సు ${age}, మరియు లింగం ${gender} గా చదివాను. ఇది సరైనదేనా?`,
    step3Editing: "పర్వాలేదు! మైక్రోఫోన్ బటన్ ఉపయోగించి మీ పేరు, వయస్సు, మరియు లింగం చెప్పండి.",
    step4Default: "ఇది మీ మందుల సరళమైన గైడ్.",
    step5Default: "మీ మందులు లేదా ప్రిస్క్రిప్షన్ గురించి ఏవైనా ప్రశ్నలు ఉన్నాయా? మీరు మాట్లాడవచ్చు లేదా టైప్ చేయవచ్చు.",
    step6Prompt: "మీ ప్రిస్క్రిప్షన్ మరియు ప్రశ్నలు సురక్షితంగా రికార్డ్ చేయబడ్డాయి! 24 గంటల్లో డాక్టర్ అన్నింటినీ తనిਖీ చేస్తారు. రేటింగ్ ఇవ్వడానికి క్రింద స్టార్‌పై నొక్కండి.",
    step6Rated: "రేటింగ్ ఇచ్చినందుకు చాలా ధన్యవాదాలు! 24 గంటల్లో డాక్టర్ పరిశీలిస్తారు. జాగ్రత్తగా ఉండండి!",
    stepLabels: ["ప్రారంభం", "ఫోటో తీయండి", "వివరాలు", "మందులు", "ప్రశ్నలు", "రేటింగ్"],
  },
  gu: {
    step1: "નમસ્તે! હું ડૉ. સારથી છું. તમારા પ્રિસ્ક્રિપ્શનને ગુજરાતીમાં સમજવામાં હું તમારી મદદ કરીશ. ખાતા વિના શરૂ કરવા માટે મોટા લીલા બટન પર ટૅપ કરો.",
    step2: "કૃપા કરીને તમારા પ્રિસ્ક્રિપ્શનનો સ્પષ્ટ ફોટો લો, અપલોડ કરો, અથવા સેમ્પલ પ્રિસ્ક્રિપ્શન પર ટૅપ કરો જેથી હું તમારા માટે વાંચી શકું.",
    step3Confirmed: (name, age, gender) => `મેં તમારું નામ ${name}, ઉંમર ${age}, અને જાતિ ${gender} વાંચ્યું છે. શું આ સાચું છે?`,
    step3Editing: "વાંધો નહીં! માઇક્રોફોન બટન દબાવીને તમારું નામ, ઉંમર અને જાતિ જણાવો.",
    step4Default: "અહીં તમારી દવાઓની સરળ માર્ગદર્શિકા છે.",
    step5Default: "શું તમારી દવાઓ કે પ્રિસ્ક્રિપ્શન વિશે કોઈ પ્રશ્ન છે? તમે માઇક્રોફોનથી બોલી શકો છો અથવા ટાઇપ કરી શકો છો.",
    step6Prompt: "તમારું પ્રિસ્ક્રિપ્શન અને પ્રશ્નો સુરક્ષિત રીતે રેકોર્ડ થઈ ગયા છે! 24 કલાકમાં ડૉક્ટર બધું તપાસશે. રેટિંગ આપવા માટે નીચે સ્ટાર પર ટૅપ કરો.",
    step6Rated: "રેટિંગ આપવા બદલ ખૂબ ખૂબ આભાર! 24 કલાકમાં ડૉક્ટર તપાસ કરશે. કાળજી રાખો!",
    stepLabels: ["શરૂઆત", "ફોટો લો", "વિગતો", "દવાઓ", "પ્રશ્નો", "રેટિંગ"],
  },
  kn: {
    step1: "ನಮಸ್ಕಾರ! ನಾನು ಡಾ. ಸಾರಥಿ. ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅನ್ನು ಕನ್ನಡದಲ್ಲಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ಖಾತೆ ಇಲ್ಲದೆ ಪ್ರಾರಂಭಿಸಲು ದೊಡ್ಡ ಹಸಿರು ಬಟನ್ ಟ್ಯಾಪ್ ಮಾಡಿ.",
    step2: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ನ ಸ್ಪಷ್ಟ ಫೋಟೋ ತೆಗೆದುಕೊಳ್ಳಿ, ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಅಥವಾ ಮಾದರಿ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.",
    step3Confirmed: (name, age, gender) => `ನಾನು ನಿಮ್ಮ ಹೆಸರು ${name}, ವಯಸ್ಸು ${age}, ಮತ್ತು ಲಿಂಗ ${gender} ಎಂದು ಓದಿದ್ದೇನೆ. ಇದು ಸರಿಯೇ?`,
    step3Editing: "ತೊಂದರೆಯಿಲ್ಲ! ಮೈಕ್ರೊಫೋನ್ ಬಟನ್ ಬಳಸಿ ನಿಮ್ಮ ಹೆಸರು, ವಯಸ್ಸು ಮತ್ತು ಲಿಂಗವನ್ನು ಹೇಳಿ.",
    step4Default: "ಇಲ್ಲಿ ನಿಮ್ಮ ಔಷಧಿಗಳ ಸರಳ ಮಾರ್ಗದರ್ಶಿಯಿದೆ.",
    step5Default: "ನಿಮ್ಮ ಔಷಧಿಗಳು ಅಥವಾ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಬಗ್ಗೆ ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳಿವೆಯೇ? ನೀವು ಮಾತನಾಡಬಹುದು ಅಥವಾ ಟೈಪ್ ಮಾಡಬಹುದು.",
    step6Prompt: "ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಮತ್ತು ಪ್ರಶ್ನೆಗಳು ಸುರಕ್ಷಿತವಾಗಿ ದಾಖಲಾಗಿವೆ! 24 ಗಂಟೆಗಳಲ್ಲಿ ವೈದ್ಯರು ಎಲ್ಲವನ್ನೂ ಪರಿಶೀಲಿಸುತ್ತಾರೆ. ರೇಟಿಂಗ್ ನೀಡಲು ಕೆಳಗಿನ ನಕ್ಷತ್ರವನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.",
    step6Rated: "ರೇಟಿಂಗ್ ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು! 24 ಗಂಟೆಗಳಲ್ಲಿ ವೈದ್ಯರು ಪರಿಶೀಲಿಸುತ್ತಾರೆ. ಜಾಗರೂಕರಾಗಿರಿ!",
    stepLabels: ["ಪ್ರಾರಂಭ", "ಫೋಟೋ ತೆಗೆಯಿರಿ", "ವಿವರಗಳು", "ಔಷಧಿಗಳು", "ಪ್ರಶ್ನೆಗಳು", "ರೇಟಿಂಗ್"],
  },
  ml: {
    step1: "നമസ്കാരം! ഞാൻ ഡോ. സാരഥി. നിങ്ങളുടെ കുറിപ്പടി മലയാളത്തിൽ മനസ്സിലാക്കാൻ ഞാൻ സഹായിക്കാം. അക്കൗണ്ട് ഇല്ലാതെ ആരംഭിക്കാൻ വലിയ പച്ച ബട്ടണിൽ ടാപ്പ് ചെയ്യുക.",
    step2: "ദയവായി നിങ്ങളുടെ കുറിപ്പടിയുടെ വ്യക്തമായ ഫോട്ടോ എടുക്കുക, അപ്‌ലോഡ് ചെയ്യുക, അല്ലെങ്കിൽ സാമ്പിൾ കുറിപ്പടിയിൽ ടാപ്പ് ചെയ്യുക.",
    step3Confirmed: (name, age, gender) => `ഞാൻ നിങ്ങളുടെ പേര് ${name}, പ്രായം ${age}, ലിംഗം ${gender} എന്ന് വായിച്ചു. ഇത് ശരിയാണോ?`,
    step3Editing: "സാരമില്ല! മൈക്രോഫോൺ ബട്ടൺ ഉപയോഗിച്ച് നിങ്ങളുടെ പേര്, പ്രായം, ലിംഗഭേദം എന്നിവ പറയുക.",
    step4Default: "ഇതാ നിങ്ങളുടെ മരുന്നുകളുടെ ലളിതമായ വിവരങ്ങൾ.",
    step5Default: "നിങ്ങളുടെ മരുന്നുകളെക്കുറിച്ചോ കുറിപ്പടിയെക്കുറിച്ചോ എന്തെങ്കിലും ചോദ്യങ്ങളുണ്ടോ? സംസാരിക്കുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യാം.",
    step6Prompt: "നിങ്ങളുടെ കുറിപ്പടിയും ചോദ്യങ്ങളും സുരക്ഷിതമായി രേഖപ്പെടുത്തിയിട്ടുണ്ട്! 24 മണിക്കൂറിനുള്ളിൽ ഡോക്ടർ എല്ലാം പരിശോധിക്കും. താഴെ സ്റ്റാറിൽ ടാപ്പ് ചെയ്യുക.",
    step6Rated: "റേറ്റിംഗ് നൽകിയതിന് നന്ദി! 24 മണിക്കൂറിനുള്ളിൽ ഡോക്ടർ പരിശോധിക്കും. ആരോഗ്യവാനായിരിക്കുക!",
    stepLabels: ["ആരംഭം", "ഫോട്ടോ എടുക്കുക", "വിവരങ്ങൾ", "മരുന്നുകൾ", "ചോദ്യങ്ങൾ", "റേറ്റിംഗ്"],
  },
  pa: {
    step1: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਡਾ. ਸਾਰਥੀ ਹਾਂ। ਤੁਹਾਡੀ ਪਰਚੀ ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ ਸਮਝਣ ਵਿੱਚ ਮੈਂ ਮਦਦ ਕਰਾਂਗੀ। ਖਾਤੇ ਤੋਂ ਬਿਨਾਂ ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਵੱਡੇ ਹਰੇ ਬਟਨ 'ਤੇ ਟੈਪ ਕਰੋ।",
    step2: "ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਪਰਚੀ ਦੀ ਇੱਕ ਸਾਫ਼ ਫੋਟੋ ਲਓ, ਅੱਪਲੋਡ ਕਰੋ, ਜਾਂ ਸੈਂਪਲ ਪਰਚੀ 'ਤੇ ਟੈਪ ਕਰੋ ਤਾਂ ਜੋ ਮੈਂ ਇਸਨੂੰ ਪੜ੍ਹ ਸਕਾਂ।",
    step3Confirmed: (name, age, gender) => `ਮੈਂ ਤੁਹਾਡਾ ਨਾਮ ${name}, ਉਮਰ ${age}, ਅਤੇ ਲਿੰਗ ${gender} ਪੜ੍ਹਿਆ ਹੈ। ਕੀ ਇਹ ਸਹੀ ਹੈ?`,
    step3Editing: "ਕੋਈ ਗੱਲ ਨਹੀਂ! ਮਾਈਕ੍ਰੋਫੋਨ ਬਟਨ ਦੀ ਵਰਤੋਂ ਕਰਕੇ ਆਪਣਾ ਨਾਮ, ਉਮਰ ਅਤੇ ਲਿੰਗ ਦੱਸੋ।",
    step4Default: "ਇੱਥੇ ਤੁਹਾਡੀਆਂ ਦਵਾਈਆਂ ਦੀ ਸਰਲ ਜਾਣਕਾਰੀ ਹੈ।",
    step5Default: "ਕੀ ਤੁਹਾਡੀਆਂ ਦਵਾਈਆਂ ਜਾਂ ਪਰਚੀ ਬਾਰੇ ਕੋਈ ਸਵਾਲ ਹੈ? ਤੁਸੀਂ ਮਾਈਕ੍ਰੋਫੋਨ ਨਾਲ ਬੋਲ ਸਕਦੇ ਹੋ ਜਾਂ ਟਾਈਪ ਕਰ ਸਕਦੇ ਹੋ।",
    step6Prompt: "ਤੁਹਾਡੀ ਪਰਚੀ ਅਤੇ ਸਵਾਲ ਸੁਰੱਖਿਅਤ ਦਰਜ ਹੋ ਗਏ ਹਨ! 24 ਘੰਟਿਆਂ ਦੇ ਅੰਦਰ ਡਾਕਟਰ ਸਭ ਕੁਝ ਚੈੱਕ ਕਰਨਗੇ। ਕਿਰਪਾ ਕਰਕੇ ਹੇਠਾਂ ਸਟਾਰ 'ਤੇ ਟੈਪ ਕਰੋ।",
    step6Rated: "ਰੇਟਿੰਗ ਦੇਣ ਲਈ ਬਹੁਤ ਧੰਨਵਾਦ! ਡਾਕਟਰ 24 ਘੰਟਿਆਂ ਦੇ ਅੰਦਰ ਜਾਂਚ ਕਰਨਗੇ। ਆਪਣਾ ਖ਼ਿਆਲ ਰੱਖੋ!",
    stepLabels: ["ਸ਼ੁਰੂ", "ਫੋਟੋ ਲਓ", "ਵੇਰਵੇ", "ਦਵਾਈਆਂ", "ਸਵਾਲ", "ਰੇਟਿੰਗ"],
  },
};

const GUIDED_PAGE_COPY: Record<
  SupportedLocale,
  {
    card1Title: string;
    continueWithoutLogin: string;
    continueWithoutLoginSub: string;
    hideLoginForm: string;
    showLoginForm: string;
    demoPatient: string;
    signIn: string;
    createAccount: string;
    signInAndContinue: string;
    createAndContinue: string;
    emailOrPhonePlaceholder: string;
    fullNamePlaceholder: string;
    passwordPlaceholder: string;
    createPasswordPlaceholder: string;
    pleaseWait: string;
    card2Title: string;
    takePhotoOrUpload: string;
    readingPrescription: string;
    cameraPhotoPdf: string;
    trySamplePrescription: string;
    instantSynthetic: string;
    scanQrTitle: string;
    switchToFullReports: string;
    card3Title: string;
    nameLabel: string;
    ageLabel: string;
    genderLabel: string;
    years: string;
    notFound: string;
    notSpecified: string;
    yesThisIsCorrect: string;
    noLetMeFixIt: string;
    preparing: string;
    yourNameEdit: string;
    yourAgeEdit: string;
    enterYourName: string;
    genderEdit: string;
    male: string;
    female: string;
    otherGender: string;
    saveAndConfirm: string;
    savingAndExplaining: string;
    card4Title: string;
    nextQA: string;
    importantInstructions: string;
    whyGiven: string;
    card5Title: string;
    yesIHaveAQuestion: string;
    noQuestionsFinish: string;
    typeQuestionPlaceholder: string;
    askBtn: string;
    starterQ1: string;
    starterQ2: string;
    starterQ3: string;
    doneAskingBtn: string;
    savingConversation: string;
    verifiedCitations: string;
    card6Title: string;
    recordedHeading: string;
    doctorReviewEta: string;
    notificationFramework: string;
    rateDrSarthi: string;
    thankYouFeedback: string;
    feedbackPlaceholder: string;
    saveFeedbackBtn: string;
    scanAnother: string;
    openDetailed: string;
  }
> = {
  en: {
    card1Title: "1. Start Easily",
    continueWithoutLogin: "Continue Without Login (Default)",
    continueWithoutLoginSub: "Start immediately — no password or email needed",
    hideLoginForm: "Hide Login Form",
    showLoginForm: "Sign In / Create Account (for Email/SMS Alerts)",
    demoPatient: "Demo Patient",
    signIn: "Sign In",
    createAccount: "Create Account",
    signInAndContinue: "Sign In & Continue",
    createAndContinue: "Create Account & Continue",
    emailOrPhonePlaceholder: "Email or Phone Number",
    fullNamePlaceholder: "Your Full Name",
    passwordPlaceholder: "Password",
    createPasswordPlaceholder: "Create Password (min 8 characters)",
    pleaseWait: "Please wait...",
    card2Title: "2. Show Your Prescription",
    takePhotoOrUpload: "Take Photo / Upload",
    readingPrescription: "Reading Prescription...",
    cameraPhotoPdf: "Camera, Photo, or PDF",
    trySamplePrescription: "Try Sample Prescription",
    instantSynthetic: "Instant synthetic prescription test",
    scanQrTitle: "Or Scan QR from Phone (Any Network)",
    switchToFullReports: "Or switch to Full Reports Page (with Section Narrator)",
    card3Title: "3. Check Your Details",
    nameLabel: "Name",
    ageLabel: "Age",
    genderLabel: "Gender",
    years: "yrs",
    notFound: "Not found",
    notSpecified: "Not specified",
    yesThisIsCorrect: "Yes, This is Correct",
    noLetMeFixIt: "No, Let Me Fix It",
    preparing: "Preparing...",
    yourNameEdit: "Your Name (Type or Speak)",
    yourAgeEdit: "Your Age (Type or Speak)",
    enterYourName: "Enter your name",
    genderEdit: "Gender",
    male: "Male",
    female: "Female",
    otherGender: "Other",
    saveAndConfirm: "Save Details & Explain Prescription →",
    savingAndExplaining: "Saving & Explaining...",
    card4Title: "4. Your Medicines in Simple Words",
    nextQA: "Next: Questions & Answers",
    importantInstructions: "Important Doctor Instructions & Timings",
    whyGiven: "Why These Medicines Are Given",
    card5Title: "5. Do You Have Any Questions?",
    yesIHaveAQuestion: "Yes, I Have a Question",
    noQuestionsFinish: "No Questions, Finish →",
    typeQuestionPlaceholder: "Type your question here...",
    askBtn: "Ask",
    starterQ1: "When should I take my medicine?",
    starterQ2: "Should I take it before or after food?",
    starterQ3: "When should I see the doctor again?",
    doneAskingBtn: "Done Asking — Save & Finish →",
    savingConversation: "Saving Conversation...",
    verifiedCitations: "Verified Citations & Trusted Sources",
    card6Title: "6. Saved for 24-Hour Doctor Verification",
    recordedHeading: "Prescription & Q&A Conversation Recorded",
    doctorReviewEta: "A qualified doctor will review your prescription explanation and recorded conversation within 24 hours.",
    notificationFramework: "Notification Framework",
    rateDrSarthi: "How helpful was Dr. Sarthi today?",
    thankYouFeedback: "Thank you! Your feedback has been safely recorded.",
    feedbackPlaceholder: "Optional feedback (type or speak)...",
    saveFeedbackBtn: "Save Feedback",
    scanAnother: "Scan Another Prescription",
    openDetailed: "Open Detailed Dashboard",
  },
  hi: {
    card1Title: "1. आसानी से शुरू करें",
    continueWithoutLogin: "बिना लॉगिन के आगे बढ़ें (डिफ़ॉल्ट)",
    continueWithoutLoginSub: "तुरंत शुरू करें — पासवर्ड या ईमेल की ज़रूरत नहीं",
    hideLoginForm: "लॉगिन फॉर्म छिपाएं",
    showLoginForm: "साइन इन / खाता बनाएं (ईमेल/एसएमएस अलर्ट के लिए)",
    demoPatient: "डेमो मरीज़",
    signIn: "साइन इन करें",
    createAccount: "खाता बनाएं",
    signInAndContinue: "साइन इन करें और आगे बढ़ें",
    createAndContinue: "खाता बनाएं और आगे बढ़ें",
    emailOrPhonePlaceholder: "ईमेल या फोन नंबर",
    fullNamePlaceholder: "आपका पूरा नाम",
    passwordPlaceholder: "पासवर्ड",
    createPasswordPlaceholder: "पासवर्ड बनाएं (कम से कम 8 अक्षर)",
    pleaseWait: "कृपया प्रतीक्षा करें...",
    card2Title: "2. अपनी पर्ची दिखाएं",
    takePhotoOrUpload: "फोटो लें / अपलोड करें",
    readingPrescription: "पर्ची पढ़ी जा रही है...",
    cameraPhotoPdf: "कैमरा, फोटो या पीडीएफ",
    trySamplePrescription: "सैंपल पर्ची आज़माएं",
    instantSynthetic: "तुरंत टेस्ट पर्ची देखें",
    scanQrTitle: "या फोन से क्यूआर स्कैन करें (किसी भी नेटवर्क से)",
    switchToFullReports: "या पूरी रिपोर्ट पेज पर जाएं (सेक्शन नैरेटर सहित)",
    card3Title: "3. अपना विवरण जांचें",
    nameLabel: "नाम",
    ageLabel: "उम्र",
    genderLabel: "लिंग",
    years: "वर्ष",
    notFound: "नहीं मिला",
    notSpecified: "अनिर्दिष्ट",
    yesThisIsCorrect: "हाँ, यह सही है",
    noLetMeFixIt: "नहीं, मुझे ठीक करने दें",
    preparing: "तैयारी हो रही है...",
    yourNameEdit: "आपका नाम (लिखें या बोलें)",
    yourAgeEdit: "आपकी उम्र (लिखें या बोलें)",
    enterYourName: "अपना नाम दर्ज करें",
    genderEdit: "लिंग",
    male: "पुरुष",
    female: "महिला",
    otherGender: "अन्य",
    saveAndConfirm: "विवरण सहेजें और पर्ची समझें →",
    savingAndExplaining: "सहेजा और समझाया जा रहा है...",
    card4Title: "4. आपकी दवाइयाँ सरल शब्दों में",
    nextQA: "आगे: प्रश्न और उत्तर",
    importantInstructions: "डॉक्टर के महत्वपूर्ण निर्देश और समय",
    whyGiven: "ये दवाइयाँ क्यों दी गई हैं",
    card5Title: "5. क्या आपका कोई सवाल है?",
    yesIHaveAQuestion: "हाँ, मेरा एक सवाल है",
    noQuestionsFinish: "कोई सवाल नहीं, समाप्त करें →",
    typeQuestionPlaceholder: "अपना सवाल यहाँ लिखें...",
    askBtn: "पूछें",
    starterQ1: "मुझे अपनी दवा कब लेनी चाहिए?",
    starterQ2: "क्या मुझे इसे खाने से पहले या बाद में लेना चाहिए?",
    starterQ3: "मुझे दोबारा डॉक्टर को कब दिखाना चाहिए?",
    doneAskingBtn: "सवाल पूरे हुए — सहेजें और समाप्त करें →",
    savingConversation: "बातचीत सहेजी जा रही है...",
    verifiedCitations: "सत्यापित स्रोत और विश्वसनीय जानकारी",
    card6Title: "6. 24 घंटे में डॉक्टर सत्यापन के लिए सुरक्षित",
    recordedHeading: "पर्ची और बातचीत सुरक्षित रूप से दर्ज कर ली गई",
    doctorReviewEta: "एक योग्य डॉक्टर 24 घंटे के अंदर आपकी पर्ची और बातचीत की समीक्षा करेंगे।",
    notificationFramework: "सूचना ढांचा",
    rateDrSarthi: "आज डॉ. सारथी की मदद आपको कैसी लगी?",
    thankYouFeedback: "धन्यवाद! आपका अभिप्राय सुरक्षित रूप से दर्ज कर लिया गया है।",
    feedbackPlaceholder: "अपनी प्रतिक्रिया लिखें या बोलें...",
    saveFeedbackBtn: "प्रतिक्रिया सहेजें",
    scanAnother: "दूसरी पर्ची स्कैन करें",
    openDetailed: "विस्तृत डैशबोर्ड खोलें",
  },
  "hi-Latn": {
    card1Title: "1. Aasaani se shuru karein",
    continueWithoutLogin: "Bina Login ke aage badhein (Default)",
    continueWithoutLoginSub: "Turant shuru karein — password ya email zaroori nahi",
    hideLoginForm: "Login Form Chhupayein",
    showLoginForm: "Sign In / Account Banayein (Alerts ke liye)",
    demoPatient: "Demo Patient",
    signIn: "Sign In",
    createAccount: "Account Banayein",
    signInAndContinue: "Sign In & Continue",
    createAndContinue: "Account Banayein & Continue",
    emailOrPhonePlaceholder: "Email ya Phone Number",
    fullNamePlaceholder: "Aapka Poora Naam",
    passwordPlaceholder: "Password",
    createPasswordPlaceholder: "Password banayein (min 8 characters)",
    pleaseWait: "Kripya intezar karein...",
    card2Title: "2. Apni Prescription Dikhayein",
    takePhotoOrUpload: "Photo Lein / Upload Karein",
    readingPrescription: "Prescription padhi ja rahi hai...",
    cameraPhotoPdf: "Camera, Photo ya PDF",
    trySamplePrescription: "Sample Prescription Dekhein",
    instantSynthetic: "Instant synthetic prescription test",
    scanQrTitle: "Ya Phone se QR Scan karein",
    switchToFullReports: "Ya Full Reports Page par jayein",
    card3Title: "3. Apni Details Check Karein",
    nameLabel: "Naam",
    ageLabel: "Umar",
    genderLabel: "Gender",
    years: "saal",
    notFound: "Nahi mila",
    notSpecified: "Not specified",
    yesThisIsCorrect: "Haan, yeh sahi hai",
    noLetMeFixIt: "Nahi, mujhe theek karne dein",
    preparing: "Taiyari ho rahi hai...",
    yourNameEdit: "Aapka Naam (Type ya Bol kar batayein)",
    yourAgeEdit: "Aapki Age (Type ya Bol kar batayein)",
    enterYourName: "Apna naam likhein",
    genderEdit: "Gender",
    male: "Male",
    female: "Female",
    otherGender: "Other",
    saveAndConfirm: "Details Save karein & Dawaiyan samjhein →",
    savingAndExplaining: "Save & Explain ho raha hai...",
    card4Title: "4. Aapki Dawaiyan Saral Shabdon Mein",
    nextQA: "Next: Sawaal aur Jawab",
    importantInstructions: "Doctor ke Important Instructions aur Timing",
    whyGiven: "Yeh Dawaiyan Kyun Di Gayi Hain",
    card5Title: "5. Kya Aapka Koi Sawaal Hai?",
    yesIHaveAQuestion: "Haan, mera ek sawaal hai",
    noQuestionsFinish: "Koi sawaal nahi, Finish karein →",
    typeQuestionPlaceholder: "Apna sawaal yahan type karein...",
    askBtn: "Puchein",
    starterQ1: "Mujhe apni dawai kab leni chahiye?",
    starterQ2: "Khane se pehle ya khane ke baad?",
    starterQ3: "Doctor ko dobara kab dikhana hai?",
    doneAskingBtn: "Sawaal Poore Hue — Save & Finish →",
    savingConversation: "Conversation save ho rahi hai...",
    verifiedCitations: "Verified Sources & Trusted Information",
    card6Title: "6. 24-Ghante Doctor Verification ke liye Saved",
    recordedHeading: "Prescription aur Q&A Safely Record Ho Gaya",
    doctorReviewEta: "Ek qualified doctor 24 ghante mein aapki prescription aur conversation review karenge.",
    notificationFramework: "Notification Framework",
    rateDrSarthi: "Aaj Dr. Sarthi ki madad kaisi lagi?",
    thankYouFeedback: "Shukriya! Aapka feedback safely record ho gaya hai.",
    feedbackPlaceholder: "Apna feedback likhein ya bolein...",
    saveFeedbackBtn: "Feedback Save Karein",
    scanAnother: "Dusri Prescription Scan Karein",
    openDetailed: "Detailed Dashboard Kholein",
  },
  bn: {
    card1Title: "১. সহজে শুরু করুন",
    continueWithoutLogin: "লগইন ছাড়া এগিয়ে যান (ডিফল্ট)",
    continueWithoutLoginSub: "অবিলম্বে শুরু করুন — পাসওয়ার্ড বা ইমেলের প্রয়োজন নেই",
    hideLoginForm: "লগইন ফর্ম লুকান",
    showLoginForm: "সাইন ইন / অ্যাকাউন্ট খুলুন",
    demoPatient: "ডেমো রোগী",
    signIn: "সাইন ইন",
    createAccount: "অ্যাকাউন্ট খুলুন",
    signInAndContinue: "সাইন ইন করুন এবং এগিয়ে যান",
    createAndContinue: "অ্যাকাউন্ট তৈরি করুন এবং এগিয়ে যান",
    emailOrPhonePlaceholder: "ইমেল বা ফোন নম্বর",
    fullNamePlaceholder: "আপনার পুরো নাম",
    passwordPlaceholder: "পাসওয়ার্ড",
    createPasswordPlaceholder: "পাসওয়ার্ড তৈরি করুন (কমপক্ষে ৮ অক্ষর)",
    pleaseWait: "অনুগ্রহ করে অপেক্ষা করুন...",
    card2Title: "২. আপনার প্রেসক্রিপশন দেখান",
    takePhotoOrUpload: "ছবি তুলুন / আপলোড করুন",
    readingPrescription: "প্রেসক্রিপশন পড়া হচ্ছে...",
    cameraPhotoPdf: "ক্যামেরা, ছবি বা পিডিএফ",
    trySamplePrescription: "নমুনা প্রেসক্রিপশন দেখুন",
    instantSynthetic: "তাত্ক্ষণিক প্রেসক্রিপশন পরীক্ষা",
    scanQrTitle: "অথবা ফোন থেকে QR স্ক্যান করুন",
    switchToFullReports: "সম্পূর্ণ রিপোর্ট পৃষ্ঠায় যান",
    card3Title: "৩. আপনার বিবরণ পরীক্ষা করুন",
    nameLabel: "নাম",
    ageLabel: "বয়স",
    genderLabel: "লিঙ্গ",
    years: "বছর",
    notFound: "পাওয়া যায়নি",
    notSpecified: "নির্দিষ্ট নয়",
    yesThisIsCorrect: "হ্যাঁ, এটি সঠিক",
    noLetMeFixIt: "না, আমাকে ঠিক করতে দিন",
    preparing: "প্রস্তুত করা হচ্ছে...",
    yourNameEdit: "আপনার নাম (লিখুন বা বলুন)",
    yourAgeEdit: "আপনার বয়স (লিখুন বা বলুন)",
    enterYourName: "আপনার নাম লিখুন",
    genderEdit: "লিঙ্গ",
    male: "পুরুষ",
    female: "মহিলা",
    otherGender: "অন্যান্য",
    saveAndConfirm: "বিবরণ সংরক্ষণ করুন এবং ওষুধ বুঝুন →",
    savingAndExplaining: "সংরক্ষণ করা হচ্ছে...",
    card4Title: "৪. সহজ কথায় আপনার ওষুধ",
    nextQA: "পরবর্তী: প্রশ্ন ও উত্তর",
    importantInstructions: "ডাক্তারের গুরুত্বপূর্ণ নির্দেশ ও সময়",
    whyGiven: "কেন এই ওষুধগুলো দেওয়া হয়েছে",
    card5Title: "৫. আপনার কি কোনো প্রশ্ন আছে?",
    yesIHaveAQuestion: "হ্যাঁ, আমার একটি প্রশ্ন আছে",
    noQuestionsFinish: "কোনো প্রশ্ন নেই, সমাপ্ত করুন →",
    typeQuestionPlaceholder: "আপনার প্রশ্ন এখানে লিখুন...",
    askBtn: "জিজ্ঞাসা করুন",
    starterQ1: "আমার ওষুধ কখন খাওয়া উচিত?",
    starterQ2: "খাবারের আগে না পরে?",
    starterQ3: "কখন আবার ডাক্তারের কাছে যাব?",
    doneAskingBtn: "প্রশ্ন শেষ — সংরক্ষণ ও সমাপ্তি →",
    savingConversation: "সংরক্ষণ করা হচ্ছে...",
    verifiedCitations: "যাচাইকৃত তথ্যসূত্র",
    card6Title: "৬. ২৪ ঘণ্টার ডাক্তার পরীক্ষার জন্য সংরক্ষিত",
    recordedHeading: "প্রেসক্রিপশন এবং প্রশ্নোত্তর সংরক্ষিত হয়েছে",
    doctorReviewEta: "একজন ডাক্তার ২৪ ঘণ্টার মধ্যে প্রেসক্রিপশন ও কথোপকথন পরীক্ষা করবেন।",
    notificationFramework: "বিজ্ঞপ্তি পরিকাঠামো",
    rateDrSarthi: "আজ ডঃ সারথির সাহায্য কেমন ছিল?",
    thankYouFeedback: "ধন্যবাদ! আপনার প্রতিক্রিয়া সংরক্ষিত হয়েছে।",
    feedbackPlaceholder: "প্রতিক্রিয়া লিখুন বা বলুন...",
    saveFeedbackBtn: "প্রতিক্রিয়া সংরক্ষণ করুন",
    scanAnother: "অন্য প্রেসক্রিপশন স্ক্যান করুন",
    openDetailed: "বিস্তারিত ড্যাশবোর্ড খুলুন",
  },
  mr: {
    card1Title: "१. सहजपणे सुरू करा",
    continueWithoutLogin: "लॉगिन न करता पुढे जा (डिफॉल्ट)",
    continueWithoutLoginSub: "लगेच सुरू करा — पासवर्ड किंवा ईमेलची गरज नाही",
    hideLoginForm: "लॉगिन फॉर्म लपवा",
    showLoginForm: "साइन इन / खाते उघडा",
    demoPatient: "डेमो रुग्ण",
    signIn: "साइन इन",
    createAccount: "खाते उघडा",
    signInAndContinue: "साइन इन करा आणि पुढे जा",
    createAndContinue: "खाते उघडा आणि पुढे जा",
    emailOrPhonePlaceholder: "ईमेल किंवा फोन नंबर",
    fullNamePlaceholder: "तुमचे पूर्ण नाव",
    passwordPlaceholder: "पासवर्ड",
    createPasswordPlaceholder: "पासवर्ड तयार करा (किमान ८ अक्षरे)",
    pleaseWait: "कृपया थांबा...",
    card2Title: "२. तुमचे प्रिस्क्रिप्शन दाखवा",
    takePhotoOrUpload: "फोटो काढा / अपलोड करा",
    readingPrescription: "प्रिस्क्रिप्शन वाचत आहे...",
    cameraPhotoPdf: "कॅमेरा, फोटो किंवा पीडीएफ",
    trySamplePrescription: "नमुना प्रिस्क्रिप्शन पहा",
    instantSynthetic: "झटपट प्रिस्क्रिप्शन चाचणी",
    scanQrTitle: "किंवा फोनवरून QR स्कॅन करा",
    switchToFullReports: "किंवा संपूर्ण रिपोर्ट पानावर जा",
    card3Title: "३. तुमची माहिती तपासा",
    nameLabel: "नाव",
    ageLabel: "वय",
    genderLabel: "लिंग",
    years: "वर्षे",
    notFound: "सापडले नाही",
    notSpecified: "अनिर्दिष्ट",
    yesThisIsCorrect: "होय, हे बरोबर आहे",
    noLetMeFixIt: "नाही, मला दुरुस्त करू द्या",
    preparing: "तयारी सुरू आहे...",
    yourNameEdit: "तुमचे नाव (टाईप करा किंवा बोला)",
    yourAgeEdit: "तुमचे वय (टाईप करा किंवा बोला)",
    enterYourName: "तुमचे नाव टाका",
    genderEdit: "लिंग",
    male: "पुरुष",
    female: "महिला",
    otherGender: "इतर",
    saveAndConfirm: "माहिती जतन करा आणि औषधे समजून घ्या →",
    savingAndExplaining: "जतन करत आहे...",
    card4Title: "४. तुमची औषधे सोप्या शब्दांत",
    nextQA: "पुढे: प्रश्न आणि उत्तरे",
    importantInstructions: "डॉक्टरांचे महत्त्वाचे निर्देश आणि वेळ",
    whyGiven: "ही औषधे का दिली आहेत",
    card5Title: "५. तुम्हाला काही प्रश्न आहेत का?",
    yesIHaveAQuestion: "होय, मला प्रश्न आहे",
    noQuestionsFinish: "प्रश्न नाहीत, पूर्ण करा →",
    typeQuestionPlaceholder: "तुमचा प्रश्न येथे टाईप करा...",
    askBtn: "विचारा",
    starterQ1: "मी औषध कधी घ्यावे?",
    starterQ2: "जेवणापूर्वी की जेवणानंतर?",
    starterQ3: "डॉक्टरांना पुन्हा कधी भेटायचे?",
    doneAskingBtn: "प्रश्न पूर्ण झाले — जतन करा आणि संपवा →",
    savingConversation: "संभाषण जतन करत आहे...",
    verifiedCitations: "प्रमाणित संदर्भ आणि माहिती",
    card6Title: "६. २४ तासांत डॉक्टर पडताळणीसाठी सुरक्षित",
    recordedHeading: "प्रिस्क्रिप्शन आणि संभाषण सुरक्षितपणे नोंदवले गेले",
    doctorReviewEta: "एक पात्र डॉक्टर २४ तासांत तुमच्या प्रिस्क्रिप्शनची तपासणी करतील.",
    notificationFramework: "सूचना प्रणाली",
    rateDrSarthi: "आज डॉ. सारथींची मदत कशी वाटली?",
    thankYouFeedback: "धन्यवाद! तुमचा अभिप्राय नोंदवला गेला आहे.",
    feedbackPlaceholder: "अभिप्राय टाईप करा किंवा बोला...",
    saveFeedbackBtn: "अभिप्राय जतन करा",
    scanAnother: "दुसरे प्रिस्क्रिप्शन स्कॅन करा",
    openDetailed: "सविस्तर डॅशबोर्ड उघडा",
  },
  ta: {
    card1Title: "1. எளிதாகத் தொடங்குங்கள்",
    continueWithoutLogin: "உள்நுழைவு இல்லாமல் தொடரவும் (இயல்புநிலை)",
    continueWithoutLoginSub: "உடனடியாகத் தொடங்குங்கள் — கடவுச்சொல் தேவையில்லை",
    hideLoginForm: "படிவத்தை மறைக்கவும்",
    showLoginForm: "உள்நுழைக / கணக்கு தொடங்குக",
    demoPatient: "மாதிரி நோயாளி",
    signIn: "உள்நுழைக",
    createAccount: "கணக்கு தொடங்குக",
    signInAndContinue: "உள்நுழைந்து தொடரவும்",
    createAndContinue: "கணக்கு தொடங்கி தொடரவும்",
    emailOrPhonePlaceholder: "மின்னஞ்சல் அல்லது தொலைபேசி",
    fullNamePlaceholder: "உங்கள் முழுப் பெயர்",
    passwordPlaceholder: "கடவுச்சொல்",
    createPasswordPlaceholder: "கடவுச்சொல்லை உருவாக்கவும் (குறைந்தது 8 எழுத்துக்கள்)",
    pleaseWait: "தயவுசெய்து காத்திருக்கவும்...",
    card2Title: "2. உங்கள் மருத்துவச் சீட்டைக் காட்டவும்",
    takePhotoOrUpload: "புகைப்படம் எடுக்கவும் / பதிவேற்றவும்",
    readingPrescription: "சீட்டு படிக்கப்படுகிறது...",
    cameraPhotoPdf: "கேமரா, புகைப்படம் அல்லது PDF",
    trySamplePrescription: "மாதிரிச் சீட்டைப் பார்க்கவும்",
    instantSynthetic: "உடனடி மாதிரிச் சோதனை",
    scanQrTitle: "அல்லது போனிலிருந்து QR ஸ்கேன் செய்யவும்",
    switchToFullReports: "முழு அறிக்கைப் பக்கத்திற்கு மாறவும்",
    card3Title: "3. உங்கள் விவரங்களைச் சரிபார்க்கவும்",
    nameLabel: "பெயர்",
    ageLabel: "வயது",
    genderLabel: "பாலினம்",
    years: "வயது",
    notFound: "காணப்படவில்லை",
    notSpecified: "குறிப்பிடப்படவில்லை",
    yesThisIsCorrect: "ஆம், இது சரியானது",
    noLetMeFixIt: "இல்லை, மாற்ற வேண்டும்",
    preparing: "தயாராகிறது...",
    yourNameEdit: "உங்கள் பெயர் (பேசவும் அல்லது தட்டச்சு செய்யவும்)",
    yourAgeEdit: "உங்கள் வயது (பேசவும் அல்லது தட்டச்சு செய்யவும்)",
    enterYourName: "உங்கள் பெயரை உள்ளிடவும்",
    genderEdit: "பாலினம்",
    male: "ஆண்",
    female: "பெண்",
    otherGender: "மற்றவை",
    saveAndConfirm: "விவரங்களைச் சேமித்து மருந்தை அறியவும் →",
    savingAndExplaining: "சேமிக்கப்படுகிறது...",
    card4Title: "4. எளிய மொழியில் உங்கள் மருந்துகள்",
    nextQA: "அடுத்து: கேள்விகள் மற்றும் பதில்கள்",
    importantInstructions: "முக்கிய மருத்துவ வழிகாட்டுதல்கள் மற்றும் நேரம்",
    whyGiven: "இந்த மருந்துகள் ஏன் கொடுக்கப்பட்டுள்ளன",
    card5Title: "5. ஏதேனும் கேள்விகள் உள்ளதா?",
    yesIHaveAQuestion: "ஆம், என்னிடம் கேள்வி உள்ளது",
    noQuestionsFinish: "கேள்விகள் இல்லை, முடிக்கவும் →",
    typeQuestionPlaceholder: "உங்கள் கேள்வியை இங்கே தட்டச்சு செய்யவும்...",
    askBtn: "கேளுங்கள்",
    starterQ1: "நான் எப்போது மருந்து எடுக்க வேண்டும்?",
    starterQ2: "உணவுக்கு முன்பா அல்லது பின்பா?",
    starterQ3: "மீண்டும் மருத்துவரை எப்போது பார்க்க வேண்டும்?",
    doneAskingBtn: "கேள்விகள் முடிந்தது — சேமித்து முடிக்கவும் →",
    savingConversation: "சேமிக்கப்படுகிறது...",
    verifiedCitations: "சரிபார்க்கப்பட்ட மருத்துவ ஆதாரங்கள்",
    card6Title: "6. 24 மணி நேர மருத்துவ சரிபார்ப்புக்காக சேமிக்கப்பட்டது",
    recordedHeading: "மருத்துவச் சீட்டும் உரையாடலும் பதிவு செய்யப்பட்டன",
    doctorReviewEta: "ஒரு மருத்துவர் 24 மணி நேரத்திற்குள் பரிசீலிப்பார்.",
    notificationFramework: "அறிவிப்பு அமைப்பு",
    rateDrSarthi: "டாக்டர் சாரதியின் உதவி எவ்வாறு இருந்தது?",
    thankYouFeedback: "நன்றி! உங்கள் கருத்து பதிவு செய்யப்பட்டது.",
    feedbackPlaceholder: "உங்கள் கருத்து (பேசவும் அல்லது தட்டச்சு செய்யவும்)...",
    saveFeedbackBtn: "கருத்தைச் சேமிக்கவும்",
    scanAnother: "மற்றொரு சீட்டை ஸ்கேன் செய்யவும்",
    openDetailed: "விரிவான டாஷ்போர்டைத் திறக்கவும்",
  },
  te: {
    card1Title: "1. సులభంగా ప్రారంభించండి",
    continueWithoutLogin: "లాగిన్ లేకుండా కొనసాగించండి (డిఫాల్ట్)",
    continueWithoutLoginSub: "వెంటనే ప్రారంభించండి — పాస్‌వర్డ్ అవసరం లేదు",
    hideLoginForm: "ఫారమ్ దాచు",
    showLoginForm: "సైన్ ఇన్ / ఖాతా తెరవండి",
    demoPatient: "డెమో రోగి",
    signIn: "సైన్ ఇన్",
    createAccount: "ఖాతా తెరవండి",
    signInAndContinue: "సైన్ ఇన్ చేసి కొనసాగించండి",
    createAndContinue: "ఖాతా సృష్టించి కొనసాగించండి",
    emailOrPhonePlaceholder: "ఇమెయిల్ లేదా ఫోన్ నంబర్",
    fullNamePlaceholder: "మీ పూర్తి పేరు",
    passwordPlaceholder: "పాస్‌వర్డ్",
    createPasswordPlaceholder: "పాస్‌వర్డ్ సృష్టించండి (కనిష్టంగా 8 అక్షరాలు)",
    pleaseWait: "దయచేసి వేచి ఉండండి...",
    card2Title: "2. మీ ప్రిస్క్రిప్షన్‌ను చూపించండి",
    takePhotoOrUpload: "ఫోటో తీయండి / అప్‌లోడ్ చేయండి",
    readingPrescription: "ప్రిస్క్రిప్షన్ చదువుతోంది...",
    cameraPhotoPdf: "కెమెరా, ఫోటో లేదా PDF",
    trySamplePrescription: "శాంపిల్ ప్రిస్క్రిప్షన్ ప్రయత్నించండి",
    instantSynthetic: "తక్షణ ప్రిస్క్రిప్షన్ పరీక్ష",
    scanQrTitle: "లేదా ఫోన్ నుండి QR స్కాన్ చేయండి",
    switchToFullReports: "పూర్తి నివేదికల పేజీకి మారండి",
    card3Title: "3. మీ వివరాలను తనిఖీ చేయండి",
    nameLabel: "పేరు",
    ageLabel: "వయస్సు",
    genderLabel: "లింగం",
    years: "సంవత్సరాలు",
    notFound: "కనుగొనబడలేదు",
    notSpecified: "పేర్కొనబడలేదు",
    yesThisIsCorrect: "అవును, ఇది సరైనది",
    noLetMeFixIt: "కాదు, సరిచేయనివ్వండి",
    preparing: "సిద్ధం చేస్తోంది...",
    yourNameEdit: "మీ పేరు (టైప్ చేయండి లేదా మాట్లాడండి)",
    yourAgeEdit: "మీ వయస్సు (టైప్ చేయండి లేదా మాట్లాడండి)",
    enterYourName: "మీ పేరు నమోదు చేయండి",
    genderEdit: "లింగం",
    male: "పురుషుడు",
    female: "స్త్రీ",
    otherGender: "ఇతర",
    saveAndConfirm: "వివరాలను సేవ్ చేసి మందులను అర్థం చేసుకోండి →",
    savingAndExplaining: "సేవ్ చేస్తోంది...",
    card4Title: "4. మీ మందుల వివరాలు సరళమైన మాటల్లో",
    nextQA: "తదుపరి: ప్రశ్నలు & సమాధానాలు",
    importantInstructions: "డాక్టర్ ముఖ్యమైన సూచనలు మరియు సమయాలు",
    whyGiven: "ఈ మందులు ఎందుకు ఇవ్వబడ్డాయి",
    card5Title: "5. మీకు ఏవైనా ప్రశ్నలు ఉన్నాయా?",
    yesIHaveAQuestion: "అవును, నాకు ఒక ప్రశ్న ఉంది",
    noQuestionsFinish: "ప్రశ్నలు లేవు, పూర్తి చేయండి →",
    typeQuestionPlaceholder: "మీ ప్రశ్నను ఇక్కడ టైప్ చేయండి...",
    askBtn: "అడగండి",
    starterQ1: "నేను మందులు ఎప్పుడు తీసుకోవాలి?",
    starterQ2: "భోజనానికి ముందా లేదా తర్వాతనా?",
    starterQ3: "డాక్టర్‌ని మళ్లీ ఎప్పుడు కలవాలి?",
    doneAskingBtn: "ప్రశ్నలు పూర్తయ్యాయి — సేవ్ & ముగించండి →",
    savingConversation: "సేవ్ చేస్తోంది...",
    verifiedCitations: "ధృవీకరించబడిన వైద్య ఆధారాలు",
    card6Title: "6. 24 గంటల డాక్టర్ పరిశీలన కోసం భద్రపరచబడింది",
    recordedHeading: "ప్రిస్క్రిప్షన్ మరియు సంభాషణ రికార్డ్ చేయబడింది",
    doctorReviewEta: "ఒక అర్హత కలిగిన డాక్టర్ 24 గంటల్లో పరిశీలిస్తారు.",
    notificationFramework: "నోటిఫికేషన్ వ్యవస్థ",
    rateDrSarthi: "డాక్టర్ సారథి సహాయం ఎలా అనిపించింది?",
    thankYouFeedback: "ధన్యవాదాలు! మీ అభిప్రాయం నమోదు చేయబడింది.",
    feedbackPlaceholder: "అభిప్రాయం టైప్ చేయండి లేదా మాట్లాడండి...",
    saveFeedbackBtn: "అభిప్రాయాన్ని సేవ్ చేయండి",
    scanAnother: "మరొక ప్రిస్క్రిప్షన్‌ను స్కాన్ చేయండి",
    openDetailed: "వివరమైన డ్యాష్‌బోర్డ్‌ను తెరవండి",
  },
  gu: {
    card1Title: "૧. સરળતાથી શરૂ કરો",
    continueWithoutLogin: "લૉગિન વિના આગળ વધો (ડિફૉલ્ટ)",
    continueWithoutLoginSub: "તરત જ શરૂ કરો — કોઈ પાસવર્ડની જરૂર નથી",
    hideLoginForm: "ફોર્મ છુપાવો",
    showLoginForm: "સાઇન ઇન / એકાઉન્ટ બનાવો",
    demoPatient: "ડેમો દર્દી",
    signIn: "સાઇન ઇન",
    createAccount: "એકાઉન્ટ બનાવો",
    signInAndContinue: "સાઇન ઇન કરો અને આગળ વધો",
    createAndContinue: "એકાઉન્ટ બનાવો અને આગળ વધો",
    emailOrPhonePlaceholder: "ઇમેઇલ અથવા ફોન નંબર",
    fullNamePlaceholder: "તમારું પૂરું નામ",
    passwordPlaceholder: "પાસવર્ડ",
    createPasswordPlaceholder: "પાસવર્ડ બનાવો (ઓછામાં ઓછા ૮ અક્ષરો)",
    pleaseWait: "કૃપા કરીને રાહ જુઓ...",
    card2Title: "૨. તમારું પ્રિસ્ક્રિપ્શન બતાવો",
    takePhotoOrUpload: "ફોટો લો / અપલોડ કરો",
    readingPrescription: "પ્રિસ્ક્રિપ્શન વાંચી રહ્યું છે...",
    cameraPhotoPdf: "કેમેરા, ફોટો અથવા પીડીએફ",
    trySamplePrescription: "સેમ્પલ પ્રિસ્ક્રિપ્શન જુઓ",
    instantSynthetic: "ઝડપી પ્રિસ્ક્રિપ્શન ટેસ્ટ",
    scanQrTitle: "અથવા ફોનથી QR સ્કેન કરો",
    switchToFullReports: "સંપૂર્ણ રિપોર્ટ પૃષ્ઠ પર જાઓ",
    card3Title: "૩. તમારી વિગતો તપાસો",
    nameLabel: "નામ",
    ageLabel: "ઉંમર",
    genderLabel: "જાતિ",
    years: "વર્ષ",
    notFound: "મળ્યું નથી",
    notSpecified: "સ્પષ્ટ નથી",
    yesThisIsCorrect: "હા, આ સાચું છે",
    noLetMeFixIt: "ના, મને સુધારવા દો",
    preparing: "તૈયારી કરી રહ્યું છે...",
    yourNameEdit: "તમારું નામ (લખો અથવા બોલો)",
    yourAgeEdit: "તમારી ઉંમર (લખો અથવા બોલો)",
    enterYourName: "તમારું નામ દાખલ કરો",
    genderEdit: "જાતિ",
    male: "પુરુષ",
    female: "સ્ત્રી",
    otherGender: "અન્ય",
    saveAndConfirm: "વિગતો સાચવો અને દવા સમજો →",
    savingAndExplaining: "સાચવી રહ્યું છે...",
    card4Title: "૪. તમારી દવાઓ સરળ શબ્દોમાં",
    nextQA: "આગળ: પ્રશ્નો અને જવાબો",
    importantInstructions: "ડૉક્ટરની મહત્વપૂર્ણ સૂચનાઓ અને સમય",
    whyGiven: "આ દવાઓ શા માટે આપવામાં આવી છે",
    card5Title: "૫. શું તમારો કોઈ પ્રશ્ન છે?",
    yesIHaveAQuestion: "હા, મારો એક પ્રશ્ન છે",
    noQuestionsFinish: "કોઈ પ્રશ્ન નથી, પૂર્ણ કરો →",
    typeQuestionPlaceholder: "તમારો પ્રશ્ન અહીં લખો...",
    askBtn: "પૂછો",
    starterQ1: "મારે દવા ક્યારે લેવી જોઈએ?",
    starterQ2: "જમ્યા પહેલા કે પછી?",
    starterQ3: "ડૉક્ટરને ફરી ક્યારે મળવું?",
    doneAskingBtn: "પ્રશ્નો પૂરા થયા — સાચવો અને પૂરું કરો →",
    savingConversation: "સાચવી રહ્યું છે...",
    verifiedCitations: "પ્રમાણિત માહિતી સ્ત્રોત",
    card6Title: "૬. ૨૪ કલાકમાં ડૉક્ટર ચકાસણી માટે સુરક્ષિત",
    recordedHeading: "પ્રિસ્ક્રિપ્શન અને વાતચીત સુરક્ષિત રીતે રેકોર્ડ થઈ",
    doctorReviewEta: "એક યોગ્ય ડૉક્ટર ૨૪ કલાકમાં ચકાસણી કરશે.",
    notificationFramework: "નોટિફિકેશન સિસ્ટમ",
    rateDrSarthi: "ડૉ. સારથીની મદદ કેવી લાગી?",
    thankYouFeedback: "આભાર! તમારો પ્રતિસાદ રેકોર્ડ થઈ ગયો છે.",
    feedbackPlaceholder: "પ્રતિસાદ લખો અથવા બોલો...",
    saveFeedbackBtn: "પ્રતિસાદ સાચવો",
    scanAnother: "બીજું પ્રિસ્ક્રિપ્શન સ્કેન કરો",
    openDetailed: "વિગતવાર ડેશબોર્ડ ખોલો",
  },
  kn: {
    card1Title: "1. ಸುಲಭವಾಗಿ ಪ್ರಾರಂಭಿಸಿ",
    continueWithoutLogin: "ಲಾಗಿನ್ ಇಲ್ಲದೆ ಮುಂದುವರಿಯಿರಿ (ಡೀಫಾಲ್ಟ್)",
    continueWithoutLoginSub: "ತಕ್ಷಣ ಪ್ರಾರಂಭಿಸಿ — ಪಾಸ್‌ವರ್ಡ್ ಅಗತ್ಯವಿಲ್ಲ",
    hideLoginForm: "ಫಾರ್ಮ್ ಮರೆಮಾಡಿ",
    showLoginForm: "ಸೈನ್ ಇನ್ / ಖಾತೆ ತೆರೆಯಿರಿ",
    demoPatient: "ಡೆಮೊ ರೋಗಿ",
    signIn: "ಸೈನ್ ಇನ್",
    createAccount: "ಖಾತೆ ತೆರೆಯಿರಿ",
    signInAndContinue: "ಸೈನ್ ಇನ್ ಮಾಡಿ ಮತ್ತು ಮುಂದುವರಿಯಿರಿ",
    createAndContinue: "ಖಾತೆ ತೆರೆದು ಮುಂದುವರಿಯಿರಿ",
    emailOrPhonePlaceholder: "ಇಮೇಲ್ ಅಥವಾ ಫೋನ್ ಸಂಖ್ಯೆ",
    fullNamePlaceholder: "ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು",
    passwordPlaceholder: "ಪಾಸ್‌ವರ್ಡ್",
    createPasswordPlaceholder: "ಪಾಸ್‌ವರ್ಡ್ ರಚಿಸಿ (ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳು)",
    pleaseWait: "ದಯವಿಟ್ಟು ನಿರೀಕ್ಷಿಸಿ...",
    card2Title: "2. ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ತೋರಿಸಿ",
    takePhotoOrUpload: "ಫೋಟೋ ತೆಗೆಯಿರಿ / ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    readingPrescription: "ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಓದಲಾಗುತ್ತಿದೆ...",
    cameraPhotoPdf: "ಕ್ಯಾಮೆರಾ, ಫೋಟೋ ಅಥವಾ PDF",
    trySamplePrescription: "ಮಾದರಿ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ನೋಡಿ",
    instantSynthetic: "ತಕ್ಷಣದ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಪರೀಕ್ಷೆ",
    scanQrTitle: "ಅಥವಾ ಫೋನ್‌ನಿಂದ QR ಸ್ಕ್ಯಾನ್ ಮಾಡಿ",
    switchToFullReports: "ಸಂಪೂರ್ಣ ವರದಿಗಳ ಪುಟಕ್ಕೆ ಬದಲಾಯಿಸಿ",
    card3Title: "3. ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ",
    nameLabel: "ಹೆಸರು",
    ageLabel: "ವಯಸ್ಸು",
    genderLabel: "ಲಿಂಗ",
    years: "ವರ್ಷಗಳು",
    notFound: "ಕಂಡುಬಂದಿಲ್ಲ",
    notSpecified: "ನಿರ್ದಿಷ್ಟಪಡಿಸಲಾಗಿಲ್ಲ",
    yesThisIsCorrect: "ಹೌದು, ಇದು ಸರಿಯಾಗಿದೆ",
    noLetMeFixIt: "ಇಲ್ಲ, ಬದಲಾಯಿಸಬೇಕು",
    preparing: "ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...",
    yourNameEdit: "ನಿಮ್ಮ ಹೆಸರು (ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ)",
    yourAgeEdit: "ನಿಮ್ಮ ವಯಸ್ಸು (ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ)",
    enterYourName: "ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ",
    genderEdit: "ಲಿಂಗ",
    male: "ಪುರುಷ",
    female: "ಮಹಿಳೆ",
    otherGender: "ಇತರ",
    saveAndConfirm: "ವಿವರಗಳನ್ನು ಉಳಿಸಿ ಮತ್ತು ಔಷಧಿಯನ್ನು ತಿಳಿಯಿರಿ →",
    savingAndExplaining: "ಉಳಿಸಲಾಗುತ್ತಿದೆ...",
    card4Title: "4. ನಿಮ್ಮ ಔಷಧಿಗಳು ಸರಳ ಪದಗಳಲ್ಲಿ",
    nextQA: "ಮುಂದೆ: ಪ್ರಶ್ನೆಗಳು ಮತ್ತು ಉತ್ತರಗಳು",
    importantInstructions: "ವೈದ್ಯರ ಪ್ರಮುಖ ಸೂಚನೆಗಳು ಮತ್ತು ಸಮಯ",
    whyGiven: "ಈ ಔಷಧಿಗಳನ್ನು ಏಕೆ ನೀಡಲಾಗಿದೆ",
    card5Title: "5. ನಿಮ್ಮಲ್ಲಿ ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳಿವೆಯೇ?",
    yesIHaveAQuestion: "ಹೌದು, ನನ್ನ ಬಳಿ ಪ್ರಶ್ನೆಯಿದೆ",
    noQuestionsFinish: "ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳಿಲ್ಲ, ಮುಗಿಸಿ →",
    typeQuestionPlaceholder: "ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ...",
    askBtn: "ಕೇಳಿ",
    starterQ1: "ನಾನು ಔಷಧಿಯನ್ನು ಯಾವಾಗ ತೆಗೆದುಕೊಳ್ಳಬೇಕು?",
    starterQ2: "ಊಟಕ್ಕೆ ಮುಂಚಿತವಾಗಿ ಅಥವಾ ನಂತರ?",
    starterQ3: "ವೈದ್ಯರನ್ನು ಮತ್ತೆ ಯಾವಾಗ ಭೇಟಿ ಮಾಡಬೇಕು?",
    doneAskingBtn: "ಪ್ರಶ್ನೆಗಳು ಮುಗಿದಿವೆ — ಉಳಿಸಿ ಮತ್ತು ಮುಗಿಸಿ →",
    savingConversation: "ಉಳಿಸಲಾಗುತ್ತಿದೆ...",
    verifiedCitations: "ಪರಿಶೀಲಿಸಿದ ವೈದ್ಯಕೀಯ ಜ್ಞಾನ ಮೂಲಗಳು",
    card6Title: "6. 24 ಗಂಟೆಗಳಲ್ಲಿ ವೈದ್ಯರ ಪರಿಶೀಲನೆಗಾಗಿ ಉಳಿಸಲಾಗಿದೆ",
    recordedHeading: "ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಮತ್ತು ಸಂಭಾಷಣೆ ದಾಖಲಾಗಿದೆ",
    doctorReviewEta: "ಅರ್ಹ ವೈದ್ಯರು 24 ಗಂಟೆಗಳಲ್ಲಿ ಪರಿಶೀಲಿಸುತ್ತಾರೆ.",
    notificationFramework: "ಅಧಿಸೂಚನೆ ವ್ಯವಸ್ಥೆ",
    rateDrSarthi: "ಡಾ. ಸಾರಥಿ ಅವರ ಸಹಾಯ ಹೇಗಿತ್ತು?",
    thankYouFeedback: "ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆ ದಾಖಲಾಗಿದೆ.",
    feedbackPlaceholder: "ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ...",
    saveFeedbackBtn: "ಪ್ರತಿಕ್ರಿಯೆ ಉಳಿಸಿ",
    scanAnother: "ಮತ್ತೊಂದು ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ",
    openDetailed: "ವಿವರವಾದ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಿರಿ",
  },
  ml: {
    card1Title: "1. എളുപ്പത്തിൽ ആരംഭിക്കുക",
    continueWithoutLogin: "ലോഗിൻ ഇല്ലാതെ തുടരുക (സ്ഥിരസ്ഥിതി)",
    continueWithoutLoginSub: "ഉടൻ ആരംഭിക്കുക — പാസ്‌വേഡ് ആവശ്യമില്ല",
    hideLoginForm: "ഫോം മറയ്ക്കുക",
    showLoginForm: "സൈൻ ഇൻ / അക്കൗണ്ട് ഉണ്ടാക്കുക",
    demoPatient: "ഡെമോ രോഗി",
    signIn: "സൈൻ ഇൻ",
    createAccount: "അക്കൗണ്ട് ഉണ്ടാക്കുക",
    signInAndContinue: "സൈൻ ഇൻ ചെയ്ത് തുടരുക",
    createAndContinue: "അക്കൗണ്ട് ഉണ്ടാക്കി തുടരുക",
    emailOrPhonePlaceholder: "ഇമെയിൽ അല്ലെങ്കിൽ ഫോൺ നമ്പർ",
    fullNamePlaceholder: "നിങ്ങളുടെ പൂർണ്ണമായ പേര്",
    passwordPlaceholder: "പാസ്‌വേഡ്",
    createPasswordPlaceholder: "പാസ്‌വേഡ് നൽകുക (കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ)",
    pleaseWait: "ദയവായി കാത്തിരിക്കുക...",
    card2Title: "2. നിങ്ങളുടെ കുറിപ്പടി കാണിക്കുക",
    takePhotoOrUpload: "ഫോട്ടോ എടുക്കുക / അപ്‌ലോഡ് ചെയ്യുക",
    readingPrescription: "കുറിപ്പടി വായിക്കുന്നു...",
    cameraPhotoPdf: "ക്യാമറ, ഫോട്ടോ അല്ലെങ്കിൽ PDF",
    trySamplePrescription: "സാമ്പിൾ കുറിപ്പടി പരീക്ഷിക്കുക",
    instantSynthetic: "തൽക്ഷണ കുറിപ്പടി പരിശോധന",
    scanQrTitle: "അല്ലെങ്കിൽ ഫോണിൽ നിന്ന് QR സ്കാൻ ചെയ്യുക",
    switchToFullReports: "പൂർണ്ണ റിപ്പോർട്ട് പേജിലേക്ക് മാറുക",
    card3Title: "3. നിങ്ങളുടെ വിവരങ്ങൾ പരിശോധിക്കുക",
    nameLabel: "പേര്",
    ageLabel: "പ്രായം",
    genderLabel: "ലിംഗഭേദം",
    years: "വയസ്സ്",
    notFound: "കണ്ടെത്തിയില്ല",
    notSpecified: "വ്യക്തമല്ല",
    yesThisIsCorrect: "അതെ, ഇത് ശരിയാണ്",
    noLetMeFixIt: "അല്ല, തിരുത്തണം",
    preparing: "തയ്യാറാക്കുന്നു...",
    yourNameEdit: "നിങ്ങളുടെ പേര് (ടൈപ്പ് ചെയ്യുക അല്ലെങ്കിൽ സംസാരിക്കുക)",
    yourAgeEdit: "നിങ്ങളുടെ പ്രായം (ടൈപ്പ് ചെയ്യുക അല്ലെങ്കിൽ സംസാരിക്കുക)",
    enterYourName: "നിങ്ങളുടെ പേര് നൽകുക",
    genderEdit: "ലിംഗഭേദം",
    male: "പുരുഷൻ",
    female: "സ്ത്രീ",
    otherGender: "മറ്റുള്ളവ",
    saveAndConfirm: "വിവരങ്ങൾ സംരക്ഷിച്ച് മരുന്നുകൾ അറിയുക →",
    savingAndExplaining: "സംരക്ഷിക്കുന്നു...",
    card4Title: "4. നിങ്ങളുടെ മരുന്നുകൾ ലളിതമായ വാക്കുകളിൽ",
    nextQA: "അടുത്തത്: ചോദ്യങ്ങളും ഉത്തരങ്ങളും",
    importantInstructions: "ഡോക്ടറുടെ പ്രധാന നിർദ്ദേശങ്ങളും സമയക്രമവും",
    whyGiven: "ഈ മരുന്നുകൾ എന്തിനാണ് നൽകിയിരിക്കുന്നത്",
    card5Title: "5. നിങ്ങൾക്ക് എന്തെങ്കിലും ചോദ്യങ്ങളുണ്ടോ?",
    yesIHaveAQuestion: "അതെ, എനിക്ക് ഒരു ചോദ്യമുണ്ട്",
    noQuestionsFinish: "ചോദ്യങ്ങളൊന്നുമില്ല, പൂർത്തിയാക്കുക →",
    typeQuestionPlaceholder: "നിങ്ങളുടെ ചോദ്യം ഇവിടെ ടൈപ്പ് ചെയ്യുക...",
    askBtn: "ചോദിക്കുക",
    starterQ1: "ഞാൻ എപ്പോഴാണ് മരുന്ന് കഴിക്കേണ്ടത്?",
    starterQ2: "ഭക്ഷണത്തിന് മുമ്പോ ശേഷമോ?",
    starterQ3: "എപ്പോഴാണ് വീണ്ടും ഡോക്ടറെ കാണേണ്ടത്?",
    doneAskingBtn: "ചോദ്യങ്ങൾ കഴിഞ്ഞു — സംരക്ഷിച്ച് പൂർത്തിയാക്കുക →",
    savingConversation: "സംരക്ഷിക്കുന്നു...",
    verifiedCitations: "പരിശോധിച്ച വിവര ഉറവിടങ്ങൾ",
    card6Title: "6. 24 മണിക്കൂറിനുള്ളിൽ ഡോക്ടർ പരിശോധനയ്ക്കായി സംരക്ഷിച്ചു",
    recordedHeading: "കുറിപ്പടിയും സംഭാഷണവും സുരക്ഷിതമായി രേഖപ്പെടുത്തി",
    doctorReviewEta: "യോഗ്യനായ ഒരു ഡോക്ടർ 24 മണിക്കൂറിനുള്ളിൽ പരിശോധിക്കും.",
    notificationFramework: "അറിയിപ്പ് സംവിധാനം",
    rateDrSarthi: "ഡോ. സാരഥിയുടെ സഹായം എങ്ങനെയുണ്ടായിരുന്നു?",
    thankYouFeedback: "നന്ദി! നിങ്ങളുടെ അഭിപ്രായം രേഖപ്പെടുത്തി.",
    feedbackPlaceholder: "അഭിപ്രായം ടൈപ്പ് ചെയ്യുക അല്ലെങ്കിൽ സംസാരിക്കുക...",
    saveFeedbackBtn: "അഭിപ്രായം സംരക്ഷിക്കുക",
    scanAnother: "മറ്റൊരു കുറിപ്പടി സ്കാൻ ചെയ്യുക",
    openDetailed: "വിശദമായ ഡാഷ്‌ബോർഡ് തുറക്കുക",
  },
  pa: {
    card1Title: "1. ਆਸਾਨੀ ਨਾਲ ਸ਼ੁਰੂ ਕਰੋ",
    continueWithoutLogin: "ਬਿਨਾਂ ਲੌਗਇਨ ਕੀਤੇ ਜਾਰੀ ਰੱਖੋ (ਡਿਫਾਲਟ)",
    continueWithoutLoginSub: "ਤੁਰੰਤ ਸ਼ੁਰੂ ਕਰੋ — ਪਾਸਵਰਡ ਜਾਂ ਈਮੇਲ ਦੀ ਲੋੜ ਨਹੀਂ",
    hideLoginForm: "ਫਾਰਮ ਲੁਕਾਓ",
    showLoginForm: "ਸਾਈਨ ਇਨ / ਖਾਤਾ ਬਣਾਓ",
    demoPatient: "ਡੈਮੋ ਮਰੀਜ਼",
    signIn: "ਸਾਈਨ ਇਨ",
    createAccount: "ਖਾਤਾ ਬਣਾਓ",
    signInAndContinue: "ਸਾਈਨ ਇਨ ਕਰੋ ਅਤੇ ਜਾਰੀ ਰੱਖੋ",
    createAndContinue: "ਖਾਤਾ ਬਣਾਓ ਅਤੇ ਜਾਰੀ ਰੱਖੋ",
    emailOrPhonePlaceholder: "ਈਮੇਲ ਜਾਂ ਫ਼ੋਨ ਨੰਬਰ",
    fullNamePlaceholder: "ਤੁਹਾਡਾ ਪੂਰਾ ਨਾਮ",
    passwordPlaceholder: "ਪਾਸਵਰਡ",
    createPasswordPlaceholder: "ਪਾਸਵਰਡ ਬਣਾਓ (ਘੱਟੋ-ਘੱਟ 8 ਅੱਖਰ)",
    pleaseWait: "ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕ ਕਰੋ...",
    card2Title: "2. ਆਪਣੀ ਪਰਚੀ ਦਿਖਾਓ",
    takePhotoOrUpload: "ਫੋਟੋ ਲਓ / ਅੱਪਲੋਡ ਕਰੋ",
    readingPrescription: "ਪਰਚੀ ਪੜ੍ਹੀ ਜਾ ਰਹੀ ਹੈ...",
    cameraPhotoPdf: "ਕੈਮਰਾ, ਫੋਟੋ ਜਾਂ PDF",
    trySamplePrescription: "ਸੈਂਪਲ ਪਰਚੀ ਦੇਖੋ",
    instantSynthetic: "ਤੁਰੰਤ ਪਰਚੀ ਟੈਸਟ",
    scanQrTitle: "ਜਾਂ ਫ਼ੋਨ ਤੋਂ QR ਸਕੈਨ ਕਰੋ",
    switchToFullReports: "ਪੂਰੀ ਰਿਪੋਰਟ ਪੰਨੇ 'ਤੇ ਜਾਓ",
    card3Title: "3. ਆਪਣੇ ਵੇਰਵੇ ਚੈੱਕ ਕਰੋ",
    nameLabel: "ਨਾਮ",
    ageLabel: "ਉਮਰ",
    genderLabel: "ਲਿੰਗ",
    years: "ਸਾਲ",
    notFound: "ਨਹੀਂ ਮਿਲਿਆ",
    notSpecified: "ਨਹੀਂ ਦੱਸਿਆ ਗਿਆ",
    yesThisIsCorrect: "ਹਾਂ, ਇਹ ਸਹੀ ਹੈ",
    noLetMeFixIt: "ਨਹੀਂ, ਮੈਨੂੰ ਠੀਕ ਕਰਨ ਦਿਓ",
    preparing: "ਤਿਆਰੀ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ...",
    yourNameEdit: "ਤੁਹਾਡਾ ਨਾਮ (ਲਿਖੋ ਜਾਂ ਬੋਲੋ)",
    yourAgeEdit: "ਤੁਹਾਡੀ ਉਮਰ (ਲਿਖੋ ਜਾਂ ਬੋਲੋ)",
    enterYourName: "ਆਪਣਾ ਨਾਮ ਦਰਜ ਕਰੋ",
    genderEdit: "ਲਿੰਗ",
    male: "ਪੁਰਸ਼",
    female: "ਮਹਿਲਾ",
    otherGender: "ਹੋਰ",
    saveAndConfirm: "ਵੇਰਵੇ ਸੁਰੱਖਿਅਤ ਕਰੋ ਅਤੇ ਦਵਾਈਆਂ ਸਮਝੋ →",
    savingAndExplaining: "ਸੁਰੱਖਿਅਤ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ...",
    card4Title: "4. ਤੁਹਾਡੀਆਂ ਦਵਾਈਆਂ ਸਰਲ ਸ਼ਬਦਾਂ ਵਿੱਚ",
    nextQA: "ਅੱਗੇ: ਸਵਾਲ ਅਤੇ ਜਵਾਬ",
    importantInstructions: "ਡਾਕਟਰ ਦੇ ਮਹੱਤਵਪੂਰਨ ਨਿਰਦੇਸ਼ ਅਤੇ ਸਮਾਂ",
    whyGiven: "ਇਹ ਦਵਾਈਆਂ ਕਿਉਂ ਦਿੱਤੀਆਂ ਗਈਆਂ ਹਨ",
    card5Title: "5. ਕੀ ਤੁਹਾਡਾ ਕੋਈ ਸਵਾਲ ਹੈ?",
    yesIHaveAQuestion: "ਹਾਂ, ਮੇਰਾ ਇੱਕ ਸਵਾਲ ਹੈ",
    noQuestionsFinish: "ਕੋਈ ਸਵਾਲ ਨਹੀਂ, ਸਮਾਪਤ ਕਰੋ →",
    typeQuestionPlaceholder: "ਆਪਣਾ ਸਵਾਲ ਇੱਥੇ ਲਿਖੋ...",
    askBtn: "ਪੁੱਛੋ",
    starterQ1: "ਮੈਨੂੰ ਦਵਾਈ ਕਦੋਂ ਲੈਣੀ ਚਾਹੀਦੀ ਹੈ?",
    starterQ2: "ਖਾਣੇ ਤੋਂ ਪਹਿਲਾਂ ਜਾਂ ਬਾਅਦ ਵਿੱਚ?",
    starterQ3: "ਡਾਕਟਰ ਨੂੰ ਦੁਬਾਰਾ ਕਦੋਂ ਮਿਲਣਾ ਹੈ?",
    doneAskingBtn: "ਸਵਾਲ ਪੂਰੇ ਹੋਏ — ਸੁਰੱਖਿਅਤ ਕਰੋ ਅਤੇ ਸਮਾਪਤ ਕਰੋ →",
    savingConversation: "ਸੁਰੱਖਿਅਤ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ...",
    verifiedCitations: "ਪ੍ਰਮਾਣਿਤ ਸਰੋਤ",
    card6Title: "6. 24 ਘੰਟਿਆਂ ਵਿੱਚ ਡਾਕਟਰ ਦੀ ਜਾਂਚ ਲਈ ਸੁਰੱਖਿਅਤ",
    recordedHeading: "ਪਰਚੀ ਅਤੇ ਗੱਲਬਾਤ ਸੁਰੱਖਿਅਤ ਦਰਜ ਹੋ ਗਈ",
    doctorReviewEta: "ਇੱਕ ਯੋਗ ਡਾਕਟਰ 24 ਘੰਟਿਆਂ ਦੇ ਅੰਦਰ ਸਮੀਖਿਆ ਕਰਨਗੇ।",
    notificationFramework: "ਸੂਚਨਾ ਪ੍ਰਣਾਲੀ",
    rateDrSarthi: "ਅੱਜ ਡਾ. ਸਾਰਥੀ ਦੀ ਮਦਦ ਕਿਹੋ ਜਿਹੀ ਰਹੀ?",
    thankYouFeedback: "ਧੰਨਵਾਦ! ਤੁਹਾਡਾ ਫੀਡਬੈਕ ਦਰਜ ਕਰ ਲਿਆ ਗਿਆ ਹੈ।",
    feedbackPlaceholder: "ਆਪਣਾ ਫੀਡਬੈਕ ਲਿਖੋ ਜਾਂ ਬੋਲੋ...",
    saveFeedbackBtn: "ਫੀਡਬੈਕ ਸੁਰੱਖਿਅਤ ਕਰੋ",
    scanAnother: "ਦੂਜੀ ਪਰਚੀ ਸਕੈਨ ਕਰੋ",
    openDetailed: "ਵਿਸਤ੍ਰਿਤ ਡੈਸ਼ਬੋਰਡ ਖੋਲ੍ਹੋ",
  },
};

function buildSamplePrescriptionPng(): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 620;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 28px Arial, sans-serif";
      ctx.fillText("SYNTHETIC CLINIC PRESCRIPTION", 40, 56);
      ctx.font = "22px Arial, sans-serif";
      ctx.fillText("Patient: Ramesh Sharma | Age: 64 | Gender: Male", 40, 112);
      ctx.fillText("Date: 2026-11-26", 40, 152);
      ctx.fillText("Diagnosis: Viral Fever & Upper Respiratory Infection", 40, 204);
      ctx.fillText("Rx:", 40, 256);
      ctx.fillText("1. Paracetamol 500 mg — 1 tablet morning and night after food for 3 days", 40, 304);
      ctx.fillText("2. Amlodipine 5 mg — 1 tablet once daily every morning after breakfast", 40, 352);
      ctx.fillText("Warnings: Do NOT exceed 4 Paracetamol tablets in 24 hours.", 40, 412);
      ctx.fillText("Follow up in 5 days or sooner if fever > 102 F or breathing trouble.", 40, 460);
    }
    canvas.toBlob((blob) => {
      const file = new File([blob || new Blob(["SYNTHETIC PRESCRIPTION"])], "sample_prescription.png", {
        type: "image/png",
      });
      resolve(file);
    }, "image/png");
  });
}

export default function PatientGuidedFlowPage() {
  const { locale, setLocale } = useI18n();
  const { setLanguage } = useAccessibility();
  const { user, patientProfile, login, guestLogin, refreshMe } = useAuth();

  const cardCopy = GUIDED_PAGE_COPY[locale] || GUIDED_PAGE_COPY.en;

  function handleLanguageChange(next: SupportedLocale) {
    setLocale(next);
    setLanguage(next);
    if (user?.role === "patient") {
      void api.updatePreferences({ preferred_language: next }).catch(() => {});
    }
  }

  const [step, setStep] = useState(1);
  const [viewMode, setViewMode] = useState<"guided_cards" | "reports_workspace">("guided_cards");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Card 1: Optional Login / Register / No-Login Default
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Card 2 & 3: Prescription & Demographics
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documentRecord, setDocumentRecord] = useState<MedicalDocumentDTO | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<"male" | "female" | "other" | "prefer_not_to_say">("prefer_not_to_say");
  const [editingDemographics, setEditingDemographics] = useState(false);
  const [demographicsConfirmed, setDemographicsConfirmed] = useState(false);

  // Card 4: Simple Explanation
  const [explanationProv, setExplanationProv] = useState<ProvenancePayload | null>(null);

  // Card 5: Q&A Conversation
  const [wantsQuestions, setWantsQuestions] = useState<boolean | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [chatHistory, setChatHistory] = useState<GuidedChatMessage[]>([]);
  const [researchMode, setResearchMode] = useState<"normal" | "web_research" | "deep_research">("normal");
  const [requestVisual, setRequestVisual] = useState<boolean>(true);

  // Card 6: 24h Doctor Review, Notification Framework & Rating
  const [reviewReceipt, setReviewReceipt] = useState<{
    review_id: string;
    eta_hours: number;
    notification: {
      status: string;
      channel: string;
      will_notify_within_24h: boolean;
      message: string;
    };
  } | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [ratingSaved, setRatingSaved] = useState(false);

  const langLabel = useMemo(
    () => SUPPORTED_LOCALES.find((l) => l.code === locale)?.nativeLabel || "English",
    [locale]
  );

  // Ensure patient session (guest default if not signed in)
  async function ensureGuestIfNeeded(): Promise<boolean> {
    if (user?.role === "patient") return true;
    await guestLogin("patient");
    return true;
  }

  async function handleContinueWithoutLogin() {
    setErrorMsg(null);
    setBusy(true);
    try {
      await ensureGuestIfNeeded();
      await api.updatePreferences({
        preferred_language: locale,
        reading_comfort_level: "very_simple",
        explanation_depth: "very_simple",
      });
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not start guest session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountAuth(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      if (authMode === "login") {
        await login(identifier.trim(), password);
      } else {
        await api.register({
          role: "patient",
          name: regName.trim() || "Patient",
          email: regEmail.trim() || undefined,
          phone: regPhone.trim() || undefined,
          password,
        });
        await refreshMe();
      }
      await api.updatePreferences({
        preferred_language: locale,
        reading_comfort_level: "very_simple",
        explanation_depth: "very_simple",
      });
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoPatientLogin() {
    setErrorMsg(null);
    setBusy(true);
    try {
      await api.demoLogin("patient");
      await refreshMe();
      await api.updatePreferences({ preferred_language: locale });
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Demo login unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProcessPrescriptionFile(file: File) {
    setErrorMsg(null);
    setBusy(true);
    try {
      await ensureGuestIfNeeded();
      const uploaded = await api.uploadDocument(file, "prescription");
      const extracted = await api.extractDocument(uploaded.id);
      setDocumentRecord(extracted);

      const fields = (extracted.ocr_structured_fields || {}) as Record<string, unknown>;
      const extName = typeof fields.patient_name === "string" ? fields.patient_name : "";
      const extAge = fields.patient_age !== undefined && fields.patient_age !== null ? String(fields.patient_age) : "";
      const extGender = typeof fields.patient_gender === "string" ? fields.patient_gender : "";

      setPatientName(extName || "");
      setPatientAge(extAge || "");
      if (extGender === "male" || extGender === "female" || extGender === "other") {
        setPatientGender(extGender);
      } else {
        setPatientGender("prefer_not_to_say");
      }
      setEditingDemographics(false);
      setStep(3);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not read prescription photo. Please try a clearer photo.");
    } finally {
      setBusy(false);
    }
  }

  function handleImportedPrescription(extracted: MedicalDocumentDTO) {
    setErrorMsg(null);
    setDocumentRecord(extracted);
    const fields = (extracted.ocr_structured_fields || {}) as Record<string, unknown>;
    const extName = typeof fields.patient_name === "string" ? fields.patient_name : "";
    const extAge = fields.patient_age !== undefined && fields.patient_age !== null ? String(fields.patient_age) : "";
    const extGender = typeof fields.patient_gender === "string" ? fields.patient_gender : "";

    setPatientName(extName || "");
    setPatientAge(extAge || "");
    if (extGender === "male" || extGender === "female" || extGender === "other") {
      setPatientGender(extGender);
    } else {
      setPatientGender("prefer_not_to_say");
    }
    setEditingDemographics(false);
    setStep(3);
  }

  async function handleConfirmAndExplain(confirmedCorrect: boolean) {
    if (!documentRecord) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      if (confirmedCorrect || editingDemographics) {
        await api.updatePatientProfile({
          name: patientName.trim() || undefined,
          age_years: patientAge.trim() ? Number(patientAge.trim()) : undefined,
          gender: patientGender,
        });
        await refreshMe();
      }
      setDemographicsConfirmed(true);

      let activeDoc = documentRecord;
      if (activeDoc.verification_status === "unverified") {
        try {
          activeDoc = await api.verifyDocument(activeDoc.id, {
            verification_decision: "confirm",
            corrected_structured_fields: {
              ...(activeDoc.ocr_structured_fields || {}),
              patient_name: patientName.trim() || undefined,
              patient_age: patientAge.trim() ? Number(patientAge.trim()) : undefined,
              patient_gender: patientGender,
            },
          });
          setDocumentRecord(activeDoc);
        } catch {
          // If unreadable, handle gracefully below
        }
      }

      if (activeDoc.verification_status === "rejected_unreadable") {
        setErrorMsg("Some parts of this prescription were too blurry to read safely. Please upload a clearer photo.");
        setBusy(false);
        return;
      }

      const explained = await api.explainDocument(activeDoc.id, {
        target_language: locale,
        explanation_depth: "very_simple",
      });
      setExplanationProv(explained.provenance);
      setStep(4);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not generate prescription explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendQuestion(modality: "text" | "voice" = "text", overrideText?: string) {
    const q = (overrideText ?? questionText).trim();
    if (!q) return;
    setErrorMsg(null);
    setBusy(true);
    setChatHistory((prev) => [...prev, { role: "patient", text: q }]);
    if (!overrideText) setQuestionText("");

    try {
      const res = await api.sendChat({
        conversation_id: conversationId,
        message_text: q,
        input_modality: modality,
        stt_confirmed: true,
        context_document_id: documentRecord?.id,
        target_language: locale,
        research_mode: researchMode,
        generate_visual: requestVisual,
      });
      setConversationId(res.conversation_id);
      const replyText =
        res.assistant_message.provenance_blocks?.ai_simplified?.summary ||
        res.assistant_message.message_text ||
        "Please ask your doctor to confirm.";
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: replyText,
          visual_artifact: res.assistant_message.visual_artifact,
          citations: res.assistant_message.citations,
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not send question.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishToReview() {
    if (!documentRecord) {
      setStep(6);
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const receipt = await api.submitGuidedReview({
        document_id: documentRecord.id,
        conversation_id: conversationId,
        patient_confirmed_demographics: demographicsConfirmed,
        preferred_language: locale,
      });
      setReviewReceipt(receipt);
      setStep(6);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not submit for 24-hour doctor review.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRating(stars: number, customFeedback?: string) {
    const chosenRating = stars > 0 ? stars : (rating > 0 ? rating : 5);
    setRating(chosenRating);
    setBusy(true);
    try {
      const fb = (customFeedback !== undefined ? customFeedback : feedbackText).trim();
      await api.submitGuidedReviewRating({
        rating: chosenRating,
        feedback_text: fb || undefined,
        document_id: documentRecord?.id,
        conversation_id: conversationId,
        review_id: reviewReceipt?.review_id,
      });
      setRatingSaved(true);
    } catch {
      setRatingSaved(true);
    } finally {
      setBusy(false);
    }
  }

  // Extract structured medicines for visual medicine cards on Card 4
  const structuredFields = (documentRecord?.ocr_structured_fields || {}) as {
    medications?: Array<{ name?: string; dose?: string; raw_line?: string }>;
    diagnoses?: string[];
  };
  const extractedMeds = structuredFields.medications || [];

  const scripts = GUIDED_NARRATOR_SCRIPTS[locale] || GUIDED_NARRATOR_SCRIPTS.en;

  // Narrator script & pose per step
  const narratorConfig = useMemo<{ pose: NarratorPose; message: string }>(() => {
    if (step === 1) {
      return {
        pose: "greeting",
        message: scripts.step1,
      };
    }
    if (step === 2) {
      return {
        pose: "scanning",
        message: scripts.step2,
      };
    }
    if (step === 3) {
      const ageSay = patientAge ? `${patientAge}` : "not written";
      const genderSay = patientGender === "prefer_not_to_say" ? "not written" : (patientGender || "not written");
      return {
        pose: editingDemographics ? "listening" : "scanning",
        message: editingDemographics
          ? scripts.step3Editing
          : scripts.step3Confirmed(patientName || "Patient", ageSay, genderSay),
      };
    }
    if (step === 4) {
      const summary = explanationProv?.ai_simplified?.summary || scripts.step4Default;
      return {
        pose: "explaining",
        message: summary,
      };
    }
    if (step === 5) {
      const lastBot = [...chatHistory].reverse().find((m) => m.role === "assistant");
      return {
        pose: wantsQuestions ? "listening" : "explaining",
        message: lastBot ? lastBot.text : scripts.step5Default,
      };
    }
    return {
      pose: "celebrating",
      message: ratingSaved ? scripts.step6Rated : scripts.step6Prompt,
    };
  }, [
    chatHistory,
    editingDemographics,
    explanationProv,
    patientAge,
    patientGender,
    patientName,
    ratingSaved,
    scripts,
    step,
    wantsQuestions,
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Top Bar: View Mode Switcher + Step Progress */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BackButton variant="page" className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold" />
          <div
            className="flex items-center gap-1 rounded-xl border-2 p-1"
            style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface)" }}
          >
            <button
              type="button"
              onClick={() => setViewMode("guided_cards")}
              className="tap-target rounded-lg px-3 py-1 text-xs font-extrabold transition-colors"
              style={{
                backgroundColor: viewMode === "guided_cards" ? "var(--ms-primary)" : "transparent",
                color: viewMode === "guided_cards" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
              }}
            >
              Voice-Guided Steps
            </button>
            <button
              type="button"
              onClick={() => setViewMode("reports_workspace")}
              className="tap-target rounded-lg px-3 py-1 text-xs font-extrabold transition-colors"
              style={{
                backgroundColor: viewMode === "reports_workspace" ? "var(--ms-primary)" : "transparent",
                color: viewMode === "reports_workspace" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
              }}
            >
              Full Reports Page (Section Narrators)
            </button>
          </div>
        </div>

        {/* Universal Language Switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Languages className="h-4 w-4 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
          {[
            { code: "en", label: "English" },
            { code: "hi", label: "हिन्दी" },
            { code: "hi-Latn", label: "Hinglish" },
          ].map((opt) => {
            const active = locale === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => handleLanguageChange(opt.code as SupportedLocale)}
                aria-pressed={active}
                className="tap-target rounded-xl border-2 px-2.5 py-1 text-xs font-extrabold"
                style={{
                  backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                  color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                  borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <select
            aria-label="More languages"
            value={locale}
            onChange={(e) => handleLanguageChange(e.target.value as SupportedLocale)}
            className="tap-target rounded-xl border-2 px-2 py-1 text-xs font-extrabold"
            style={{
              backgroundColor: "var(--ms-surface-alt)",
              borderColor: "var(--ms-border)",
              color: "var(--ms-ink)",
            }}
          >
            {SUPPORTED_LOCALES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.nativeLabel}
              </option>
            ))}
          </select>
        </div>

        {viewMode === "guided_cards" && (
          <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 6`}>
            {scripts.stepLabels.map((lbl, idx) => {
              const num = idx + 1;
              const active = num === step;
              const done = num < step;
              return (
                <span
                  key={lbl}
                  title={lbl}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-extrabold"
                  style={{
                    backgroundColor: active
                      ? "var(--ms-primary)"
                      : done
                        ? "var(--ms-primary-soft)"
                        : "var(--ms-surface-alt)",
                    color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: active || done ? "var(--ms-primary)" : "var(--ms-border)",
                  }}
                >
                  {done ? "✓" : num}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {viewMode === "reports_workspace" ? (
        <ReportsWorkspace
          initialDocId={documentRecord?.id}
          enablePerSectionNarrator={true}
        />
      ) : (
        <>
          {/* Interactive Female Human Doctor Narrator */}
          <InteractiveNarrator
            pose={narratorConfig.pose}
            message={narratorConfig.message}
            language={locale}
            autoSpeak={true}
          />

      {errorMsg && (
        <div
          role="alert"
          className="ms-card flex items-start gap-2.5 border-2 p-4 text-sm font-bold"
          style={{
            backgroundColor: "var(--ms-danger-bg)",
            borderColor: "var(--ms-danger-border)",
            color: "var(--ms-danger-ink)",
          }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CARD 1: Welcome & No-Login Default + Full Login Workflow */}
      {step === 1 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">{cardCopy.card1Title}</h1>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleContinueWithoutLogin()}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-between gap-3 px-6 py-4 text-left text-lg"
          >
            <span className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-extrabold">{cardCopy.continueWithoutLogin}</span>
                <span className="block text-xs font-medium opacity-90">
                  {cardCopy.continueWithoutLoginSub}
                </span>
              </span>
            </span>
            <ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" />
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--ms-border)" }}>
            <button
              type="button"
              onClick={() => setShowLoginPanel((v) => !v)}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>{showLoginPanel ? cardCopy.hideLoginForm : cardCopy.showLoginForm}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDemoPatientLogin()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              <span>{cardCopy.demoPatient}</span>
            </button>
          </div>

          {showLoginPanel && (
            <form onSubmit={(e) => void handleAccountAuth(e)} className="space-y-4 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`tap-target flex-1 rounded-xl border-2 px-3 py-2 text-sm font-extrabold`}
                  style={{
                    backgroundColor: authMode === "login" ? "var(--ms-primary)" : "var(--ms-surface)",
                    color: authMode === "login" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: authMode === "login" ? "var(--ms-primary)" : "var(--ms-border)",
                  }}
                >
                  {cardCopy.signIn}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className={`tap-target flex-1 rounded-xl border-2 px-3 py-2 text-sm font-extrabold`}
                  style={{
                    backgroundColor: authMode === "register" ? "var(--ms-primary)" : "var(--ms-surface)",
                    color: authMode === "register" ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                    borderColor: authMode === "register" ? "var(--ms-primary)" : "var(--ms-border)",
                  }}
                >
                  {cardCopy.createAccount}
                </button>
              </div>

              {authMode === "login" ? (
                <>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={cardCopy.emailOrPhonePlaceholder}
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={cardCopy.passwordPlaceholder}
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                </>
              ) : (
                <>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={cardCopy.fullNamePlaceholder}
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="Email (optional if phone given)"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Phone Number (optional if email given)"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={cardCopy.createPasswordPlaceholder}
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                </>
              )}

              <button type="submit" disabled={busy} className="ms-btn-primary tap-target-lg w-full text-base">
                {busy ? cardCopy.pleaseWait : authMode === "login" ? cardCopy.signInAndContinue : cardCopy.createAndContinue}
              </button>
            </form>
          )}
        </section>
      )}

      {/* CARD 2: Prescription Photo Upload / Camera */}
      {step === 2 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">{cardCopy.card2Title}</h1>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleProcessPrescriptionFile(file);
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="ms-btn-primary tap-target-lg flex flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <Camera className="h-10 w-10" aria-hidden="true" />
              <span className="text-lg font-extrabold">
                {busy ? cardCopy.readingPrescription : cardCopy.takePhotoOrUpload}
              </span>
              <span className="text-xs opacity-90">{cardCopy.cameraPhotoPdf}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const sample = await buildSamplePrescriptionPng();
                await handleProcessPrescriptionFile(sample);
              }}
              className="ms-btn-secondary tap-target-lg flex flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <Upload className="h-10 w-10" aria-hidden="true" />
              <span className="text-lg font-extrabold">{cardCopy.trySamplePrescription}</span>
              <span className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                {cardCopy.instantSynthetic}
              </span>
            </button>
          </div>

          <QrPhoneUploadPanel
            title={cardCopy.scanQrTitle}
            onPrescriptionImported={handleImportedPrescription}
          />

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setViewMode("reports_workspace")}
              className="ms-btn-secondary tap-target inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>{cardCopy.switchToFullReports}</span>
            </button>
          </div>
        </section>
      )}

      {/* CARD 3: Confirm Name, Age, Gender (Keyboard or Speech-to-Text) */}
      {step === 3 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">{cardCopy.card3Title}</h1>

          <div className="grid gap-3 rounded-2xl border-2 p-4 sm:grid-cols-3" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>{cardCopy.nameLabel}</span>
              <span className="text-xl font-extrabold">{patientName || cardCopy.notFound}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>{cardCopy.ageLabel}</span>
              <span className="text-xl font-extrabold">{patientAge ? `${patientAge} ${cardCopy.years}` : cardCopy.notFound}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>{cardCopy.genderLabel}</span>
              <span className="text-xl font-extrabold capitalize">
                {patientGender === "prefer_not_to_say" ? cardCopy.notSpecified : patientGender === "female" ? cardCopy.female : patientGender === "male" ? cardCopy.male : cardCopy.otherGender}
              </span>
            </div>
          </div>

          {!editingDemographics ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmAndExplain(true)}
                className="ms-btn-primary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Check className="h-6 w-6" aria-hidden="true" />
                <span>{busy ? cardCopy.preparing : cardCopy.yesThisIsCorrect}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingDemographics(true)}
                className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Edit3 className="h-6 w-6" aria-hidden="true" />
                <span>{cardCopy.noLetMeFixIt}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-primary)" }}>
              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">{cardCopy.yourNameEdit}</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder={cardCopy.enterYourName}
                    className="tap-target flex-1 rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <VoiceInputButton
                    language={locale}
                    onConfirmedTranscript={(txt) => setPatientName(txt.replace(/[.!?]/g, "").trim())}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">{cardCopy.yourAgeEdit}</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="e.g. 64"
                    className="tap-target flex-1 rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <VoiceInputButton
                    language={locale}
                    onConfirmedTranscript={(txt) => {
                      const m = txt.match(/\d{1,3}/);
                      if (m) setPatientAge(m[0]);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">{cardCopy.genderEdit}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["female", "male", "other"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setPatientGender(g)}
                      aria-pressed={patientGender === g}
                      className="tap-target rounded-xl border-2 px-3 py-2.5 text-sm font-extrabold capitalize"
                      style={{
                        backgroundColor: patientGender === g ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                        color: patientGender === g ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                        borderColor: patientGender === g ? "var(--ms-primary)" : "var(--ms-border)",
                      }}
                    >
                      {g === "female" ? cardCopy.female : g === "male" ? cardCopy.male : cardCopy.otherGender}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmAndExplain(true)}
                className="ms-btn-primary tap-target-lg w-full py-4 text-lg font-extrabold"
              >
                {busy ? cardCopy.savingAndExplaining : cardCopy.saveAndConfirm}
              </button>
            </div>
          )}
        </section>
      )}

      {/* CARD 4: Simple Prescription Explanation */}
      {step === 4 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">{cardCopy.card4Title}</h1>

          {/* Visual Medicine Cards */}
          {extractedMeds.length > 0 && (
            <div className="space-y-3">
              {extractedMeds.map((m, idx) => (
                <div
                  key={`${m.name || "med"}-${idx}`}
                  className="rounded-2xl border-2 p-4 space-y-2"
                  style={{ borderColor: "var(--ms-prov-doctor-border)", backgroundColor: "var(--ms-prov-doctor-bg)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-lg font-extrabold">
                      <Pill className="h-5 w-5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
                      <span>{m.name || "Medicine"} {m.dose ? `(${m.dose})` : ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Sun className="h-4 w-4" aria-hidden="true" />
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <Moon className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                  {m.raw_line && <p className="text-sm font-semibold">{m.raw_line}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Doctor-Provided & AI-Simplified Info */}
          {explanationProv?.doctor_provided && explanationProv.doctor_provided.length > 0 && (
            <div className="rounded-2xl border-2 p-4 space-y-2" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
              <h2 className="text-base font-extrabold">{cardCopy.importantInstructions}</h2>
              <ul className="space-y-1.5 text-sm font-semibold">
                {explanationProv.doctor_provided.map((item, i) => (
                  <li key={i}>
                    {typeof item === "string" ? (
                      <>• {item}</>
                    ) : (
                      <>• {item.text}</>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {explanationProv?.general_education && explanationProv.general_education.length > 0 && (
            <div className="rounded-2xl border-2 p-4 space-y-2" style={{ borderColor: "var(--ms-prov-kb-border)", backgroundColor: "var(--ms-prov-kb-bg)" }}>
              <h2 className="text-base font-extrabold">{cardCopy.whyGiven}</h2>
              <ul className="space-y-1.5 text-sm">
                {explanationProv.general_education.map((g, i) => (
                  <li key={i}>• <strong>{g.topic}:</strong> {g.text}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep(5)}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-center gap-2 py-4 text-lg font-extrabold"
          >
            <span>{cardCopy.nextQA}</span>
            <ArrowRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* CARD 5: Questions & Answers (Keyboard or Speech-to-Text, Recorded) */}
      {step === 5 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">{cardCopy.card5Title}</h1>

          {wantsQuestions === null && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setWantsQuestions(true)}
                className="ms-btn-primary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
                <span>{cardCopy.yesIHaveAQuestion}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinishToReview()}
                className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Check className="h-6 w-6" aria-hidden="true" />
                <span>{cardCopy.noQuestionsFinish}</span>
              </button>
            </div>
          )}

          {wantsQuestions && (
            <div className="space-y-4">
              {chatHistory.length > 0 && (
                <div className="space-y-4 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
                  {chatHistory.map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl p-3 text-sm font-semibold space-y-2 ${m.role === "patient" ? "ml-6" : "mr-6"}`}
                      style={{
                        backgroundColor: m.role === "patient" ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                      }}
                    >
                      <span className="block text-xs font-extrabold uppercase opacity-75">
                        {m.role === "patient" ? (locale === "hi" ? "आप" : locale === "hi-Latn" ? "Aap" : "You") : "Dr. Sarthi"}
                      </span>
                      <p className="mt-1 leading-relaxed">{m.text}</p>

                      {/* AI Visual Explanation if generated */}
                      {m.visual_artifact && (
                        <div className="pt-2">
                          <VisualArtifactViewer visual={m.visual_artifact} />
                        </div>
                      )}

                      {/* Verified Research Citations */}
                      {m.citations && m.citations.length > 0 && (
                        <div
                          className="rounded-xl border-2 p-3 space-y-2 text-xs"
                          style={{
                            backgroundColor: "var(--ms-prov-kb-bg)",
                            borderColor: "var(--ms-border)",
                          }}
                        >
                          <div className="flex items-center gap-1.5 font-bold" style={{ color: "var(--ms-ink)" }}>
                            <ShieldCheck className="h-4 w-4" style={{ color: "var(--ms-primary)" }} />
                            <span>{cardCopy.verifiedCitations}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.citations.map((c, cIdx) => (
                              <a
                                key={cIdx}
                                href={c.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 font-bold hover:opacity-90"
                                style={{
                                  backgroundColor: "var(--ms-surface)",
                                  borderColor: "var(--ms-border)",
                                  color: "var(--ms-ink)",
                                }}
                              >
                                <span>{c.source_name}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </a>
                            ))}
                          </div>
                          {/* Clinical advisory directly below Verified Citations */}
                          <p
                            className="pt-2 border-t text-[11px] font-semibold leading-tight select-none"
                            style={{
                              borderColor: "var(--ms-border)",
                              color: "var(--ms-ink-muted)",
                            }}
                          >
                            {locale === "hi"
                              ? "AI गलतियाँ कर सकता है। क्लिनिकल मार्गदर्शन के लिए कृपया अपने डॉक्टर से परामर्श लें।"
                              : locale === "hi-Latn"
                              ? "AI se galti ho sakti hai. Kripya clinical guidance ke liye apne doctor se consult karein."
                              : "AI can make mistakes. Please consult your doctor for clinical guidance."}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                  {busy && (
                    <div className="flex flex-col items-start pt-1">
                      <SearchingIndicator
                        label={
                          researchMode === "deep_research"
                            ? "Deep researching trusted medical sources"
                            : researchMode === "web_research"
                            ? "Searching clinical web sources"
                            : "Searching results"
                        }
                        sublabel={
                          researchMode === "deep_research"
                            ? "Synthesizing PubMed, clinical trials & medical knowledge"
                            : researchMode === "web_research"
                            ? "Consulting verified medical sources (WHO, CDC, NHS)"
                            : "Reviewing doctor's note and clinical guidance"
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {[
                  cardCopy.starterQ1,
                  cardCopy.starterQ2,
                  cardCopy.starterQ3,
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSendQuestion("text", q)}
                    className="ms-btn-secondary tap-target rounded-full px-3 py-1.5 text-xs font-bold"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Question Input Container with Mode & Visual Intelligence alongside text field */}
              <div
                className="rounded-2xl border-2 p-3 space-y-3"
                style={{
                  backgroundColor: "var(--ms-surface-alt)",
                  borderColor: "var(--ms-border)",
                }}
              >
                {/* Main Input Row: Text Input, Voice Button and Ask Button */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSendQuestion("text");
                      }
                    }}
                    placeholder={cardCopy.typeQuestionPlaceholder}
                    className="tap-target flex-1 rounded-xl border-2 px-4 py-3 text-base"
                    style={{
                      backgroundColor: "var(--ms-surface)",
                      borderColor: "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  />
                  <VoiceInputButton
                    language={locale}
                    disabled={busy}
                    onConfirmedTranscript={(txt) => void handleSendQuestion("voice", txt)}
                  />
                  <button
                    type="button"
                    disabled={busy || !questionText.trim()}
                    onClick={() => void handleSendQuestion("text")}
                    className="ms-btn-primary tap-target inline-flex items-center justify-center gap-2 px-5 min-w-[110px]"
                  >
                    {busy ? (
                      <SearchingIndicator label="Searching" compact />
                    ) : (
                      <>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        <span>{cardCopy.askBtn}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Clinical Advisory Under Text Field (Small font not really big) */}
                <p className="text-[11px] font-medium leading-tight select-none pt-0.5" style={{ color: "var(--ms-ink-muted)" }}>
                  {getClinicalAdvisory(locale)}
                </p>

                {/* Research & Visual Intelligence Controls alongside the text field */}
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 p-2.5"
                  style={{
                    backgroundColor: "var(--ms-surface)",
                    borderColor: "var(--ms-border)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wide"
                      style={{ color: "var(--ms-ink-muted)" }}
                    >
                      Mode:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: "normal", label: "Normal", icon: Zap },
                          { id: "web_research", label: "Web Research", icon: Globe },
                          { id: "deep_research", label: "Deep Research", icon: FlaskConical },
                        ] as const
                      ).map((mode) => {
                        const active = researchMode === mode.id;
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setResearchMode(mode.id)}
                            aria-pressed={active}
                            className="tap-target inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold transition-all"
                            style={{
                              backgroundColor: active ? "var(--ms-primary)" : "var(--ms-surface)",
                              color: active ? "var(--ms-primary-ink)" : "var(--ms-ink)",
                              borderColor: active ? "var(--ms-primary)" : "var(--ms-border)",
                            }}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{mode.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label
                    className="tap-target inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-1.5 text-xs font-extrabold cursor-pointer select-none transition-all"
                    style={{
                      backgroundColor: requestVisual ? "var(--ms-primary-soft)" : "var(--ms-surface)",
                      borderColor: requestVisual ? "var(--ms-primary)" : "var(--ms-border)",
                      color: "var(--ms-ink)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={requestVisual}
                      onChange={(e) => setRequestVisual(e.target.checked)}
                      className="h-4 w-4 rounded cursor-pointer"
                      style={{ accentColor: "var(--ms-primary)" }}
                    />
                    <ImageIcon
                      className="h-4 w-4"
                      style={{ color: requestVisual ? "var(--ms-primary)" : "var(--ms-ink-muted)" }}
                      aria-hidden="true"
                    />
                    <span>AI Visual Diagrams</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinishToReview()}
                className="ms-btn-primary tap-target-lg w-full py-4 text-lg font-extrabold"
              >
                {busy ? cardCopy.savingConversation : cardCopy.doneAskingBtn}
              </button>
            </div>
          )}
        </section>
      )}

      {/* CARD 6: 24-Hour Doctor Verification + Notification Framework + Star Rating */}
      {step === 6 && (
        <section className="ms-card p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-8 w-8 shrink-0" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
            <h1 className="text-2xl font-extrabold">{cardCopy.card6Title}</h1>
          </div>

          <div className="space-y-3 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-primary)", backgroundColor: "var(--ms-primary-soft)" }}>
            <div className="flex items-center gap-2 font-extrabold">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <span>{cardCopy.recordedHeading}</span>
            </div>
            <p className="text-sm font-semibold">
              {cardCopy.doctorReviewEta}
            </p>
            <div className="flex items-start gap-2 rounded-xl border p-3 text-xs font-bold" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
              <Bell className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <div>
                <span className="block uppercase tracking-wide opacity-75">
                  {cardCopy.notificationFramework} ({reviewReceipt?.notification.channel || "framework"})
                </span>
                <span>
                  {reviewReceipt?.notification.message ||
                    "Notification framework ready for Email/SMS alerts when signed in."}
                </span>
              </div>
            </div>
          </div>

          {/* Star Rating */}
          <div className="space-y-4 rounded-2xl border-2 p-5 text-center" style={{ borderColor: "var(--ms-border)" }}>
            <h2 className="text-xl font-extrabold">{cardCopy.rateDrSarthi}</h2>
            <div className="flex justify-center gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5].map((starNum) => {
                const filled = starNum <= rating;
                return (
                  <button
                    key={starNum}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveRating(starNum)}
                    aria-label={`Rate ${starNum} out of 5 stars`}
                    className="tap-target-lg flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-transform hover:scale-105"
                    style={{
                      backgroundColor: filled ? "var(--ms-primary)" : "var(--ms-surface-alt)",
                      color: filled ? "#facc15" : "var(--ms-ink-muted)",
                      borderColor: filled ? "var(--ms-primary)" : "var(--ms-border)",
                    }}
                  >
                    <Star className="h-7 w-7" fill={filled ? "currentColor" : "none"} aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            {ratingSaved && (
              <div
                role="status"
                className="rounded-xl border-2 p-3 font-extrabold text-sm"
                style={{
                  backgroundColor: "var(--ms-primary-soft)",
                  borderColor: "var(--ms-primary)",
                  color: "var(--ms-primary)",
                }}
              >
                {cardCopy.thankYouFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={cardCopy.feedbackPlaceholder}
                className="tap-target w-full max-w-sm rounded-xl border-2 px-4 py-2.5 text-sm"
                style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
              />
              <VoiceInputButton
                language={locale}
                onConfirmedTranscript={(txt) => setFeedbackText(txt)}
              />
              <button
                type="button"
                disabled={busy || (!feedbackText.trim() && rating === 0)}
                onClick={() => void handleSaveRating(rating || 5, feedbackText)}
                className="ms-btn-primary tap-target px-4 py-2.5 text-sm font-bold inline-flex items-center gap-1.5"
              >
                <span>{cardCopy.saveFeedbackBtn}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setStep(2);
                setDocumentRecord(null);
                setExplanationProv(null);
                setChatHistory([]);
                setWantsQuestions(null);
                setRating(0);
                setRatingSaved(false);
              }}
              className="ms-btn-secondary tap-target px-5 text-sm"
            >
              {cardCopy.scanAnother}
            </button>
            <Link href="/patient/detailed" className="ms-btn-primary tap-target inline-flex items-center px-5 text-sm">
              {cardCopy.openDetailed}
            </Link>
          </div>
        </section>
      )}
      </>
      )}
    </div>
  );
}
