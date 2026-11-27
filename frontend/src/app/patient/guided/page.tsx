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
          <h1 className="text-2xl font-extrabold">1. Start Easily</h1>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleContinueWithoutLogin()}
            className="ms-btn-primary tap-target-lg flex w-full items-center justify-between gap-3 px-6 py-4 text-left text-lg"
          >
            <span className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-extrabold">Continue Without Login (Default)</span>
                <span className="block text-xs font-medium opacity-90">
                  Start immediately — no password or email needed
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
              <span>{showLoginPanel ? "Hide Login Form" : "Sign In / Create Account (for Email/SMS Alerts)"}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDemoPatientLogin()}
              className="ms-btn-secondary tap-target inline-flex items-center gap-2 px-4 text-sm"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              <span>Demo Patient</span>
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
                  Sign In
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
                  Create Account
                </button>
              </div>

              {authMode === "login" ? (
                <>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Email or Phone Number"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
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
                    placeholder="Your Full Name"
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
                    placeholder="Create Password (min 8 characters)"
                    className="tap-target w-full rounded-xl border-2 px-4 py-3 text-base"
                    style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}
                  />
                </>
              )}

              <button type="submit" disabled={busy} className="ms-btn-primary tap-target-lg w-full text-base">
                {busy ? "Please wait..." : authMode === "login" ? "Sign In & Continue" : "Create Account & Continue"}
              </button>
            </form>
          )}
        </section>
      )}

      {/* CARD 2: Prescription Photo Upload / Camera */}
      {step === 2 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">2. Show Your Prescription</h1>

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
                {busy ? "Reading Prescription..." : "Take Photo / Upload"}
              </span>
              <span className="text-xs opacity-90">Camera, Photo, or PDF</span>
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
              <span className="text-lg font-extrabold">Try Sample Prescription</span>
              <span className="text-xs" style={{ color: "var(--ms-ink-muted)" }}>
                Instant synthetic prescription test
              </span>
            </button>
          </div>

          <QrPhoneUploadPanel
            title="Or Scan QR from Phone (Any Network)"
            onPrescriptionImported={handleImportedPrescription}
          />

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setViewMode("reports_workspace")}
              className="ms-btn-secondary tap-target inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>Or switch to Full Reports Page (with Section Narrator)</span>
            </button>
          </div>
        </section>
      )}

      {/* CARD 3: Confirm Name, Age, Gender (Keyboard or Speech-to-Text) */}
      {step === 3 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">3. Check Your Details</h1>

          <div className="grid gap-3 rounded-2xl border-2 p-4 sm:grid-cols-3" style={{ borderColor: "var(--ms-border)", backgroundColor: "var(--ms-surface-alt)" }}>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>Name</span>
              <span className="text-xl font-extrabold">{patientName || "Not found"}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>Age</span>
              <span className="text-xl font-extrabold">{patientAge ? `${patientAge} yrs` : "Not found"}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase" style={{ color: "var(--ms-ink-muted)" }}>Gender</span>
              <span className="text-xl font-extrabold capitalize">
                {patientGender === "prefer_not_to_say" ? "Not specified" : patientGender}
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
                <span>{busy ? "Preparing..." : "Yes, This is Correct"}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingDemographics(true)}
                className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Edit3 className="h-6 w-6" aria-hidden="true" />
                <span>No, Let Me Fix It</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-primary)" }}>
              <div className="space-y-1.5">
                <label className="block text-sm font-extrabold">Your Name (Type or Speak)</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter your name"
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
                <label className="block text-sm font-extrabold">Your Age (Type or Speak)</label>
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
                <label className="block text-sm font-extrabold">Gender</label>
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
                      {g}
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
                {busy ? "Saving & Explaining..." : "Save Details & Explain Prescription →"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* CARD 4: Simple Prescription Explanation */}
      {step === 4 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">4. Your Medicines in Simple Words</h1>

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
              <h2 className="text-base font-extrabold">Important Doctor Instructions &amp; Timings</h2>
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
              <h2 className="text-base font-extrabold">Why These Medicines Are Given</h2>
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
            <span>Next: Questions &amp; Answers</span>
            <ArrowRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* CARD 5: Questions & Answers (Keyboard or Speech-to-Text, Recorded) */}
      {step === 5 && (
        <section className="ms-card p-6 sm:p-8 space-y-5">
          <h1 className="text-2xl font-extrabold">5. Do You Have Any Questions?</h1>

          {wantsQuestions === null && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setWantsQuestions(true)}
                className="ms-btn-primary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
                <span>Yes, I Have a Question</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinishToReview()}
                className="ms-btn-secondary tap-target-lg flex items-center justify-center gap-2 py-4 text-lg font-extrabold"
              >
                <Check className="h-6 w-6" aria-hidden="true" />
                <span>No Questions, Finish →</span>
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
                        {m.role === "patient" ? "You" : "Dr. Sarthi"}
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
                            <span>Verified Citations &amp; Trusted Sources</span>
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
                        </div>
                      )}

                      {/* AI Clinical Disclaimer at Bottom of Response */}
                      {m.role === "assistant" && (
                        <p
                          className="mt-2 pt-2 border-t text-xs font-semibold"
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
                  "When should I take my medicine?",
                  "Should I take it before or after food?",
                  "When should I see the doctor again?",
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
                    placeholder="Type your question here..."
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
                        <span>Ask</span>
                      </>
                    )}
                  </button>
                </div>

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
                {busy ? "Saving Conversation..." : "Done Asking — Save & Finish →"}
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
            <h1 className="text-2xl font-extrabold">6. Saved for 24-Hour Doctor Verification</h1>
          </div>

          <div className="space-y-3 rounded-2xl border-2 p-4" style={{ borderColor: "var(--ms-primary)", backgroundColor: "var(--ms-primary-soft)" }}>
            <div className="flex items-center gap-2 font-extrabold">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <span>Prescription &amp; Q&amp;A Conversation Recorded</span>
            </div>
            <p className="text-sm font-semibold">
              A qualified doctor will review your prescription explanation and recorded conversation within{" "}
              <strong>{reviewReceipt?.eta_hours || 24} hours</strong>.
            </p>
            <div className="flex items-start gap-2 rounded-xl border p-3 text-xs font-bold" style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-border)" }}>
              <Bell className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--ms-primary)" }} aria-hidden="true" />
              <div>
                <span className="block uppercase tracking-wide opacity-75">
                  Notification Framework ({reviewReceipt?.notification.channel || "framework"})
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
            <h2 className="text-xl font-extrabold">How helpful was Dr. Sarthi today?</h2>
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
                Thank you! Your feedback ({rating}/5 stars) has been safely recorded.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Optional feedback (type or speak)..."
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
                <span>Save Feedback</span>
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
              Scan Another Prescription
            </button>
            <Link href="/patient/detailed" className="ms-btn-primary tap-target inline-flex items-center px-5 text-sm">
              Open Detailed Dashboard
            </Link>
          </div>
        </section>
      )}
      </>
      )}
    </div>
  );
}
