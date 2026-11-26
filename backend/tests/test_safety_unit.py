"""Unit tests for MedSarthi Medical Safety & Integrity Engine.

Covers all 13 deterministic integrity fields across EN/HI/Hinglish, negation-aware
emergency detection, intent classification, 4-way provenance validation, and PII scrubbing.
"""

from app.services.safety import (
    DISCLAIMER_TEXT,
    REQUIRED_PROVENANCE_KEYS,
    check_instruction_integrity,
    classify_user_intent,
    detect_emergency,
    scrub_pii,
    scrub_structured_pii,
    validate_provenance_and_guardrails,
)


# ---------------------------------------------------------------------------
# 1. Integrity Checker Contract & All 13 Domains (Passing Cases)
# ---------------------------------------------------------------------------

def test_integrity_checker_exact_return_contract():
    res = check_instruction_integrity(
        source_text="Tab. Paracetamol 500 mg SOS",
        output_text="Paracetamol 500 mg only when needed.",
        output_language="en",
    )
    expected_keys = {
        "status",
        "risk_level",
        "rules_evaluated",
        "mismatches",
        "negation_preserved",
        "dosage_preserved",
        "frequency_preserved",
        "duration_preserved",
        "measurements_preserved",
        "output_language",
        "disclaimer",
    }
    assert expected_keys.issubset(res.keys())
    assert res["status"] == "passed"
    assert res["risk_level"] == "low"
    assert res["rules_evaluated"] == 13
    assert res["mismatches"] == []
    assert res["negation_preserved"] is True
    assert res["dosage_preserved"] is True
    assert res["frequency_preserved"] is True
    assert res["duration_preserved"] is True
    assert res["measurements_preserved"] is True
    assert res["disclaimer"] == DISCLAIMER_TEXT


def test_rule_01_medicine_aliases_and_form_stripping():
    res = check_instruction_integrity(
        source_text="Tab. Crocin 500 mg SOS",
        output_text="Take Paracetamol 500 mg only when needed.",
    )
    assert res["status"] == "passed"
    assert res["mismatches"] == []


def test_rule_02_dosage_word_numbers_devanagari_and_fractions():
    # English half / fraction -> Hindi Devanagari digits + word number
    res_hi = check_instruction_integrity(
        source_text="Tab. Paracetamol 500 mg — take 1/2 tablet SOS",
        output_text="पैरासिटामोल ५०० मिग्रा की आधी गोली ज़रूरत पड़ने पर लें।",
        output_language="hi",
    )
    assert res_hi["status"] == "passed"
    assert res_hi["dosage_preserved"] is True

    # English two tablets -> Hinglish do goli
    res_hinglish = check_instruction_integrity(
        source_text="Tab. Amoxicillin 250 mg — take two tablets twice daily",
        output_text="Amoxicillin 250 mg ki do goli din mein do baar lein.",
        output_language="hi-Latn",
    )
    assert res_hinglish["status"] == "passed"

    # Decimal 0.25 preserved
    res_dec = check_instruction_integrity(
        source_text="Tab. Digoxin 0.25 mg OD",
        output_text="Digoxin 0.25 mg once daily.",
    )
    assert res_dec["status"] == "passed"


def test_rule_03_units_exact_preservation_multilingual():
    res_mcg = check_instruction_integrity(
        source_text="Tab. Levothyroxine 50 mcg OD empty stomach",
        output_text="Levothyroxine 50 माइक्रोग्राम दिन में एक बार खाली पेट लें।",
        output_language="hi",
    )
    assert res_mcg["status"] == "passed"

    res_multi_units = check_instruction_integrity(
        source_text="Salbutamol 2 puffs SOS, Insulin 10 IU before breakfast, Cough syrup 1 tsp TDS",
        output_text="Salbutamol 2 puffs when needed, Insulin 10 units before meals, Cough syrup 1 teaspoon three times a day.",
    )
    assert res_multi_units["status"] == "passed"


