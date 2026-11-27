import type { SupportedLocale } from "@/i18n/I18nProvider";

export function getClinicalAdvisory(locale: SupportedLocale): string {
  switch (locale) {
    case "hi":
      return "क्लिनिकल मार्गदर्शन के लिए कृपया अपने डॉक्टर से परामर्श लें।";
    case "hi-Latn":
      return "Clinical guidance ke liye kripya apne doctor se consult karein.";
    case "bn":
      return "ক্লিনিক্যাল নির্দেশনার জন্য অনুগ্রহ করে আপনার ডাক্তারের সাথে পরামর্শ করুন।";
    case "mr":
      return "वैद्यकीय सल्ल्यासाठी कृपया आपल्या डॉक्टरांशी संपर्क साधा.";
    case "ta":
      return "மருத்துவ வழிகாட்டுதலுக்கு தயவுசெய்து உங்கள் மருத்துவரை அணுகவும்.";
    case "te":
      return "క్లినికల్ మార్గదర్శకత్వం కోసం దయచేసి మీ వైద్యుడిని సంప్రదించండి.";
    case "gu":
      return "તબીબી માર્ગદર્શન માટે કૃપા કરીને તમારા ડૉક્ટરની સલાહ લો.";
    case "kn":
      return "ಕ್ಲಿನಿಕಲ್ ಮಾರ್ಗದರ್ಶನಕ್ಕಾಗಿ ದಯವಿಟ್ಟು ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.";
    case "ml":
      return "ക്ലിനിക്കൽ മാർഗ്ഗനിർദ്ദേശത്തിനായി ദയവായി നിങ്ങളുടെ ഡോക്ടറെ സമീപിക്കുക.";
    case "pa":
      return "ਕਲੀਨਿਕਲ ਮਾਰਗਦਰਸ਼ਨ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।";
    default:
      return "Please consult your doctor for clinical guidance.";
  }
}
