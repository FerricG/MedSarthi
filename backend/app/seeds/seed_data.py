"""Idempotent seed script for MedSarthi synthetic KB, demo users, consultation, and lab document.

Educational prototype using synthetic data only; not clinically validated.
"""

import asyncio
from datetime import UTC, date, datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import hash_password, sha256_hex
from app.models import (
    Consultation,
    DoctorPatientLink,
    DoctorProfile,
    KBEntry,
    MedicalDocument,
    PatientPreference,
    PatientProfile,
    User,
    compute_age_accessibility_defaults,
)

REVIEWED_AT = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)

DEMO_PATIENT_EMAIL = "ramesh.demo@medsarthi.local"
DEMO_PATIENT_PASSWORD = "DemoPatient#2026"
DEMO_DOCTOR_EMAIL = "priya.doctor@medsarthi.local"
DEMO_DOCTOR_PASSWORD = "DemoDoctor#2026"

KB_SEED_ENTRIES: list[dict] = [
    {
        "entry_type": "condition",
        "canonical_name": "Upper Respiratory Infection / Acute Nasopharyngitis",
        "slug": "upper-respiratory-infection",
        "aliases": ["URI", "Acute Nasopharyngitis", "Common Cold", "Upper Airway Infection"],
        "body_system": "respiratory",
        "simple_en": (
            "An infection of the nose and upper throat, often called a common cold. "
            "It is usually caused by a virus and affects the upper airway above the lungs."
        ),
        "detailed_en": (
            "Acute nasopharyngitis (upper respiratory infection) causes swelling and extra mucus "
            "in the nasal passages and throat, leading to symptoms like a runny nose, sore throat, "
            "sneezing, or cough. Most cases are viral, though your doctor decides whether rest and "
            "symptom relief alone are needed or whether further evaluation is required."
        ),
        "translations": {
            "hi": {
                "name": "ऊपरी श्वसन पथ का संक्रमण (एक्यूट नासोफैरिंजाइटिस / सामान्य जुकाम)",
                "simple": "यह नाक और ऊपरी गले का संक्रमण है, जिसे आम भाषा में जुकाम कहा जाता है। यह आमतौर पर वायरस से होता है और फेफड़ों से ऊपर के हिस्से को प्रभावित करता है।",
                "detailed": "एक्यूट नासोफैरिंजाइटिस में नाक और गले के ऊपरी हिस्से में सूजन व बलगम बढ़ जाता है, जिससे नाक बहना, गले में खराश या खांसी हो सकती है। आपकी स्थिति के अनुसार सही देखभाल आपके डॉक्टर तय करते हैं।",
            },
            "hi-Latn": {
                "name": "Upper Respiratory Infection (Acute Nasopharyngitis / Zukam)",
                "simple": "Yeh naak aur oopari gale ka infection hai, jise aam bhasha mein zukam kehte hain. Yeh aksar virus ki wajah se hota hai aur phephdon ke upar wale hisse ko asar karta hai.",
                "detailed": "Acute nasopharyngitis mein naak aur gale ke oopari hisse mein sujan aur balgam badh jata hai, jisse naak behna, gale mein kharash ya khansi ho sakti hai. Aapke liye sahi dekhbhal aapke doctor tay karte hain.",
            },
        },
        "metadata_json": {
            "usage_example": "Doctor note: 'Acute nasopharyngitis — supportive care and hydration advised.'",
            "when_to_ask_doctor": "Ask your doctor if symptoms worsen after several days, fever stays high, or breathing feels difficult.",
            "curated_diagram_key": "respiratory_airways",
            "related_slugs": ["fever", "pneumonia", "paracetamol"],
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/commoncold.html",
    },
    {
        "entry_type": "condition",
        "canonical_name": "Pneumonia",
        "slug": "pneumonia",
        "aliases": ["Lung Infection", "Community-Acquired Pneumonia", "CAP"],
        "body_system": "respiratory",
        "simple_en": (
            "An infection that causes inflammation in the tiny air sacs inside one or both lungs, "
            "which can make breathing harder and cause cough or fever."
        ),
        "detailed_en": (
            "Pneumonia occurs when bacteria, viruses, or other germs infect the deeper air sacs (alveoli) "
            "of the lungs, causing fluid or mucus to build up. Unlike an upper airway cold, pneumonia involves "
            "the lungs directly and requires timely medical guidance and prescribed follow-up."
        ),
        "translations": {
            "hi": {
                "name": "निमोनिया (फेफड़ों का संक्रमण)",
                "simple": "यह फेफड़ों की छोटी वायु थैलियों का संक्रमण है, जिससे खांसी, बुखार और सांस लेने में कठिनाई हो सकती है।",
                "detailed": "निमोनिया तब होता है जब बैक्टीरिया या वायरस फेफड़ों के अंदरूनी हिस्सों को प्रभावित करते हैं और वहां तरल या बलगम जमा हो जाता है। इसके लिए डॉक्टर की सलाह और सही इलाज जरूरी होता है।",
            },
            "hi-Latn": {
                "name": "Pneumonia (Phephdon ka Infection)",
                "simple": "Yeh phephdon ke andar ki chhoti hawa ki thailiyon ka infection hai, jisse khansi, bukhar aur saans lene mein dikkat ho sakti hai.",
                "detailed": "Pneumonia tab hota hai jab bacteria ya virus phephdon ke gehre hisse ko prabhavit karte hain aur wahan fluid ya balgam jama ho jata hai. Iske liye doctor ki salah aur prescribed ilaaj zaroori hai.",
            },
        },
        "metadata_json": {
            "usage_example": "Doctor note: 'Suspected lower respiratory tract infection / pneumonia; chest X-ray advised.'",
            "when_to_ask_doctor": "Seek urgent care if you have fast breathing, chest pain, confusion, or bluish lips.",
            "curated_diagram_key": "respiratory_airways",
            "related_slugs": ["upper-respiratory-infection", "fever", "azithromycin", "amoxicillin"],
        },
        "source_name": "WHO",
        "source_url": "https://www.who.int/news-room/fact-sheets/detail/pneumonia",
    },
    {
        "entry_type": "condition",
        "canonical_name": "Hypertension",
        "slug": "hypertension",
        "aliases": ["High Blood Pressure", "HTN", "Raised BP"],
        "body_system": "cardiovascular",
        "simple_en": (
            "Long-term high blood pressure, meaning the force of blood pushing against the walls "
            "of your blood vessels stays higher than usual."
        ),
        "detailed_en": (
            "Hypertension often has no obvious symptoms, which is why regular blood pressure checks are important. "
            "Over time, sustained high pressure makes the heart work harder and can affect blood vessels, kidneys, "
            "and other organs. Doctors manage it with lifestyle measures and sometimes daily medicines."
        ),
        "translations": {
            "hi": {
                "name": "उच्च रक्तचाप (हाइपरटेंशन / हाई ब्लड प्रेशर)",
                "simple": "इसका मतलब है कि आपकी रक्त नलिकाओं की दीवारों पर बहते खून का दबाव सामान्य से अधिक रहता है।",
                "detailed": "हाई ब्लड प्रेशर में अक्सर कोई स्पष्ट लक्षण नहीं दिखते, इसलिए नियमित जांच जरूरी है। लंबे समय तक बढ़ा हुआ दबाव दिल और रक्त नलिकाओं पर अतिरिक्त जोर डालता है।",
            },
            "hi-Latn": {
                "name": "Hypertension (High Blood Pressure / High BP)",
                "simple": "Iska matlab hai ki aapki khoon ki naliyon ki deewaron par khoon ka dabav normal se zyada rehta hai.",
                "detailed": "High blood pressure mein aksar koi seedha lakshan nahi dikhta, isliye regular BP check zaroori hai. Lambe samay tak high BP rehne se dil aur naliyon par zyada zor padta hai.",
            },
        },
        "metadata_json": {
            "usage_example": "Doctor note: 'Essential hypertension — continue Amlodipine 5 mg and monitor home BP.'",
            "when_to_ask_doctor": "Ask your doctor what your target blood pressure range is and seek urgent care for severe chest pain or sudden headache.",
            "curated_diagram_key": "heart_circulation_bp",
            "related_slugs": ["amlodipine", "creatinine"],
        },
        "source_name": "WHO",
        "source_url": "https://www.who.int/news-room/fact-sheets/detail/hypertension",
    },
    {
        "entry_type": "lab_test",
        "canonical_name": "Creatinine",
        "slug": "creatinine",
        "aliases": ["Serum Creatinine", "S. Creatinine", "Cr"],
        "body_system": "renal",
        "simple_en": (
            "A blood test that helps check how well your kidneys are filtering natural waste from your blood."
        ),
        "detailed_en": (
            "Creatinine is a normal waste product created by everyday muscle activity. Healthy kidneys filter "
            "creatinine out of the blood into urine. Doctors look at your creatinine number alongside age, hydration, "
            "and other tests (such as eGFR) using the specific reference range printed on your lab report."
        ),
        "translations": {
            "hi": {
                "name": "क्रिएटिनिन (सीरम क्रिएटिनिन जांच)",
                "simple": "यह एक खून की जांच है जो बताती है कि आपकी किडनी खून से अपशिष्ट पदार्थों को कितनी अच्छी तरह साफ कर रही है।",
                "detailed": "क्रिएटिनिन मांसपेशियों के सामान्य काम से बनने वाला एक अपशिष्ट पदार्थ है जिसे स्वस्थ किडनी खून से छानकर पेशाब के रास्ते बाहर निकालती हैं। सही संदर्भ सीमा आपकी लैब रिपोर्ट पर लिखी होती है।",
            },
            "hi-Latn": {
                "name": "Creatinine (Kidney Function Blood Test)",
                "simple": "Yeh ek blood test hai jo dikhata hai ki aapki kidneys khoon se kachra kitni acchi tarah saaf kar rahi hain.",
                "detailed": "Creatinine muscles ke rozana kaam se banne wala normal waste hai jise healthy kidneys khoon se chhaankar bahar nikalte hain. Doctor iski report aapki lab ke reference range aur umar ke saath dekhte hain.",
            },
        },
        "metadata_json": {
            "usage_example": "Lab report: 'Serum Creatinine: 1.0 mg/dL (Reference range varies by laboratory).'",
            "normal_ranges_info": "Typical adult lab ranges are often near 0.6 to 1.3 mg/dL, but exact normal ranges vary by laboratory method, age, and sex.",
            "when_to_ask_doctor": "Ask your doctor what your creatinine value means together with your eGFR and hydration status.",
            "curated_diagram_key": "heart_circulation_bp",
            "related_slugs": ["hypertension", "metformin"],
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/lab-tests/creatinine-test/",
    },
    {
        "entry_type": "lab_test",
        "canonical_name": "HbA1c",
        "slug": "hba1c",
        "aliases": ["A1C", "Glycated Hemoglobin", "Hemoglobin A1c", "HbA1C"],
        "body_system": "endocrine",
        "simple_en": (
            "A blood test that shows your average blood sugar level over the past 2 to 3 months."
        ),
        "detailed_en": (
            "Sugar in your blood naturally attaches to hemoglobin inside red blood cells. Because red blood cells "
            "live for roughly 2 to 3 months, measuring HbA1c gives doctors a broader picture of longer-term blood sugar "
            "patterns than a single finger-prick or fasting glucose test."
        ),
        "translations": {
            "hi": {
                "name": "एचबीए1सी (HbA1c — पिछले 2-3 महीनों की औसत शुगर जांच)",
                "simple": "यह खून की जांच पिछले 2 से 3 महीनों के दौरान आपके ब्लड शुगर का औसत स्तर दिखाती है।",
                "detailed": "खून में मौजूद शुगर लाल रक्त कोशिकाओं के हीमोग्लोबिन से जुड़ती है। चूंकि ये कोशिकाएं लगभग 2-3 महीने रहती हैं, इसलिए HbA1c से लंबे समय की शुगर का अंदाजा मिलता है।",
            },
            "hi-Latn": {
                "name": "HbA1c (2-3 Mahine ka Average Blood Sugar Test)",
                "simple": "Yeh blood test pichhle 2 se 3 mahine mein aapke khoon mein average sugar level dikhata hai.",
                "detailed": "Khoon ki sugar red blood cells ke hemoglobin se judti hai. Kyunki yeh cells lagbhag 2-3 mahine rehte hain, HbA1c ek din ki reading ke bajay lambe samay ka pattern dikhata hai.",
            },
        },
        "metadata_json": {
            "usage_example": "Lab report: 'HbA1c: 6.8% — discuss target range with your physician.'",
            "normal_ranges_info": "Lab interpretation thresholds differ between screening and ongoing diabetes targets; your doctor sets your personal target.",
            "when_to_ask_doctor": "Ask your doctor what your personal HbA1c target is and how often to repeat the test.",
            "curated_diagram_key": "digestive_med_pathway",
            "related_slugs": ["metformin", "creatinine"],
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/a1c.html",
    },
    {
        "entry_type": "symptom",
        "canonical_name": "Fever",
        "slug": "fever",
        "aliases": ["Pyrexia", "Elevated Temperature", "Febrile"],
        "body_system": "systemic",
        "simple_en": (
            "A temporary rise in body temperature, often a sign that your body's immune system is fighting an infection."
        ),
        "detailed_en": (
            "Normal body temperature varies slightly by person and measurement site, often around 37°C (98.6°F). "
            "A temperature of 38°C (100.4°F) or higher is generally considered a fever. Fever itself is a symptom, "
            "not an illness, and your doctor evaluates what is causing it."
        ),
        "translations": {
            "hi": {
                "name": "बुखार (पायरेक्सिया / शरीर का तापमान बढ़ना)",
                "simple": "शरीर के तापमान का अस्थायी रूप से बढ़ना, जो अक्सर इस बात का संकेत होता है कि शरीर किसी संक्रमण से लड़ रहा है।",
                "detailed": "सामान्य तापमान लगभग 37°C (98.6°F) के आसपास होता है और 38°C (100.4°F) या उससे ऊपर होने पर बुखार माना जाता है। बुखार एक लक्षण है और डॉक्टर इसके कारण की जांच करते हैं।",
            },
            "hi-Latn": {
                "name": "Fever (Bukhar / Body Temperature Badhna)",
                "simple": "Shareer ka temperature thodi der ke liye badh jana, jo aksar dikhata hai ki body kisi infection se lad rahi hai.",
                "detailed": "Normal body temperature lagbhag 37°C (98.6°F) hota hai aur 38°C (100.4°F) ya usse zyada hone par bukhar kaha jata hai. Bukhar ek lakshan hai jiska kaaran doctor dekhte hain.",
            },
        },
        "metadata_json": {
            "usage_example": "Doctor note: 'Low-grade fever for 2 days; monitor temperature and stay hydrated.'",
            "when_to_ask_doctor": "Seek urgent medical care if fever is very high, lasts more than 3 days, or comes with confusion, stiff neck, or trouble breathing.",
            "curated_diagram_key": "respiratory_airways",
            "related_slugs": ["upper-respiratory-infection", "pneumonia", "paracetamol"],
        },
        "source_name": "NHS",
        "source_url": "https://www.nhs.uk/conditions/fever-in-adults/",
    },
    {
        "entry_type": "medicine",
        "canonical_name": "Paracetamol",
        "slug": "paracetamol",
        "aliases": ["Acetaminophen", "Crocin", "Dolo", "Calpol"],
        "body_system": "systemic",
        "simple_en": (
            "A commonly used medicine to help lower fever and relieve mild to moderate pain such as headaches or body aches."
        ),
        "detailed_en": (
            "Paracetamol acts on temperature-regulating and pain-signaling pathways in the nervous system. "
            "Taking more than the doctor-prescribed or maximum daily dose—or combining multiple cold medicines "
            "that also contain paracetamol—can harm the liver."
        ),
        "translations": {
            "hi": {
                "name": "पैरासिटामोल (दर्द और बुखार की दवा)",
                "simple": "यह बुखार कम करने और सिरदर्द या बदन दर्द से राहत देने के लिए आमतौर पर दी जाने वाली दवा है।",
                "detailed": "पैरासिटामोल डॉक्टर द्वारा बताई गई मात्रा में ही लेनी चाहिए। एक से अधिक जुकाम की दवाइयों को एक साथ लेने पर अधिक पैरासिटामोल से लिवर को नुकसान हो सकता है।",
            },
            "hi-Latn": {
                "name": "Paracetamol (Bukhar aur Dard ki Dawa)",
                "simple": "Yeh bukhar kam karne aur sardard ya badan dard mein aaram dene wali aam dawa hai.",
                "detailed": "Paracetamol hamesha doctor ki batayi matra mein hi leni chahiye. Ek saath kai cold medicines lene se extra paracetamol liver ko nuksan pahuncha sakta hai.",
            },
        },
        "metadata_json": {
            "drug_class": "Analgesic and Antipyretic (Pain and Fever Reliever)",
            "brand_examples": ["Dolo", "Crocin", "Calpol"],
            "common_purposes": "Helps reduce fever and ease everyday aches; your doctor determines why it was recommended for you.",
            "mechanism": "Helps reset the body's temperature control center and lowers pain signals.",
            "common_side_effects": ["Usually well tolerated at prescribed doses; occasional mild stomach upset."],
            "serious_warnings": [
                "Do NOT exceed your doctor's maximum daily dose.",
                "Check labels on other cough/cold medicines so you do not accidentally double-dose paracetamol.",
                "Seek urgent care for yellowing of eyes/skin or severe upper-right abdominal pain."
            ],
            "precautions": ["Discuss existing liver conditions or alcohol use with your doctor before taking."],
            "food_and_interactions": "Can usually be taken with or without food. Check before combining with other combination cold/pain tablets.",
            "questions_for_doctor": [
                "What is the maximum number of tablets I can take in 24 hours?",
                "Do any of my other medicines also contain paracetamol?"
            ],
            "curated_diagram_key": "digestive_med_pathway",
        },
        "source_name": "NHS",
        "source_url": "https://www.nhs.uk/medicines/paracetamol-for-adults/",
    },
    {
        "entry_type": "medicine",
        "canonical_name": "Azithromycin",
        "slug": "azithromycin",
        "aliases": ["Azithral", "Azee", "Zithromax"],
        "body_system": "respiratory",
        "simple_en": (
            "An antibiotic medicine prescribed by doctors to treat certain bacterial infections."
        ),
        "detailed_en": (
            "Azithromycin belongs to the macrolide antibiotic group, which slows or stops bacteria from growing. "
            "Antibiotics do not treat viral colds; your doctor prescribes Azithromycin only when a bacterial infection "
            "is suspected or confirmed, and it should be completed exactly as prescribed."
        ),
        "translations": {
            "hi": {
                "name": "एज़िथ्रोमाइसिन (एंटीबायोटिक दवा)",
                "simple": "यह डॉक्टर द्वारा कुछ बैक्टीरियल संक्रमणों के इलाज के लिए दी जाने वाली एक एंटीबायोटिक दवा है।",
                "detailed": "एज़िथ्रोमाइसिन बैक्टीरिया को बढ़ने से रोकती है। यह वायरल जुकाम पर असर नहीं करती, इसलिए इसे केवल डॉक्टर की सलाह से और पूरा कोर्स समय पर पूरा करके ही लेना चाहिए।",
            },
            "hi-Latn": {
                "name": "Azithromycin (Antibiotic Medicine)",
                "simple": "Yeh ek antibiotic dawa hai jo doctor kuch bacterial infections ke ilaaj ke liye dete hain.",
                "detailed": "Azithromycin bacteria ko badhne se rokti hai. Antibiotics viral zukam par kaam nahi karte, isliye ise sirf doctor ki salah se aur poora course complete karke hi lena chahiye.",
            },
        },
        "metadata_json": {
            "drug_class": "Macrolide Antibiotic",
            "brand_examples": ["Azithral", "Azee", "Zithromax"],
            "common_purposes": "Used for specific doctor-diagnosed bacterial infections (for example certain respiratory or ear infections).",
            "mechanism": "Prevents susceptible bacteria from making proteins they need to multiply.",
            "common_side_effects": ["Mild nausea", "Loose stools or diarrhea", "Stomach discomfort"],
            "serious_warnings": [
                "Do NOT take without a doctor's prescription or skip doses early unless your doctor advises.",
                "Seek urgent care for severe allergic reactions (rash, facial swelling, trouble breathing) or irregular heartbeat."
            ],
            "precautions": ["Tell your doctor about heart rhythm conditions, liver issues, or all current medicines."],
            "food_and_interactions": "Some antacids containing aluminum or magnesium can reduce absorption; check spacing with your doctor or pharmacist.",
            "questions_for_doctor": [
                "How many days should I take this antibiotic?",
                "Should I space this apart from antacids or any other medicine?"
            ],
            "curated_diagram_key": "digestive_med_pathway",
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/druginfo/meds/a697037.html",
    },
    {
        "entry_type": "medicine",
        "canonical_name": "Metformin",
        "slug": "metformin",
        "aliases": ["Glycomet", "Glucophage", "Metformin HCl"],
        "body_system": "endocrine",
        "simple_en": (
            "A medicine commonly prescribed to help manage blood sugar levels in people with type 2 diabetes."
        ),
        "detailed_en": (
            "Metformin helps lower blood sugar by reducing excess sugar released by the liver and helping the body "
            "respond better to its own insulin. Taking it with or right after meals often helps reduce stomach upset."
        ),
        "translations": {
            "hi": {
                "name": "मेटफॉर्मिन (ब्लड शुगर नियंत्रित करने की दवा)",
                "simple": "यह टाइप 2 डायबिटीज में ब्लड शुगर को नियंत्रित रखने के लिए आमतौर पर दी जाने वाली दवा है।",
                "detailed": "मेटफॉर्मिन लिवर द्वारा अतिरिक्त शुगर छोड़ने को कम करती है और शरीर को इंसुलिन का बेहतर उपयोग करने में मदद करती है। इसे भोजन के साथ या बाद में लेने से पेट की परेशानी कम हो सकती है।",
            },
            "hi-Latn": {
                "name": "Metformin (Blood Sugar Control Medicine)",
                "simple": "Yeh type 2 diabetes mein blood sugar ko control mein rakhne ke liye aksar di jaane wali dawa hai.",
                "detailed": "Metformin liver se extra sugar nikalne ko kam karti hai aur body ko insulin ka behtar use karne mein madad karti hai. Khaane ke saath ya turant baad lene se pet kharab hone ka khatra kam hota hai.",
            },
        },
        "metadata_json": {
            "drug_class": "Biguanide (Blood Sugar Medicine)",
            "brand_examples": ["Glycomet", "Glucophage"],
            "common_purposes": "Used under medical supervision to help keep blood sugar in a healthy range.",
            "mechanism": "Lowers sugar release from the liver and improves how muscles use glucose.",
            "common_side_effects": ["Mild stomach upset", "Nausea", "Loose stools (often improves after meals)"],
            "serious_warnings": [
                "Do NOT crush or chew extended-release (SR/XR) tablets unless your doctor or pharmacist says it is safe.",
                "Tell your doctor before imaging scans using contrast dye or if you develop severe vomiting/dehydration."
            ],
            "precautions": ["Doctors monitor kidney function (such as creatinine) periodically while on metformin."],
            "food_and_interactions": "Usually taken with or immediately after meals; avoid excessive alcohol.",
            "questions_for_doctor": [
                "Is my tablet regular or extended-release (SR/XR)?",
                "When should I check my kidney test (creatinine) and HbA1c next?"
            ],
            "curated_diagram_key": "digestive_med_pathway",
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/druginfo/meds/a696005.html",
    },
    {
        "entry_type": "medicine",
        "canonical_name": "Amlodipine",
        "slug": "amlodipine",
        "aliases": ["Amlong", "Amlokind", "Norvasc"],
        "body_system": "cardiovascular",
        "simple_en": (
            "A daily medicine used to help relax blood vessels so blood flows more easily and blood pressure stays lower."
        ),
        "detailed_en": (
            "Amlodipine is a calcium channel blocker prescribed for high blood pressure (hypertension) and certain "
            "heart-related chest symptoms. It works gradually over 24 hours, so taking it at the same time each day "
            "and not stopping abruptly without consulting your doctor is important."
        ),
        "translations": {
            "hi": {
                "name": "एम्लोडिपिन (ब्लड प्रेशर की दवा)",
                "simple": "यह रक्त नलिकाओं को आराम देकर खून का बहाव आसान बनाने और ब्लड प्रेशर कम रखने वाली दवा है।",
                "detailed": "एम्लोडिपिन एक कैल्शियम चैनल ब्लॉकर दवा है जो 24 घंटे धीरे-धीरे काम करती है। इसे रोज एक ही समय पर लेना चाहिए और डॉक्टर की सलाह के बिना अचानक बंद नहीं करना चाहिए।",
            },
            "hi-Latn": {
                "name": "Amlodipine (Blood Pressure ki Dawa)",
                "simple": "Yeh khoon ki naliyon ko relax karke khoon ka bahav aasaan banati hai aur blood pressure kam rakhti hai.",
                "detailed": "Amlodipine ek calcium channel blocker medicine hai jo poore din dheere-dheere kaam karti hai. Ise roz ek hi time par lena chahiye aur doctor se pooche bina achanak band nahi karna chahiye.",
            },
        },
        "metadata_json": {
            "drug_class": "Calcium Channel Blocker (Blood Pressure Medicine)",
            "brand_examples": ["Amlong", "Amlokind", "Norvasc"],
            "common_purposes": "Helps control high blood pressure and reduce strain on the heart.",
            "mechanism": "Relaxes smooth muscle in artery walls so blood pressure drops steadily.",
            "common_side_effects": ["Mild ankle or foot swelling", "Flushing (warm feeling)", "Mild dizziness when standing up quickly"],
            "serious_warnings": [
                "Do NOT stop taking blood pressure medicine suddenly without asking your doctor.",
                "Seek prompt medical advice if you experience fainting, worsening chest pain, or severe swelling."
            ],
            "precautions": ["Stand up slowly from sitting or lying down if you feel lightheaded."],
            "food_and_interactions": "Can be taken with or without food at the same time every day.",
            "questions_for_doctor": [
                "Should I take this tablet in the morning or evening?",
                "What should I do if I notice mild ankle swelling?"
            ],
            "curated_diagram_key": "heart_circulation_bp",
        },
        "source_name": "NHS",
        "source_url": "https://www.nhs.uk/medicines/amlodipine/",
    },
    {
        "entry_type": "medicine",
        "canonical_name": "Amoxicillin",
        "slug": "amoxicillin",
        "aliases": ["Mox", "Novamox", "Amoxil"],
        "body_system": "respiratory",
        "simple_en": (
            "A penicillin-type antibiotic prescribed by doctors to treat specific bacterial infections."
        ),
        "detailed_en": (
            "Amoxicillin helps clear bacterial infections by preventing bacteria from building their protective cell walls. "
            "Because it belongs to the penicillin family, always inform your doctor if you have ever had an allergy to penicillin."
        ),
        "translations": {
            "hi": {
                "name": "एमोक्सिसिलिन (पेनिसिलिन समूह की एंटीबायोटिक)",
                "simple": "यह डॉक्टर द्वारा कुछ बैक्टीरियल संक्रमणों के इलाज के लिए दी जाने वाली एंटीबायोटिक दवा है।",
                "detailed": "एमोक्सिसिलिन बैक्टीरिया की बाहरी दीवार बनने से रोकती है। यदि आपको कभी पेनिसिलिन से एलर्जी हुई है, तो यह दवा लेने से पहले अपने डॉक्टर को जरूर बताएं।",
            },
            "hi-Latn": {
                "name": "Amoxicillin (Penicillin Group Antibiotic)",
                "simple": "Yeh ek antibiotic dawa hai jo doctor kuch bacterial infections ke ilaaj ke liye dete hain.",
                "detailed": "Amoxicillin bacteria ki outer wall banne se rok kar infection ko khatam karti hai. Agar aapko kabhi penicillin allergy rahi hai to doctor ko zaroor batayein.",
            },
        },
        "metadata_json": {
            "drug_class": "Penicillin-Class Antibiotic",
            "brand_examples": ["Mox", "Novamox"],
            "common_purposes": "Treats doctor-diagnosed bacterial infections of the throat, ear, sinuses, or chest.",
            "mechanism": "Disrupts bacterial cell wall formation so bacteria cannot survive.",
            "common_side_effects": ["Mild nausea", "Mild diarrhea"],
            "serious_warnings": [
                "Do NOT take if you have a known penicillin or beta-lactam allergy unless explicitly cleared by your doctor.",
                "Stop and seek urgent medical help immediately for hives, swelling, or breathing trouble."
            ],
            "precautions": ["Finish the prescribed duration even if you feel better, unless your doctor directs otherwise."],
            "food_and_interactions": "Can usually be taken with or without food with a full glass of water.",
            "questions_for_doctor": [
                "How many hours apart should I space each dose?",
                "What signs mean I should contact you right away?"
            ],
            "curated_diagram_key": "digestive_med_pathway",
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/druginfo/meds/a685001.html",
    },
    {
        "entry_type": "medicine",
        "canonical_name": "Cefixime",
        "slug": "cefixime",
        "aliases": ["Taxim-O", "Zifi", "Mahacef"],
        "body_system": "respiratory",
        "simple_en": (
            "A cephalosporin antibiotic medicine prescribed to treat specific bacterial infections."
        ),
        "detailed_en": (
            "Cefixime is an oral antibiotic that targets bacteria causing certain respiratory, ear, or urinary tract "
            "infections. Like all antibiotics, it does not work for viral illnesses and should only be taken as prescribed."
        ),
        "translations": {
            "hi": {
                "name": "सेफिक्सिम (सेफेलोस्पोरिन एंटीबायोटिक दवा)",
                "simple": "यह डॉक्टर द्वारा कुछ बैक्टीरियल संक्रमणों के लिए दी जाने वाली एक एंटीबायोटिक दवा है।",
                "detailed": "सेफिक्सिम बैक्टीरिया से होने वाले कुछ संक्रमणों में दी जाती है। यह वायरल सर्दी-जुकाम में काम नहीं करती, इसलिए केवल डॉक्टर की सलाह से ही इसका उपयोग करें।",
            },
            "hi-Latn": {
                "name": "Cefixime (Cephalosporin Antibiotic)",
                "simple": "Yeh ek antibiotic medicine hai jo doctor kuch bacterial infections ke liye prescribe karte hain.",
                "detailed": "Cefixime bacterial infections par kaam karti hai, viral zukam par nahi. Ise hamesha doctor ke bataye schedule ke hisaab se hi lein.",
            },
        },
        "metadata_json": {
            "drug_class": "Third-Generation Cephalosporin Antibiotic",
            "brand_examples": ["Taxim-O", "Zifi", "Mahacef"],
            "common_purposes": "Prescribed by clinicians for susceptible bacterial infections.",
            "mechanism": "Interferes with bacterial cell wall construction.",
            "common_side_effects": ["Mild loose stools", "Abdominal discomfort", "Gas"],
            "serious_warnings": [
                "Inform your doctor if you have had allergies to cephalosporins or penicillins.",
                "Seek medical care for severe watery diarrhea or allergic rash."
            ],
            "precautions": ["Stay well hydrated and inform your doctor about kidney conditions."],
            "food_and_interactions": "Take at evenly spaced intervals as prescribed; may be taken with food if stomach upset occurs.",
            "questions_for_doctor": [
                "Should I take this once or twice daily, and for how many days?",
                "Can I take this alongside my regular medicines?"
            ],
            "curated_diagram_key": "digestive_med_pathway",
        },
        "source_name": "MedlinePlus",
        "source_url": "https://medlineplus.gov/druginfo/meds/a690007.html",
    },
]


async def seed_database(session: AsyncSession | None = None) -> dict[str, int]:
    """Seed synthetic medical KB, Demo Patient, Demo Doctor, sample consultation & lab doc."""
    owns_session = session is None
    if session is None:
        await init_db()
        session = AsyncSessionLocal()

    try:
        kb_created = 0
        for item in KB_SEED_ENTRIES:
            existing_kb = (
                await session.execute(select(KBEntry).where(KBEntry.slug == item["slug"]))
            ).scalar_one_or_none()
            if not existing_kb:
                session.add(KBEntry(**item, last_reviewed_at=REVIEWED_AT))
                kb_created += 1

        # Demo Doctor (Dr. Priya Mehta)
        doc_user = (
            await session.execute(select(User).where(User.email == DEMO_DOCTOR_EMAIL))
        ).scalar_one_or_none()
        if not doc_user:
            doc_user = User(
                email=DEMO_DOCTOR_EMAIL,
                phone="+919800000002",
                password_hash=hash_password(DEMO_DOCTOR_PASSWORD),
                role="doctor",
                is_active=True,
            )
            session.add(doc_user)
            await session.flush()

        doc_profile = (
            await session.execute(select(DoctorProfile).where(DoctorProfile.user_id == doc_user.id))
        ).scalar_one_or_none()
        if not doc_profile:
            doc_profile = DoctorProfile(
                user_id=doc_user.id,
                full_name="Dr. Priya Mehta",
                specialty="Internal Medicine",
                registration_number="SYNTH-MCI-2026-0142",
                clinic_name="MedSarthi Synthetic Teaching Clinic",
                languages_spoken=["en", "hi", "hi-Latn"],
                verification_status="verified",
            )
            session.add(doc_profile)
            await session.flush()

        # Demo Patient (Ramesh Sharma, age 64)
        pat_user = (
            await session.execute(select(User).where(User.email == DEMO_PATIENT_EMAIL))
        ).scalar_one_or_none()
        if not pat_user:
            pat_user = User(
                email=DEMO_PATIENT_EMAIL,
                phone="+919800000001",
                password_hash=hash_password(DEMO_PATIENT_PASSWORD),
                role="patient",
                is_active=True,
            )
            session.add(pat_user)
            await session.flush()

        pat_profile = (
            await session.execute(select(PatientProfile).where(PatientProfile.user_id == pat_user.id))
        ).scalar_one_or_none()
        if not pat_profile:
            pat_profile = PatientProfile(
                user_id=pat_user.id,
                name="Ramesh Sharma",
                age_years=64,
                gender="male",
                onboarding_completed=True,
                onboarding_step=7,
            )
            session.add(pat_profile)
            await session.flush()

        pat_prefs = (
            await session.execute(
                select(PatientPreference).where(PatientPreference.patient_id == pat_profile.id)
            )
        ).scalar_one_or_none()
        if not pat_prefs:
            age_defaults = compute_age_accessibility_defaults(64)
            pat_prefs = PatientPreference(
                patient_id=pat_profile.id,
                preferred_language="en",
                reading_comfort_level="simple",
                explanation_depth="simple",
                preferred_response_format="text_audio",
                font_size=str(age_defaults["font_size"]),
                font_scale_pct=int(age_defaults["font_scale_pct"]),
                audio_speed=float(age_defaults["audio_speed"]),
                high_contrast=False,
                voice_preference="warm_female",
                terminology_preference="plain_plus_medical",
                units_preference="metric",
                explanation_style="calm_reassuring",
                auto_play_audio=False,
                accessibility_manual_override=False,
            )
            session.add(pat_prefs)
            await session.flush()

        # Explicit Doctor-Patient Consent Link
        dpl = (
            await session.execute(
                select(DoctorPatientLink).where(
                    DoctorPatientLink.doctor_id == doc_profile.id,
                    DoctorPatientLink.patient_id == pat_profile.id,
                )
            )
        ).scalar_one_or_none()
        if not dpl:
            session.add(
                DoctorPatientLink(
                    doctor_id=doc_profile.id,
                    patient_id=pat_profile.id,
                    consent_status="active",
                    consent_scope="linked_care",
                    initiated_by="patient",
                    consent_granted_at=datetime.now(UTC),
                )
            )

        # Sample Synthetic Consultation (Approved & Shared)
        existing_consult = (
            await session.execute(
                select(Consultation).where(Consultation.patient_id == pat_profile.id)
            )
        ).scalar_one_or_none()
        if not existing_consult:
            raw_doctor_note = (
                "SYNTHETIC CASE: Ramesh Sharma (64M). BP 142/88 mmHg. "
                "Diagnoses: Acute Nasopharyngitis (Upper Respiratory Infection) and Hypertension. "
                "Rx: 1) Paracetamol 500 mg SOS for fever/body ache, max 4 tablets in 24 hours. "
                "2) Continue Amlodipine 5 mg once daily every morning after breakfast — do NOT stop abruptly. "
                "Follow up in 5 days or sooner if fever > 102 F or breathing difficulty."
            )
            now = datetime.now(UTC)
            existing_consult = Consultation(
                patient_id=pat_profile.id,
                doctor_id=doc_profile.id,
                source_type="doctor_entered",
                title="Follow-up Visit: Blood Pressure & Viral Cough (Synthetic)",
                visit_date=date(2026, 11, 24),
                original_doctor_input=raw_doctor_note,
                original_input_hash=sha256_hex(raw_doctor_note),
                original_input_locked_at=now,
                structured_data={
                    "diagnoses": [
                        "Acute Nasopharyngitis (Upper Respiratory Infection)",
                        "Hypertension",
                    ],
                    "vitals": {"blood_pressure": "142/88 mmHg"},
                    "medications": [
                        {
                            "name": "Paracetamol",
                            "dose": "500 mg",
                            "frequency": "SOS (as needed for fever/body ache)",
                            "warnings": ["Do NOT exceed 4 tablets in 24 hours"],
                        },
                        {
                            "name": "Amlodipine",
                            "dose": "5 mg",
                            "frequency": "Once daily every morning after breakfast",
                            "warnings": ["Do NOT stop abruptly"],
                        },
                    ],
                    "follow_up": "5 days (or sooner if fever > 102 F or trouble breathing)",
                },
                generated_explanation={
                    "doctor_provided": [
                        "Blood pressure recorded at 142/88 mmHg.",
                        "Conditions noted: Acute Nasopharyngitis (Upper Respiratory Infection) and Hypertension.",
                        "Paracetamol 500 mg as needed for fever or body ache (maximum 4 tablets in 24 hours).",
                        "Continue Amlodipine 5 mg once every morning after breakfast; do not stop suddenly.",
                        "Follow up in 5 days, or sooner if fever rises above 102°F or breathing feels hard.",
                    ],
                    "ai_simplified": {
                        "summary": (
                            "Dr. Priya Mehta noted a nose and throat cold alongside your ongoing blood pressure care. "
                            "Keep taking your morning blood pressure tablet (Amlodipine 5 mg) after breakfast, and use "
                            "Paracetamol 500 mg only if you have fever or aches—never more than 4 tablets in a day."
                        ),
                        "steps": [
                            "Take Amlodipine 5 mg once every morning after breakfast without skipping or stopping suddenly.",
                            "Take Paracetamol 500 mg only when needed for fever or body ache (maximum 4 tablets in 24 hours).",
                            "Return in 5 days, or seek urgent care right away if breathing becomes difficult or high fever persists.",
                        ],
                    },
                    "general_education": [
                        {
                            "topic": "Upper Respiratory Infection / Acute Nasopharyngitis",
                            "text": "Usually a viral infection of the nose and upper throat; rest and fluids help comfort.",
                            "source_name": "MedlinePlus",
                            "source_url": "https://medlineplus.gov/commoncold.html",
                            "diagram_id": "respiratory_airways",
                        },
                        {
                            "topic": "Hypertension & Amlodipine",
                            "text": "Amlodipine gently relaxes blood vessels over 24 hours to help manage blood pressure.",
                            "source_name": "NHS",
                            "source_url": "https://www.nhs.uk/medicines/amlodipine/",
                            "diagram_id": "heart_circulation_bp",
                        },
                    ],
                    "uncertain_or_missing": [
                        {
                            "field": "morning_clock_time",
                            "reason": "Your doctor specified 'after breakfast' rather than an exact clock hour. Keep a steady morning routine.",
                        }
                    ],
                },
                explanation_language="en",
                explanation_depth="simple",
                approval_status="approved",
                approved_by_doctor_id=doc_profile.id,
                approved_at=now,
                sharing_status="shared_with_patient",
                shared_at=now,
                integrity_status="passed",
                integrity_report={"checked": True, "matched_items": 5, "mismatches": []},
            )
            session.add(existing_consult)
            await session.flush()

        # Sample Synthetic Medical Lab Document
        existing_doc = (
            await session.execute(
                select(MedicalDocument).where(MedicalDocument.patient_id == pat_profile.id)
            )
        ).scalar_one_or_none()
        if not existing_doc:
            sample_ocr = (
                "SYNTHETIC LAB REPORT — MedSarthi Demo Lab\n"
                "Patient: Ramesh Sharma | Age: 64 | Date: 2026-11-22\n"
                "HbA1c: 6.8 % (Lab ref: <5.7 normal; discuss personal target with physician)\n"
                "Serum Creatinine: 1.0 mg/dL (Lab ref: 0.7 - 1.3 mg/dL)\n"
                "Fasting Plasma Glucose: 124 mg/dL (Lab ref: 70 - 99 mg/dL)"
            )
            session.add(
                MedicalDocument(
                    patient_id=pat_profile.id,
                    consultation_id=existing_consult.id,
                    uploaded_by_user_id=doc_user.id,
                    document_type="lab_report",
                    original_filename="synthetic_lab_panel_ramesh.pdf",
                    mime_type="application/pdf",
                    file_size_bytes=2048,
                    storage_path="synthetic/demo_lab_panel_ramesh.pdf",
                    sha256_checksum=sha256_hex(sample_ocr),
                    page_count=1,
                    ocr_raw_text=sample_ocr,
                    ocr_structured_fields={
                        "tests": [
                            {"name": "HbA1c", "value": "6.8", "unit": "%", "status": "discuss_with_doctor"},
                            {"name": "Serum Creatinine", "value": "1.0", "unit": "mg/dL", "status": "within_lab_ref"},
                            {"name": "Fasting Plasma Glucose", "value": "124", "unit": "mg/dL", "status": "above_fasting_ref"},
                        ],
                        "synthetic": True,
                    },
                    ocr_confidence_score=0.94,
                    uncertain_spans=[],
                    processing_status="completed",
                    verification_status="doctor_verified",
                    verified_by_user_id=doc_user.id,
                    verified_at=datetime.now(UTC),
                )
            )

        await session.commit()
        return {"kb_created": kb_created}
    finally:
        if owns_session:
            await session.close()


if __name__ == "__main__":
    result = asyncio.run(seed_database())
    print(f"MedSarthi synthetic seed complete: {result}")