def test_rule_04_frequency_canonicalization_en_hi_hinglish():
    src = "Tab. Metformin 500 mg 1-0-1 PC"
    out_en = "Take Metformin 500 mg twice daily (morning and night) after food."
    out_hi = "मेटफॉर्मिन 500 मिग्रा दिन में दो बार सुबह और शाम खाना खाने के बाद लें।"
    out_hl = "Metformin 500 mg din mein do baar subah aur shaam khane ke baad lein."

    for out, lang in [(out_en, "en"), (out_hi, "hi"), (out_hl, "hi-Latn")]:
        res = check_instruction_integrity(src, out, output_language=lang)
        assert res["status"] == "passed", f"Failed for {lang}: {res['mismatches']}"
        assert res["frequency_preserved"] is True


def test_rule_05_duration_equivalence_and_chronic_retention():
    res = check_instruction_integrity(
        source_text="Tab. Cefixime 200 mg BD x 7 days. Continue Amlodipine 5 mg OD — do not stop abruptly.",
        output_text=(
            "Cefixime 200 mg twice daily for 1 week. "
            "Continue Amlodipine 5 mg once daily — achanak band na karein."
        ),
    )
    assert res["status"] == "passed"
    assert res["duration_preserved"] is True


def test_rule_06_routes_multilingual():
    res_eye = check_instruction_integrity(
        source_text="Ofloxacin eye drops 2 drops in right eye QID x 5 days",
        output_text="Ofloxacin ki 2 boond aankh mein din mein chaar baar 5 din tak daalein.",
        output_language="hi-Latn",
    )
    assert res_eye["status"] == "passed"

    res_sl = check_instruction_integrity(
        source_text="Nitroglycerin 0.5 mg sublingual SOS",
        output_text="Nitroglycerin 0.5 mg जीभ के नीचे रखें ज़रूरत पड़ने पर।",
        output_language="hi",
    )
    assert res_sl["status"] == "passed"


def test_rule_07_dates_and_relative_timelines():
    res = check_instruction_integrity(
        source_text="Visit Date: 2026-11-24. Review after 2 weeks.",
        output_text="Visit Date: 24/11/2026. Review 14 दिन बाद दिखाएं।",
        output_language="hi",
    )
    assert res["status"] == "passed"


def test_rule_08_vitals_and_temperature_conversion():
    res = check_instruction_integrity(
        source_text="BP 142/88 mmHg, Temp 102 F, SpO2 97%, HR 84 bpm",
        output_text="BP 142/88 mmHg, Temp 38.9 °C, SpO2 97%, Heart Rate 84 bpm.",
    )
    assert res["status"] == "passed"
    assert res["measurements_preserved"] is True


def test_rule_09_lab_values_lakh_and_decimals():
    res = check_instruction_integrity(
        source_text="Platelets 1.2 lakh/cu.mm, Serum Creatinine 1.4 mg/dL, HbA1c 6.8%",
        output_text="Platelets 1,20,000/cu.mm, Creatinine 1.4 mg/dL, HbA1c 6.8%.",
    )
    assert res["status"] == "passed"
    assert res["measurements_preserved"] is True


def test_rule_10_negations_and_qualitative_findings():
    res = check_instruction_integrity(
        source_text="Dengue NS1: Positive. Malaria: Negative. No fever. Do NOT take with milk. Avoid alcohol.",
        output_text=(
            "Dengue NS1: Positive. Malaria: Negative. "
            "Bukhar nahi hai. Doodh ke saath na lein. Sharab se bachein."
        ),
        output_language="hi-Latn",
    )
    assert res["status"] == "passed"
    assert res["negation_preserved"] is True


def test_rule_11_allergies_and_nkda_parity():
    res_allergy = check_instruction_integrity(
        source_text="Tab. Amoxicillin 500 mg TDS x 5 days. Allergic to Sulfa.",
        output_text="Amoxicillin 500 mg three times a day for 5 days. You are allergic to Sulfa.",
    )
    assert res_allergy["status"] == "passed"

    res_nkda = check_instruction_integrity(
        source_text="Tab. Paracetamol 500 mg SOS. NKDA.",
        output_text="Paracetamol 500 mg as needed. No known drug allergies.",
    )
    assert res_nkda["status"] == "passed"


