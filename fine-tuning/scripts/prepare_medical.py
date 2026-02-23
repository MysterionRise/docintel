#!/usr/bin/env python3
"""
Prepare Medical Summarization Dataset
======================================

Generates synthetic medical documents (discharge summaries, lab reports,
prescriptions, referrals, progress notes) and their structured extractions
for DocIntel fine-tuning.

All patient data is entirely synthetic — no real patient information is used.

Usage:
    python prepare_medical.py                # Full run (5000 examples)
    python prepare_medical.py --dry-run      # Quick test (50 examples)
    python prepare_medical.py --count 1000   # Custom count
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

# Ensure scripts/ is on the path so shared can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent))

from shared import (
    DATASETS_DIR,
    add_seed_argument,
    estimate_tokens,
    make_conversation,
    save_dataset,
    setup_logging,
)

logger = setup_logging("prepare_medical")

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are DocIntel, a medical document analysis AI. "
    "Extract structured information from clinical documents. "
    "Return valid JSON matching the provided schema. "
    "Include diagnoses with ICD-10 codes, medications, procedures, "
    "lab results, and follow-up recommendations."
)

# ---------------------------------------------------------------------------
# Medical data pools (realistic synthetic content)
# ---------------------------------------------------------------------------

DOCUMENT_TYPES = [
    "discharge_summary",
    "lab_report",
    "prescription",
    "referral",
    "progress_note",
]

SPECIALTIES = [
    "Internal Medicine", "Cardiology", "Pulmonology", "Gastroenterology",
    "Endocrinology", "Nephrology", "Neurology", "Orthopedics",
    "Oncology", "Rheumatology", "Infectious Disease", "Hematology",
    "Dermatology", "Psychiatry", "General Surgery",
]

# Diagnosis pools: (name, ICD-10, typical status)
DIAGNOSES_POOL = [
    ("Type 2 Diabetes Mellitus", "E11.9", "active"),
    ("Essential Hypertension", "I10", "active"),
    ("Major Depressive Disorder, single episode", "F32.9", "active"),
    ("Acute Upper Respiratory Infection", "J06.9", "resolved"),
    ("Chronic Obstructive Pulmonary Disease", "J44.1", "active"),
    ("Atrial Fibrillation", "I48.91", "active"),
    ("Congestive Heart Failure", "I50.9", "active"),
    ("Acute Kidney Injury", "N17.9", "active"),
    ("Community-Acquired Pneumonia", "J18.9", "active"),
    ("Iron Deficiency Anemia", "D50.9", "active"),
    ("Hypothyroidism", "E03.9", "active"),
    ("Gastroesophageal Reflux Disease", "K21.0", "active"),
    ("Osteoarthritis of knee", "M17.9", "active"),
    ("Urinary Tract Infection", "N39.0", "resolved"),
    ("Chronic Kidney Disease, Stage 3", "N18.3", "active"),
    ("Deep Vein Thrombosis", "I82.40", "active"),
    ("Pulmonary Embolism", "I26.99", "active"),
    ("Cellulitis of lower limb", "L03.11", "resolved"),
    ("Lumbar Disc Herniation", "M51.16", "active"),
    ("Migraine without aura", "G43.00", "active"),
    ("Generalized Anxiety Disorder", "F41.1", "active"),
    ("Asthma, moderate persistent", "J45.40", "active"),
    ("Hyperlipidemia", "E78.5", "active"),
    ("Acute Appendicitis", "K35.80", "resolved"),
    ("Sepsis", "A41.9", "active"),
    ("Acute Myocardial Infarction", "I21.9", "active"),
    ("Stroke, cerebral infarction", "I63.9", "active"),
    ("Pancreatitis, acute", "K85.9", "resolved"),
    ("Cholelithiasis", "K80.20", "active"),
    ("Diabetic Nephropathy", "E11.21", "active"),
    ("Suspected Lung Malignancy", "R91.1", "suspected"),
    ("Suspected Thyroid Nodule", "E04.1", "suspected"),
    ("Possible Multiple Sclerosis", "G35", "suspected"),
]

# Medication pools: (name, typical dose, frequency, route)
MEDICATIONS_POOL = [
    ("Metformin", "500mg", "twice daily", "oral"),
    ("Metformin", "1000mg", "twice daily", "oral"),
    ("Lisinopril", "10mg", "once daily", "oral"),
    ("Lisinopril", "20mg", "once daily", "oral"),
    ("Amlodipine", "5mg", "once daily", "oral"),
    ("Atorvastatin", "20mg", "once daily at bedtime", "oral"),
    ("Atorvastatin", "40mg", "once daily at bedtime", "oral"),
    ("Omeprazole", "20mg", "once daily before breakfast", "oral"),
    ("Aspirin", "81mg", "once daily", "oral"),
    ("Metoprolol Succinate", "25mg", "once daily", "oral"),
    ("Metoprolol Succinate", "50mg", "once daily", "oral"),
    ("Furosemide", "40mg", "once daily", "oral"),
    ("Warfarin", "5mg", "once daily", "oral"),
    ("Insulin Glargine", "20 units", "once daily at bedtime", "subcutaneous"),
    ("Albuterol", "2 puffs", "every 4-6 hours as needed", "inhaled"),
    ("Prednisone", "40mg", "once daily", "oral"),
    ("Amoxicillin", "500mg", "three times daily", "oral"),
    ("Azithromycin", "250mg", "once daily", "oral"),
    ("Ciprofloxacin", "500mg", "twice daily", "oral"),
    ("Ceftriaxone", "1g", "every 24 hours", "IV"),
    ("Vancomycin", "1g", "every 12 hours", "IV"),
    ("Morphine", "2mg", "every 4 hours as needed", "IV"),
    ("Acetaminophen", "650mg", "every 6 hours as needed", "oral"),
    ("Ibuprofen", "400mg", "every 6 hours as needed", "oral"),
    ("Sertraline", "50mg", "once daily", "oral"),
    ("Levothyroxine", "75mcg", "once daily on empty stomach", "oral"),
    ("Enoxaparin", "40mg", "once daily", "subcutaneous"),
    ("Gabapentin", "300mg", "three times daily", "oral"),
    ("Pantoprazole", "40mg", "once daily", "IV"),
    ("Heparin", "5000 units", "every 8 hours", "subcutaneous"),
]

# Lab test pools: (test name, normal range description, unit)
LAB_TESTS_POOL = [
    ("Hemoglobin", (12.0, 17.5), "g/dL"),
    ("White Blood Cell Count", (4.5, 11.0), "x10^3/uL"),
    ("Platelet Count", (150, 400), "x10^3/uL"),
    ("Sodium", (136, 145), "mEq/L"),
    ("Potassium", (3.5, 5.0), "mEq/L"),
    ("Chloride", (98, 106), "mEq/L"),
    ("Bicarbonate", (22, 29), "mEq/L"),
    ("BUN", (7, 20), "mg/dL"),
    ("Creatinine", (0.7, 1.3), "mg/dL"),
    ("Glucose", (70, 100), "mg/dL"),
    ("Calcium", (8.5, 10.5), "mg/dL"),
    ("ALT", (7, 56), "U/L"),
    ("AST", (10, 40), "U/L"),
    ("Alkaline Phosphatase", (44, 147), "U/L"),
    ("Total Bilirubin", (0.1, 1.2), "mg/dL"),
    ("Albumin", (3.5, 5.5), "g/dL"),
    ("TSH", (0.4, 4.0), "mIU/L"),
    ("HbA1c", (4.0, 5.6), "%"),
    ("Troponin I", (0.0, 0.04), "ng/mL"),
    ("BNP", (0, 100), "pg/mL"),
    ("INR", (0.8, 1.2), "ratio"),
    ("D-Dimer", (0, 500), "ng/mL"),
    ("CRP", (0, 10), "mg/L"),
    ("ESR", (0, 20), "mm/hr"),
    ("Lactate", (0.5, 2.0), "mmol/L"),
    ("Procalcitonin", (0.0, 0.1), "ng/mL"),
]

PROCEDURES_POOL = [
    "Chest X-ray",
    "CT scan of abdomen and pelvis",
    "CT scan of chest with contrast",
    "MRI of brain",
    "MRI of lumbar spine",
    "Echocardiogram",
    "Electrocardiogram (ECG)",
    "Upper GI endoscopy",
    "Colonoscopy",
    "Bronchoscopy",
    "CT Angiography of chest",
    "Ultrasound of abdomen",
    "Doppler ultrasound of lower extremities",
    "Lumbar puncture",
    "Bone marrow biopsy",
    "Central line placement",
    "Thoracentesis",
    "Paracentesis",
    "Cardiac catheterization",
    "Appendectomy",
    "Cholecystectomy",
    "Knee arthroscopy",
]

PROCEDURE_FINDINGS = [
    "No acute findings",
    "Results within normal limits",
    "Mild abnormality noted, recommend follow-up",
    "Findings consistent with clinical diagnosis",
    "Significant findings requiring further evaluation",
    "No evidence of acute pathology",
    "Mild bilateral pleural effusions noted",
    "Small pericardial effusion, hemodynamically stable",
    "No evidence of obstruction or mass",
    "Left ventricular ejection fraction estimated at {ef}%",
    "Moderate degenerative changes noted",
    "No acute fracture or dislocation",
    "Patent vasculature, no thrombus identified",
    "Focal consolidation in right lower lobe",
    "No intracranial hemorrhage or mass effect",
]

FOLLOW_UP_ACTIONS = [
    "Follow-up with primary care physician",
    "Repeat lab work",
    "Follow-up imaging study",
    "Referral to specialist",
    "Medication adjustment follow-up",
    "Wound check",
    "Post-operative follow-up",
    "Cardiac rehabilitation evaluation",
    "Pulmonary function testing",
    "Diet and lifestyle counseling",
]

FOLLOW_UP_TIMEFRAMES = [
    "1 week", "2 weeks", "3 weeks", "1 month",
    "6 weeks", "2 months", "3 months", "6 months",
]

PROVIDER_TYPES = [
    "Primary Care", "Cardiology", "Pulmonology", "Gastroenterology",
    "Endocrinology", "Nephrology", "Neurology", "Orthopedics",
    "Oncology", "Surgery", "Psychiatry", "Rheumatology",
]

# Synthetic doctor names
DOCTOR_NAMES = [
    "Dr. Smith", "Dr. Johnson", "Dr. Williams", "Dr. Brown", "Dr. Jones",
    "Dr. Garcia", "Dr. Miller", "Dr. Davis", "Dr. Rodriguez", "Dr. Martinez",
    "Dr. Hernandez", "Dr. Lopez", "Dr. Wilson", "Dr. Anderson", "Dr. Thomas",
    "Dr. Taylor", "Dr. Moore", "Dr. Jackson", "Dr. Martin", "Dr. Lee",
    "Dr. Patel", "Dr. Kim", "Dr. Chen", "Dr. Wang", "Dr. Nguyen",
]


# ---------------------------------------------------------------------------
# Helper: generate random dates
# ---------------------------------------------------------------------------


def _random_date(rng: random.Random) -> date:
    """Generate a random date between 2022-01-01 and 2025-12-31."""
    start = date(2022, 1, 1)
    days_range = (date(2025, 12, 31) - start).days
    return start + timedelta(days=rng.randint(0, days_range))


def _random_date_str(rng: random.Random) -> str:
    """Generate a random date string in ISO format."""
    return _random_date(rng).isoformat()


# ---------------------------------------------------------------------------
# Helper: generate a lab result with flag
# ---------------------------------------------------------------------------


def _generate_lab_result(rng: random.Random, test_info: tuple) -> dict:
    name, (low, high), unit = test_info
    # Decide flag distribution: 60% normal, 15% high, 15% low, 10% critical
    roll = rng.random()
    if roll < 0.60:
        flag = "normal"
        value = rng.uniform(low, high)
    elif roll < 0.75:
        flag = "high"
        value = rng.uniform(high, high * 1.5)
    elif roll < 0.90:
        flag = "low"
        value = rng.uniform(low * 0.5, low)
    else:
        flag = "critical"
        if rng.random() < 0.5:
            value = rng.uniform(high * 1.5, high * 3.0)
        else:
            value = rng.uniform(max(0, low * 0.1), low * 0.5)

    # Format value
    if high - low > 50:
        value_str = str(int(round(value)))
    else:
        value_str = f"{value:.1f}"

    result = {"test": name, "value": value_str, "unit": unit, "flag": flag}
    return result


# ---------------------------------------------------------------------------
# Document generators — one per document_type
# ---------------------------------------------------------------------------


def _generate_discharge_summary(rng: random.Random, idx: int) -> dict | None:
    age = rng.randint(18, 95)
    sex = rng.choice(["male", "female"])
    specialty = rng.choice(SPECIALTIES)
    doctor = rng.choice(DOCTOR_NAMES)
    # Generate consistent admission/discharge dates using proper date arithmetic
    los = rng.randint(1, 14)
    admit_date = _random_date(rng)
    discharge_date = admit_date + timedelta(days=los)

    # Pick diagnoses
    n_diag = rng.randint(1, 4)
    chosen_diag = rng.sample(DIAGNOSES_POOL, min(n_diag, len(DIAGNOSES_POOL)))
    primary = chosen_diag[0]

    # Pick medications
    n_meds = rng.randint(2, 7)
    chosen_meds = rng.sample(MEDICATIONS_POOL, min(n_meds, len(MEDICATIONS_POOL)))

    # Pick labs
    n_labs = rng.randint(3, 8)
    chosen_lab_infos = rng.sample(LAB_TESTS_POOL, min(n_labs, len(LAB_TESTS_POOL)))
    labs = [_generate_lab_result(rng, info) for info in chosen_lab_infos]

    # Pick procedures
    n_proc = rng.randint(1, 3)
    chosen_procs = rng.sample(PROCEDURES_POOL, min(n_proc, len(PROCEDURES_POOL)))
    procedures = []
    for p in chosen_procs:
        finding_template = rng.choice(PROCEDURE_FINDINGS)
        finding = finding_template.format(ef=rng.randint(25, 65))
        # Procedure date falls within the admission period
        proc_date = admit_date + timedelta(days=rng.randint(0, los))
        procedures.append({
            "name": p,
            "date": proc_date.isoformat(),
            "findings": finding,
        })

    # Follow-up
    n_fu = rng.randint(1, 3)
    follow_ups = []
    for _ in range(n_fu):
        follow_ups.append({
            "action": rng.choice(FOLLOW_UP_ACTIONS),
            "timeframe": rng.choice(FOLLOW_UP_TIMEFRAMES),
            "provider": rng.choice(PROVIDER_TYPES),
        })

    # Build narrative text
    pronoun = "He" if sex == "male" else "She"
    pronoun_lower = "he" if sex == "male" else "she"
    possessive = "His" if sex == "male" else "Her"

    diag_names = ", ".join(d[0] for d in chosen_diag)
    med_lines = "\n".join(
        f"  - {m[0]} {m[1]} {m[2]} ({m[3]})" for m in chosen_meds
    )
    lab_lines = "\n".join(
        f"  - {l['test']}: {l['value']} {l['unit']} ({l['flag']})" for l in labs
    )
    proc_lines = "\n".join(
        f"  - {p['name']}: {p['findings']}" for p in procedures
    )
    fu_lines = "\n".join(
        f"  - {f['action']} with {f['provider']} in {f['timeframe']}"
        for f in follow_ups
    )

    admit_date_str = admit_date.isoformat()
    discharge_date_str = discharge_date.isoformat()

    text = (
        f"DISCHARGE SUMMARY\n"
        f"Department: {specialty}\n"
        f"Attending: {doctor}\n"
        f"Admission Date: {admit_date_str}\n"
        f"Discharge Date: {discharge_date_str}\n\n"
        f"Patient is a {age}-year-old {sex} admitted for evaluation and management "
        f"of {primary[0]}. {pronoun} presented with symptoms consistent with "
        f"{primary[0].lower()} and was admitted for further workup.\n\n"
        f"DIAGNOSES:\n{diag_names}\n\n"
        f"HOSPITAL COURSE:\n"
        f"The patient was admitted and started on appropriate therapy. "
        f"{pronoun} underwent the following evaluations:\n{proc_lines}\n\n"
        f"LABORATORY RESULTS:\n{lab_lines}\n\n"
        f"MEDICATIONS AT DISCHARGE:\n{med_lines}\n\n"
        f"FOLLOW-UP PLAN:\n{fu_lines}\n\n"
        f"The patient was discharged in stable condition after a {los}-day stay. "
        f"{pronoun} was counseled on medication compliance and return precautions."
    )

    # Build structured output
    structured = {
        "document_type": "discharge_summary",
        "patient_info": {"age": str(age), "sex": sex},
        "diagnoses": [
            {"name": d[0], "icd10": d[1], "status": d[2]} for d in chosen_diag
        ],
        "medications": [
            {"name": m[0], "dose": m[1], "frequency": m[2], "route": m[3]}
            for m in chosen_meds
        ],
        "procedures": procedures,
        "lab_results": labs,
        "follow_up": follow_ups,
        "summary": (
            f"{age}-year-old {sex} admitted for {primary[0]}. "
            f"Hospital course was {'uncomplicated' if los <= 5 else 'prolonged'}. "
            f"Key findings include {labs[0]['test']} {labs[0]['value']} {labs[0]['unit']} ({labs[0]['flag']}). "
            f"Discharged on {len(chosen_meds)} medications with follow-up in {follow_ups[0]['timeframe']}."
        ),
    }

    return text, structured


def _generate_lab_report(rng: random.Random, idx: int) -> tuple:
    age = rng.randint(18, 95)
    sex = rng.choice(["male", "female"])
    doctor = rng.choice(DOCTOR_NAMES)

    # Pick labs (more for a dedicated lab report)
    n_labs = rng.randint(5, 15)
    chosen_lab_infos = rng.sample(LAB_TESTS_POOL, min(n_labs, len(LAB_TESTS_POOL)))
    labs = [_generate_lab_result(rng, info) for info in chosen_lab_infos]

    abnormal = [l for l in labs if l["flag"] != "normal"]

    lab_lines = "\n".join(
        f"  {l['test']:.<35} {l['value']:>8} {l['unit']:<12} [{l['flag'].upper()}]"
        for l in labs
    )

    text = (
        f"LABORATORY REPORT\n"
        f"Ordering Physician: {doctor}\n"
        f"Patient: {age}-year-old {sex}\n"
        f"Collection Date: {_random_date_str(rng)}\n\n"
        f"RESULTS:\n{lab_lines}\n\n"
        f"{'ABNORMAL VALUES FLAGGED: ' + str(len(abnormal)) + ' result(s) outside normal range.' if abnormal else 'All results within normal limits.'}\n"
        f"Please correlate clinically."
    )

    # Determine primary diagnosis from abnormals
    diagnoses = []
    if any(l["test"] == "Glucose" and l["flag"] in ("high", "critical") for l in labs):
        diagnoses.append({"name": "Hyperglycemia", "icd10": "R73.9", "status": "suspected"})
    if any(l["test"] == "Hemoglobin" and l["flag"] in ("low", "critical") for l in labs):
        diagnoses.append({"name": "Anemia", "icd10": "D64.9", "status": "suspected"})
    if any(l["test"] == "Creatinine" and l["flag"] in ("high", "critical") for l in labs):
        diagnoses.append({"name": "Elevated Creatinine", "icd10": "R94.4", "status": "suspected"})
    if not diagnoses:
        diagnoses.append({"name": "Routine lab work, no abnormalities", "icd10": "Z00.00", "status": "resolved"})

    follow_ups = []
    if abnormal:
        follow_ups.append({
            "action": "Repeat abnormal labs",
            "timeframe": rng.choice(["1 week", "2 weeks", "1 month"]),
            "provider": "Primary Care",
        })

    structured = {
        "document_type": "lab_report",
        "patient_info": {"age": str(age), "sex": sex},
        "diagnoses": diagnoses,
        "medications": [],
        "procedures": [],
        "lab_results": labs,
        "follow_up": follow_ups,
        "summary": (
            f"Lab report for {age}-year-old {sex}. "
            f"{len(labs)} tests performed, {len(abnormal)} abnormal. "
            + (f"Notable: {abnormal[0]['test']} {abnormal[0]['value']} {abnormal[0]['unit']} ({abnormal[0]['flag']})." if abnormal else "All within normal limits.")
        ),
    }

    return text, structured


def _generate_prescription(rng: random.Random, idx: int) -> tuple:
    age = rng.randint(18, 90)
    sex = rng.choice(["male", "female"])
    doctor = rng.choice(DOCTOR_NAMES)

    # Pick 1-4 meds
    n_meds = rng.randint(1, 4)
    chosen_meds = rng.sample(MEDICATIONS_POOL, min(n_meds, len(MEDICATIONS_POOL)))

    # Pick a related diagnosis
    diag = rng.choice(DIAGNOSES_POOL)

    med_lines = "\n".join(
        f"  Rx: {m[0]} {m[1]}\n      Sig: {m[2]}, {m[3]}\n      Qty: {rng.choice([30, 60, 90])} | Refills: {rng.randint(0, 5)}"
        for m in chosen_meds
    )

    text = (
        f"PRESCRIPTION\n"
        f"Prescriber: {doctor}\n"
        f"Date: {_random_date_str(rng)}\n\n"
        f"Patient: {age}-year-old {sex}\n"
        f"Diagnosis: {diag[0]} ({diag[1]})\n\n"
        f"MEDICATIONS:\n{med_lines}\n\n"
        f"Instructions: Take as directed. Contact prescriber with any adverse effects."
    )

    structured = {
        "document_type": "prescription",
        "patient_info": {"age": str(age), "sex": sex},
        "diagnoses": [{"name": diag[0], "icd10": diag[1], "status": diag[2]}],
        "medications": [
            {"name": m[0], "dose": m[1], "frequency": m[2], "route": m[3]}
            for m in chosen_meds
        ],
        "procedures": [],
        "lab_results": [],
        "follow_up": [{
            "action": "Medication follow-up and assessment",
            "timeframe": rng.choice(["2 weeks", "1 month", "3 months"]),
            "provider": "Primary Care",
        }],
        "summary": (
            f"Prescription for {age}-year-old {sex} with {diag[0]}. "
            f"{len(chosen_meds)} medication(s) prescribed: {', '.join(m[0] for m in chosen_meds)}."
        ),
    }

    return text, structured


def _generate_referral(rng: random.Random, idx: int) -> tuple:
    age = rng.randint(18, 90)
    sex = rng.choice(["male", "female"])
    referring_doc = rng.choice(DOCTOR_NAMES)
    specialist_type = rng.choice(PROVIDER_TYPES)
    specialist_doc = rng.choice([d for d in DOCTOR_NAMES if d != referring_doc])

    diag = rng.choice(DIAGNOSES_POOL)
    pronoun = "He" if sex == "male" else "She"

    reasons = [
        f"further evaluation and management of {diag[0]}",
        f"specialist consultation regarding {diag[0].lower()}",
        f"assessment for possible intervention for {diag[0].lower()}",
        f"co-management of {diag[0].lower()} with complex presentation",
    ]

    text = (
        f"REFERRAL\n"
        f"From: {referring_doc} (Primary Care)\n"
        f"To: {specialist_doc} ({specialist_type})\n"
        f"Date: {_random_date_str(rng)}\n\n"
        f"RE: {age}-year-old {sex}\n\n"
        f"Dear {specialist_doc},\n\n"
        f"I am referring this {age}-year-old {sex} patient for {rng.choice(reasons)}. "
        f"{pronoun} has a history of {diag[0]} (ICD-10: {diag[1]}). "
        f"Current medications and recent lab work are enclosed. "
        f"Please evaluate and advise on treatment plan.\n\n"
        f"Thank you for your consultation.\n"
        f"Sincerely,\n{referring_doc}"
    )

    structured = {
        "document_type": "referral",
        "patient_info": {"age": str(age), "sex": sex},
        "diagnoses": [{"name": diag[0], "icd10": diag[1], "status": diag[2]}],
        "medications": [],
        "procedures": [],
        "lab_results": [],
        "follow_up": [{
            "action": f"Specialist consultation with {specialist_type}",
            "timeframe": rng.choice(["1 week", "2 weeks", "1 month"]),
            "provider": specialist_type,
        }],
        "summary": (
            f"Referral for {age}-year-old {sex} from {referring_doc} to "
            f"{specialist_type} for evaluation of {diag[0]}."
        ),
    }

    return text, structured


def _generate_progress_note(rng: random.Random, idx: int) -> tuple:
    age = rng.randint(18, 95)
    sex = rng.choice(["male", "female"])
    doctor = rng.choice(DOCTOR_NAMES)
    specialty = rng.choice(SPECIALTIES)

    n_diag = rng.randint(1, 3)
    chosen_diag = rng.sample(DIAGNOSES_POOL, min(n_diag, len(DIAGNOSES_POOL)))
    primary = chosen_diag[0]

    n_meds = rng.randint(1, 5)
    chosen_meds = rng.sample(MEDICATIONS_POOL, min(n_meds, len(MEDICATIONS_POOL)))

    n_labs = rng.randint(0, 5)
    labs = []
    if n_labs > 0:
        chosen_lab_infos = rng.sample(LAB_TESTS_POOL, min(n_labs, len(LAB_TESTS_POOL)))
        labs = [_generate_lab_result(rng, info) for info in chosen_lab_infos]

    pronoun = "He" if sex == "male" else "She"
    possessive = "his" if sex == "male" else "her"
    subjective_complaints = [
        f"reports feeling better overall",
        f"complains of persistent fatigue",
        f"denies any new symptoms",
        f"reports intermittent pain, rated {rng.randint(3,8)}/10",
        f"states {possessive} symptoms have improved with current medications",
        f"reports difficulty sleeping",
        f"notes mild improvement since last visit",
    ]

    lab_section = ""
    if labs:
        lab_lines = ", ".join(f"{l['test']} {l['value']} {l['unit']}" for l in labs)
        lab_section = f"\nRECENT LABS: {lab_lines}\n"

    text = (
        f"PROGRESS NOTE\n"
        f"Provider: {doctor} | {specialty}\n"
        f"Date: {_random_date_str(rng)}\n\n"
        f"Patient: {age}-year-old {sex}\n\n"
        f"SUBJECTIVE:\n"
        f"Patient {rng.choice(subjective_complaints)}. "
        f"{pronoun} is currently taking {len(chosen_meds)} medication(s).\n\n"
        f"OBJECTIVE:\n"
        f"Vital signs stable. General appearance: {'well-appearing' if rng.random() > 0.3 else 'appears mildly ill'}.\n"
        f"Focused exam consistent with {primary[0].lower()}.\n"
        f"{lab_section}\n"
        f"ASSESSMENT:\n"
        f"{', '.join(d[0] for d in chosen_diag)} - {'stable' if rng.random() > 0.4 else 'improving'}.\n\n"
        f"PLAN:\n"
        f"Continue current medications. Follow-up in {rng.choice(FOLLOW_UP_TIMEFRAMES)}.\n"
        f"{'Order repeat labs.' if labs else ''}"
    )

    follow_ups = [{
        "action": "Follow-up visit",
        "timeframe": rng.choice(FOLLOW_UP_TIMEFRAMES),
        "provider": specialty,
    }]
    if labs:
        follow_ups.append({
            "action": "Repeat laboratory work",
            "timeframe": rng.choice(["1 month", "3 months"]),
            "provider": "Primary Care",
        })

    structured = {
        "document_type": "progress_note",
        "patient_info": {"age": str(age), "sex": sex},
        "diagnoses": [
            {"name": d[0], "icd10": d[1], "status": d[2]} for d in chosen_diag
        ],
        "medications": [
            {"name": m[0], "dose": m[1], "frequency": m[2], "route": m[3]}
            for m in chosen_meds
        ],
        "procedures": [],
        "lab_results": labs,
        "follow_up": follow_ups,
        "summary": (
            f"Progress note for {age}-year-old {sex} with {primary[0]}. "
            f"Condition is {'stable' if rng.random() > 0.4 else 'improving'}. "
            f"Continuing {len(chosen_meds)} medication(s)."
        ),
    }

    return text, structured


# ---------------------------------------------------------------------------
# Main generation loop
# ---------------------------------------------------------------------------

GENERATORS = {
    "discharge_summary": _generate_discharge_summary,
    "lab_report": _generate_lab_report,
    "prescription": _generate_prescription,
    "referral": _generate_referral,
    "progress_note": _generate_progress_note,
}

# Distribution targets (roughly balanced)
DOC_TYPE_WEIGHTS = {
    "discharge_summary": 0.25,
    "lab_report": 0.20,
    "prescription": 0.20,
    "referral": 0.15,
    "progress_note": 0.20,
}


def generate_examples(count: int, seed: int) -> list[dict]:
    """Generate *count* medical training examples."""
    rng = random.Random(seed)
    examples = []
    skipped = 0

    # Pre-compute how many of each type
    type_counts = {}
    remaining = count
    for doc_type, weight in DOC_TYPE_WEIGHTS.items():
        n = int(count * weight)
        type_counts[doc_type] = n
        remaining -= n
    # Distribute remainder
    for doc_type in list(type_counts.keys()):
        if remaining <= 0:
            break
        type_counts[doc_type] += 1
        remaining -= 1

    idx = 0
    for doc_type, n in type_counts.items():
        gen_fn = GENERATORS[doc_type]
        for i in range(n):
            result = gen_fn(rng, idx)
            if result is None:
                skipped += 1
                continue

            text, structured = result
            assistant_content = json.dumps(structured, indent=2, ensure_ascii=False)

            # Token length check — skip outliers > 4096 tokens
            total_text = SYSTEM_PROMPT + text + assistant_content
            if estimate_tokens(total_text) > 4096:
                skipped += 1
                continue

            user_msg = (
                f"Analyze this medical document and extract structured information:\n\n"
                f"{text}\n\n"
                f"Return JSON with: document_type, patient_info, diagnoses (with ICD-10 codes), "
                f"medications, procedures, lab_results, follow_up, and summary."
            )

            example = make_conversation(SYSTEM_PROMPT, user_msg, assistant_content)
            examples.append(example)
            idx += 1

    if skipped:
        logger.info("Skipped %d examples (token limit or generation failure)", skipped)

    logger.info("Generated %d medical examples", len(examples))
    return examples


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic medical training dataset for DocIntel."
    )
    parser.add_argument(
        "--count",
        type=int,
        default=5000,
        help="Number of examples to generate (default: 5000)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate a small sample (50 examples) for testing",
    )
    add_seed_argument(parser)
    args = parser.parse_args()

    count = 50 if args.dry_run else args.count
    logger.info(
        "Starting medical dataset generation (%d examples, seed=%d%s)",
        count,
        args.seed,
        ", DRY RUN" if args.dry_run else "",
    )

    examples = generate_examples(count, args.seed)

    output_dir = DATASETS_DIR / "medical"
    counts = save_dataset(examples, output_dir, seed=args.seed)

    logger.info("Dataset saved to %s", output_dir)
    for split, n in counts.items():
        logger.info("  %s: %d examples", split, n)

    # Print document type distribution
    type_dist: dict[str, int] = {}
    for ex in examples:
        assistant_msg = ex["messages"][2]["content"]
        doc = json.loads(assistant_msg)
        dt = doc["document_type"]
        type_dist[dt] = type_dist.get(dt, 0) + 1
    logger.info("Document type distribution:")
    for dt, n in sorted(type_dist.items()):
        logger.info("  %s: %d (%.1f%%)", dt, n, 100 * n / len(examples))


if __name__ == "__main__":
    main()