def test_rule_12_and_13_full_ramesh_sharma_consultation_with_structured_source():
    source_text = (
        "SYNTHETIC CASE: Ramesh Sharma (64M). BP 142/88 mmHg. "
        "Diagnoses: Acute Nasopharyngitis (Upper Respiratory Infection) and Hypertension. "
        "Rx: 1) Paracetamol 500 mg SOS for fever/body ache, max 4 tablets in 24 hours. "
        "2) Continue Amlodipine 5 mg once daily every morning after breakfast — do NOT stop abruptly. "
        "Follow up in 5 days or sooner if fever > 102 F or breathing difficulty. CBC advised."
    )
    structured_source = {
        "vitals": {"blood_pressure": "142/88 mmHg"},
        "medications": [
            {
                "name": "Paracetamol",
                "dose": "500 mg",
                "frequency": "SOS",
                "warnings": ["Do NOT exceed 4 tablets in 24 hours"],
            },
            {
                "name": "Amlodipine",
                "dose": "5 mg",
                "frequency": "Once daily after breakfast",
                "warnings": ["Do NOT stop abruptly"],
            },
        ],
        "follow_up": "5 days (or sooner if fever > 102 F or breathing difficulty)",
    }
    output_en = (
        "Your blood pressure was 142/88 mmHg. "
        "Take Amlodipine 5 mg once daily after breakfast — do not stop abruptly. "
        "Take Paracetamol 500 mg only when needed for fever or aches, never more than 4 tablets in 24 hours. "
        "Follow up in 5 days, or return sooner if fever rises above 102°F or breathing difficulty develops. "
        "CBC advised."
    )
    res = check_instruction_integrity(source_text, output_en, structured_source=structured_source)
    assert res["status"] == "passed", res["mismatches"]
    assert res["rules_evaluated"] == 13

    output_hi = (
        "आपका ब्लड प्रेशर 142/88 mmHg दर्ज किया गया। "
        "एम्लोडिपाइन 5 मिग्रा रोज़ सुबह नाश्ते के बाद दिन में एक बार लें — अचानक बंद न करें। "
        "पैरासिटामोल 500 मिग्रा केवल बुखार या दर्द के लिए ज़रूरत पड़ने पर लें, 24 घंटे में अधिकतम 4 गोली। "
        "5 दिन बाद फिर दिखाएं, या बुखार 102°F से ऊपर जाने या सांस लेने में दिक्कत होने पर तुरंत आएं। "
        "CBC जांच कराएं।"
    )
    res_hi = check_instruction_integrity(
        source_text, output_hi, structured_source=structured_source, output_language="hi"
    )
    assert res_hi["status"] == "passed", res_hi["mismatches"]


def test_bidirectional_hinglish_source_to_english_output():
    res = check_instruction_integrity(
        source_text="Metformin 500 mg subah aur shaam khane ke baad 14 din tak lein.",
        output_text="Take Metformin 500 mg twice daily (morning and evening) after meals for 2 weeks.",
        output_language="en",
    )
    assert res["status"] == "passed", res["mismatches"]


def test_e2e_regressions_nasal_passages_and_hinglish_return_precaution():
    # Anatomical "nasal passages" in deep_dive explanation for oral meds must NOT trigger nasal route mismatch
    res_anatomy = check_instruction_integrity(
        source_text="Oral Tab. Paracetamol 500 mg SOS for URI.",
        output_text="URI is an upper airway illness affecting the nasal passages and pharynx. Take Paracetamol 500 mg orally only when needed.",
        structured_source={"medications": [{"name": "Paracetamol", "dose": "500 mg", "frequency": "SOS", "route": "oral"}]},
        output_language="en",
    )
    assert res_anatomy["status"] == "passed", res_anatomy["mismatches"]

    # Hinglish return precaution with "saans lene mein dikkat ho to jaldi dikhayein"
    res_hl = check_instruction_integrity(
        source_text="Tab. Paracetamol 500 mg SOS. Follow up in 5 days or sooner if fever > 102 F or breathing difficulty.",
        output_text=(
            "Paracetamol 500 mg zaroorat padne par lein. "
            "5 din baad dikhayein, ya agar fever > 102 F ho ya saans lene mein dikkat ho to jaldi dikhayein."
        ),
        output_language="hi-Latn",
    )
    assert res_hl["status"] == "passed", res_hl["mismatches"]


# ---------------------------------------------------------------------------
# 2. Emergency Detector Unit Tests
# ---------------------------------------------------------------------------

def test_emergency_detector_multilingual_active_domains():
    cardiac_resp = detect_emergency("Abhi seene mein tez dard aur saans phool rahi hai", context_mode="patient_query")
    assert cardiac_resp["is_emergency"] is True
    assert "cardiac" in cardiac_resp["categories"]
    assert "respiratory" in cardiac_resp["categories"]
    assert "112" in cardiac_resp["emergency_numbers"]
    assert "108" in cardiac_resp["emergency_numbers"]

    stroke_hi = detect_emergency("उनका चेहरा टेढ़ा हो गया है और एक तरफ कमजोरी है", context_mode="patient_query")
    assert stroke_hi["is_emergency"] is True
    assert "stroke_neuro" in stroke_hi["categories"]

    anaphylaxis = detect_emergency("My tongue is swelling and throat closing after tablet", context_mode="patient_query")
    assert anaphylaxis["is_emergency"] is True
    assert "anaphylaxis" in anaphylaxis["categories"]

    bleeding = detect_emergency("Patient is vomiting blood continuously", context_mode="patient_query")
    assert bleeding["is_emergency"] is True
    assert "severe_bleeding" in bleeding["categories"]

    pediatric = detect_emergency("Baby is turning blue and not waking up", context_mode="patient_query")
    assert pediatric["is_emergency"] is True
    assert "pediatric_obstetric" in pediatric["categories"]

    overdose = detect_emergency("I took too many pills and want to end my life", context_mode="patient_query")
    assert overdose["is_emergency"] is True
    assert "overdose_self_harm" in overdose["categories"]
    assert "14416" in overdose["emergency_numbers"]


def test_emergency_detector_suppresses_negated_and_precaution_doctor_notes():
    note_neg = detect_emergency(
        "No chest pain, denies shortness of breath, no SOB, no heavy bleeding.",
        context_mode="doctor_note",
    )
    assert note_neg["is_emergency"] is False
    assert len(note_neg["suppressed_matches"]) >= 3

    note_precaution = detect_emergency(
        "Return in 5 days or sooner if fever > 102 F or breathing difficulty.",
        context_mode="doctor_note",
    )
    assert note_precaution["is_emergency"] is False
    assert any(m["reason"] == "conditional_precaution" for m in note_precaution["suppressed_matches"])


# ---------------------------------------------------------------------------
# 3. Intent Router & Provenance Validator Unit Tests
# ---------------------------------------------------------------------------

def test_classify_user_intent_allows_legitimate_clinical_communication():
    for q in [
        "What does Acute Nasopharyngitis mean?",
        "Why did this happen?",
        "How should I take Amlodipine 5 mg according to my doctor's note?",
        "Translate my doctor's instructions into simple Hindi.",
        "What does Serum Creatinine test measure?",
    ]:
        res = classify_user_intent(q)
        assert res["intent"] == "allowed_communication", f"False block on: {q}"
        assert res["is_prohibited"] is False
        assert res["policy_action"] == "allow"


def test_validate_provenance_and_guardrails_passes_clean_payload():
    clean_payload = {
        "provenance": {
            "doctor_provided": ["Paracetamol 500 mg SOS (max 4 tablets in 24 hours)."],
            "ai_simplified": {
                "summary": "Your doctor advised Paracetamol 500 mg only when needed for fever.",
                "steps": ["Never take more than 4 tablets in 24 hours."],
            },
            "general_education": [
                {
                    "topic": "Upper Respiratory Infection",
                    "text": "Normal body temperature varies slightly around 37°C (98.6°F).",
                    "source_name": "NHS",
                    "source_url": "https://www.nhs.uk/conditions/fever-in-adults/",
                }
            ],
            "uncertain_or_missing": [
                {
                    "field": "exact_stop_date",
                    "reason": "Your doctor did not record an end date; confirm at follow-up.",
                }
            ],
        },
        "disclaimer": "Educational explanation only; not a substitute for professional medical advice.",
    }
    res = validate_provenance_and_guardrails(clean_payload)
    assert res["is_valid"] is True
    assert res["provenance_complete"] is True
    assert res["missing_provenance_keys"] == []
    assert res["no_false_reassurance"] is True
    assert res["no_hallucinated_diagnosis"] is True
    assert res["no_autonomous_prescribing"] is True
    assert res["disclaimer_present"] is True
    assert set(REQUIRED_PROVENANCE_KEYS) == {
        "doctor_provided",
        "ai_simplified",
        "general_education",
        "uncertain_or_missing",
    }


# ---------------------------------------------------------------------------
# 4. PII Scrubber Unit Tests
# ---------------------------------------------------------------------------

def test_pii_scrubber_strips_identifiers_and_preserves_clinical_values():
    raw = (
        "Patient Name: Ramesh Sharma | Phone: +91 98765 43210 | Email: ramesh.sharma@example.com | "
        "MRN: HOSP-998812 | Aadhaar: 1234 5678 9012 | ABHA: 12-3456-7890-1234 | "
        "BP 142/88 mmHg on 2026-11-24. Rx: Paracetamol 500 mg SOS. Platelets 1.2 lakh/cu.mm. "
        "Emergency: 112 or 108."
    )
    scrubbed = scrub_pii(raw, patient_name="Ramesh Sharma")
    assert "Ramesh" not in scrubbed
    assert "Sharma" not in scrubbed
    assert "98765" not in scrubbed
    assert "ramesh.sharma@example.com" not in scrubbed
    assert "HOSP-998812" not in scrubbed
    assert "1234 5678 9012" not in scrubbed
    assert "12-3456-7890-1234" not in scrubbed
    assert "[PATIENT_NAME]" in scrubbed
    assert "[PHONE]" in scrubbed
    assert "[EMAIL]" in scrubbed
    assert "[ID_NUMBER]" in scrubbed
    # Clinical & emergency values preserved
    assert "142/88 mmHg" in scrubbed
    assert "2026-11-24" in scrubbed
    assert "500 mg" in scrubbed
    assert "1.2 lakh" in scrubbed
    assert "112" in scrubbed
    assert "108" in scrubbed

    tele_manas = scrub_pii(
        "Patient: Anita Verma | Call 112, 108, or Tele-MANAS 14416 / 1800-891-4416.",
        patient_name="Anita Verma",
    )
    assert "Anita" not in tele_manas
    assert "112" in tele_manas
    assert "108" in tele_manas
    assert "14416" in tele_manas
    assert "1800-891-4416" in tele_manas


def test_scrub_structured_pii_recursive():
    payload = {
        "note": "Mr. Ramesh Sharma called from 9876543210",
        "items": ["Email ramesh@test.org", "Take Amlodipine 5 mg"],
    }
    cleaned = scrub_structured_pii(payload, patient_name="Ramesh Sharma")
    assert "Ramesh" not in cleaned["note"]
    assert "9876543210" not in cleaned["note"]
    assert "ramesh@test.org" not in cleaned["items"][0]
    assert "Amlodipine 5 mg" in cleaned["items"][1]
