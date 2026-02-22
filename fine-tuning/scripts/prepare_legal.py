#!/usr/bin/env python3
"""
Prepare Legal Discovery Dataset
================================

Generates synthetic legal documents (complaints, motions, briefs, opinions,
contracts, correspondence, memos) and their structured extractions for
DocIntel fine-tuning.

Usage:
    python prepare_legal.py                # Full run (5000 examples)
    python prepare_legal.py --dry-run      # Quick test (50 examples)
    python prepare_legal.py --count 2000   # Custom count
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shared import (
    DATASETS_DIR,
    add_seed_argument,
    estimate_tokens,
    make_conversation,
    save_dataset,
    setup_logging,
)

logger = setup_logging("prepare_legal")

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are DocIntel, a legal document analysis AI specialized in e-discovery. "
    "Analyze legal documents for relevance, privilege, key entities, and important dates. "
    "Return valid JSON matching the provided schema. "
    "Assess relevance on a 0-1 scale with reasoning, classify privilege type, "
    "and extract all key entities and dates."
)

# ---------------------------------------------------------------------------
# Data pools
# ---------------------------------------------------------------------------

DOCUMENT_TYPES = [
    "complaint", "motion", "brief", "opinion",
    "contract", "correspondence", "memo",
]

# Case topics for relevance categories
CASE_TOPICS = [
    "patent infringement", "breach of contract", "employment discrimination",
    "securities fraud", "antitrust violation", "trade secret misappropriation",
    "product liability", "medical malpractice", "insurance dispute",
    "environmental regulation", "intellectual property", "merger review",
    "tax dispute", "real estate litigation", "class action",
    "whistleblower retaliation", "data privacy breach", "copyright infringement",
]

RELEVANCE_CATEGORIES = [
    "damages", "liability", "causation", "regulatory compliance",
    "contractual obligations", "prior art", "trade secrets",
    "employment practices", "financial records", "corporate governance",
    "communications", "technical specifications", "market analysis",
    "competitive practices", "internal policies", "discovery materials",
]

PRIVILEGE_TYPES = ["none", "attorney_client", "work_product", "joint_defense"]

PRIVILEGE_REASONING = {
    "none": [
        "Document is a business communication with no legal advice sought or provided.",
        "Publicly filed document with no privilege protection.",
        "Internal business memorandum discussing operational matters only.",
        "Communication between non-legal parties regarding business operations.",
        "Document was shared with third parties, waiving any potential privilege.",
    ],
    "attorney_client": [
        "Communication between client and counsel seeking legal advice on the matter.",
        "Email from in-house counsel providing legal analysis of proposed transaction.",
        "Memorandum from outside counsel advising on litigation strategy.",
        "Confidential communication with attorney regarding pending legal action.",
        "Letter from counsel analyzing legal risks associated with business decision.",
    ],
    "work_product": [
        "Litigation memorandum prepared by counsel in anticipation of litigation.",
        "Attorney's mental impressions and legal theories documented for case preparation.",
        "Investigation report prepared at direction of counsel for litigation purposes.",
        "Draft legal brief with attorney annotations and strategy notes.",
        "Case analysis prepared by legal team for litigation planning.",
    ],
    "joint_defense": [
        "Communication shared under joint defense agreement between co-defendants.",
        "Strategy memorandum circulated among parties to joint defense arrangement.",
        "Joint defense meeting notes shared among aligned parties' counsel.",
        "Coordinated legal analysis shared under common interest doctrine.",
    ],
}

# Entity pools
PERSON_NAMES = [
    "James Anderson", "Maria Rodriguez", "Robert Chen", "Sarah Williams",
    "Michael Thompson", "Jennifer Garcia", "David Kim", "Lisa Martinez",
    "John Wilson", "Patricia Moore", "Richard Taylor", "Elizabeth Johnson",
    "Thomas Brown", "Margaret Davis", "Christopher Lee", "Barbara White",
    "Daniel Harris", "Susan Clark", "Mark Robinson", "Nancy Lewis",
    "Steven Walker", "Karen Hall", "Paul Allen", "Betty Young",
]

ORGANIZATION_NAMES = [
    "Meridian Holdings Inc.", "Pacific Ventures LLC", "Atlas Manufacturing Co.",
    "Pinnacle Technologies Corp.", "Summit Financial Group", "Horizon Enterprises Ltd.",
    "Quantum Systems International", "Sterling Capital Partners", "Vanguard Industries",
    "Nexus Global Solutions", "Beacon Health Systems", "Ironclad Security Inc.",
    "Silverstone Properties", "Evergreen Resources Corp.", "Titan Aerospace LLC",
    "Cobalt Pharmaceuticals Inc.", "Diamond Data Analytics", "Sapphire Energy Corp.",
]

COURT_NAMES = [
    "United States District Court for the Southern District of New York",
    "United States District Court for the Northern District of California",
    "United States District Court for the District of Delaware",
    "United States District Court for the Eastern District of Texas",
    "United States District Court for the Central District of California",
    "United States Court of Appeals for the Second Circuit",
    "United States Court of Appeals for the Ninth Circuit",
    "United States Court of Appeals for the Federal Circuit",
    "Superior Court of California, County of Los Angeles",
    "Supreme Court of the State of New York",
]

STATUTE_NAMES = [
    "35 U.S.C. § 271 (Patent Infringement)",
    "15 U.S.C. § 1 (Sherman Antitrust Act)",
    "42 U.S.C. § 2000e (Title VII, Civil Rights Act)",
    "15 U.S.C. § 78j(b) (Securities Exchange Act)",
    "18 U.S.C. § 1836 (Defend Trade Secrets Act)",
    "28 U.S.C. § 1332 (Diversity Jurisdiction)",
    "Fed. R. Civ. P. 12(b)(6) (Failure to State a Claim)",
    "Fed. R. Civ. P. 56 (Summary Judgment)",
    "Fed. R. Evid. 702 (Expert Testimony)",
    "17 U.S.C. § 106 (Copyright Act)",
    "Cal. Bus. & Prof. Code § 17200 (Unfair Competition Law)",
    "N.Y. Gen. Bus. Law § 349 (Consumer Protection)",
]

ATTORNEY_NAMES = [
    "Attorney Sarah Mitchell", "Counsel David Park", "Attorney Jennifer Adams",
    "Counsel Michael Torres", "Attorney Robert Singh", "Counsel Amanda Chen",
    "Attorney William Foster", "Counsel Rachel Green", "Attorney James Cooper",
    "Counsel Emily Watson",
]

LEGAL_ROLES = [
    "plaintiff", "defendant", "plaintiff's counsel", "defendant's counsel",
    "witness", "expert witness", "judge", "mediator", "third-party defendant",
    "intervenor", "amicus curiae",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _random_date(rng: random.Random) -> str:
    year = rng.choice([2022, 2023, 2024])
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return f"{year}-{month:02d}-{day:02d}"


def _pick_entities(rng: random.Random, min_n: int = 2, max_n: int = 6) -> list[dict]:
    """Generate a varied set of entities for a legal document."""
    entities = []
    n = rng.randint(min_n, max_n)

    # Always include at least one person and one org
    person = rng.choice(PERSON_NAMES)
    org = rng.choice(ORGANIZATION_NAMES)
    entities.append({"name": person, "type": "person", "role": rng.choice(["plaintiff", "defendant", "witness"])})
    entities.append({"name": org, "type": "organization", "role": rng.choice(["plaintiff", "defendant", "third-party defendant"])})

    for _ in range(n - 2):
        entity_type = rng.choice(["person", "organization", "court", "statute"])
        if entity_type == "person":
            name = rng.choice([p for p in PERSON_NAMES if p != person])
            role = rng.choice(LEGAL_ROLES)
            entities.append({"name": name, "type": "person", "role": role})
        elif entity_type == "organization":
            name = rng.choice([o for o in ORGANIZATION_NAMES if o != org])
            role = rng.choice(["defendant", "third-party defendant", "intervenor"])
            entities.append({"name": name, "type": "organization", "role": role})
        elif entity_type == "court":
            entities.append({"name": rng.choice(COURT_NAMES), "type": "court", "role": "adjudicating court"})
        elif entity_type == "statute":
            entities.append({"name": rng.choice(STATUTE_NAMES), "type": "statute", "role": "governing statute"})

    return entities


def _pick_dates(rng: random.Random, min_n: int = 1, max_n: int = 4) -> list[dict]:
    events = [
        "Contract executed", "Alleged breach occurred", "Complaint filed",
        "Answer due", "Discovery deadline", "Motion hearing scheduled",
        "Mediation conference", "Trial date set", "Settlement conference",
        "Expert report deadline", "Deposition of key witness",
        "Document production deadline", "Summary judgment motion due",
        "Pre-trial conference", "Statute of limitations expires",
    ]
    n = rng.randint(min_n, max_n)
    chosen = rng.sample(events, min(n, len(events)))
    return [{"date": _random_date(rng), "event": e} for e in chosen]


# ---------------------------------------------------------------------------
# Document generators
# ---------------------------------------------------------------------------


def _generate_complaint(rng: random.Random) -> tuple[str, dict]:
    plaintiff_person = rng.choice(PERSON_NAMES)
    plaintiff_org = rng.choice(ORGANIZATION_NAMES)
    defendant_org = rng.choice([o for o in ORGANIZATION_NAMES if o != plaintiff_org])
    court = rng.choice(COURT_NAMES)
    case_topic = rng.choice(CASE_TOPICS)
    statute = rng.choice(STATUTE_NAMES)
    case_no = f"{rng.randint(1, 9)}:{rng.randint(20, 24)}-cv-{rng.randint(1000, 9999)}"
    filing_date = _random_date(rng)

    entities = [
        {"name": plaintiff_org, "type": "organization", "role": "plaintiff"},
        {"name": defendant_org, "type": "organization", "role": "defendant"},
        {"name": court, "type": "court", "role": "adjudicating court"},
        {"name": statute, "type": "statute", "role": "governing statute"},
        {"name": plaintiff_person, "type": "person", "role": "plaintiff's representative"},
    ]

    dates = [
        {"date": filing_date, "event": "Complaint filed"},
        {"date": _random_date(rng), "event": "Alleged wrongful conduct began"},
    ]

    relevance_score = round(rng.uniform(0.7, 1.0), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(2, 4))

    privilege_type = "none"  # Complaints are public filings

    text = (
        f"IN THE {court.upper()}\n\n"
        f"Case No. {case_no}\n\n"
        f"{plaintiff_org},\n    Plaintiff,\n\n"
        f"v.\n\n"
        f"{defendant_org},\n    Defendant.\n\n"
        f"{'='*60}\n"
        f"COMPLAINT\n"
        f"{'='*60}\n\n"
        f"Plaintiff {plaintiff_org}, by and through its undersigned counsel, "
        f"hereby brings this action against Defendant {defendant_org} and alleges as follows:\n\n"
        f"PARTIES\n"
        f"1. Plaintiff {plaintiff_org} is a corporation organized and existing under "
        f"the laws of the State of Delaware.\n"
        f"2. Defendant {defendant_org} is a corporation organized and existing under "
        f"the laws of the State of California.\n\n"
        f"JURISDICTION AND VENUE\n"
        f"3. This Court has subject matter jurisdiction pursuant to 28 U.S.C. § 1332.\n"
        f"4. Venue is proper in this District pursuant to 28 U.S.C. § 1391.\n\n"
        f"FACTUAL ALLEGATIONS\n"
        f"5. On or about {dates[1]['date']}, Defendant engaged in conduct constituting "
        f"{case_topic}.\n"
        f"6. Defendant's actions violated {statute}.\n"
        f"7. As a direct and proximate result of Defendant's wrongful conduct, "
        f"Plaintiff has suffered damages.\n\n"
        f"CAUSE OF ACTION\n"
        f"8. Defendant's conduct constitutes {case_topic} in violation of applicable law.\n\n"
        f"PRAYER FOR RELIEF\n"
        f"WHEREFORE, Plaintiff respectfully requests that this Court:\n"
        f"a. Award compensatory damages;\n"
        f"b. Award punitive damages;\n"
        f"c. Award attorneys' fees and costs;\n"
        f"d. Grant such other relief as the Court deems just.\n\n"
        f"Dated: {filing_date}\n"
        f"Respectfully submitted,\n"
        f"{rng.choice(ATTORNEY_NAMES)}\n"
        f"Counsel for Plaintiff"
    )

    structured = {
        "document_type": "complaint",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"Complaint initiating {case_topic} action directly relevant to the matter. Contains key factual allegations and identifies parties.",
        },
        "privilege": {
            "type": privilege_type,
            "reasoning": rng.choice(PRIVILEGE_REASONING[privilege_type]),
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"Complaint filed by {plaintiff_org} against {defendant_org} in {court.split(',')[0] if ',' in court else court.split('for')[0].strip()} "
            f"alleging {case_topic}. Case No. {case_no}."
        ),
    }

    return text, structured


def _generate_motion(rng: random.Random) -> tuple[str, dict]:
    movant_org = rng.choice(ORGANIZATION_NAMES)
    opponent_org = rng.choice([o for o in ORGANIZATION_NAMES if o != movant_org])
    court = rng.choice(COURT_NAMES)
    case_no = f"{rng.randint(1, 9)}:{rng.randint(20, 24)}-cv-{rng.randint(1000, 9999)}"
    case_topic = rng.choice(CASE_TOPICS)
    attorney = rng.choice(ATTORNEY_NAMES)

    motion_types = [
        ("Motion to Dismiss", "dismissal of the complaint for failure to state a claim"),
        ("Motion for Summary Judgment", "summary judgment on all counts"),
        ("Motion to Compel Discovery", "an order compelling production of documents"),
        ("Motion in Limine", "exclusion of certain evidence at trial"),
        ("Motion to Strike", "striking portions of the opposing party's pleading"),
        ("Motion for Protective Order", "a protective order regarding confidential materials"),
    ]
    motion_title, motion_relief = rng.choice(motion_types)
    filing_date = _random_date(rng)
    hearing_date = _random_date(rng)

    entities = [
        {"name": movant_org, "type": "organization", "role": "defendant" if rng.random() > 0.5 else "plaintiff"},
        {"name": opponent_org, "type": "organization", "role": "plaintiff" if entities[0]["role"] == "defendant" else "defendant"} if False else {"name": opponent_org, "type": "organization", "role": "opposing party"},
        {"name": court, "type": "court", "role": "adjudicating court"},
        {"name": attorney, "type": "person", "role": "movant's counsel"},
    ]

    dates = [
        {"date": filing_date, "event": f"{motion_title} filed"},
        {"date": hearing_date, "event": "Motion hearing scheduled"},
    ]

    relevance_score = round(rng.uniform(0.5, 1.0), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(1, 3))

    text = (
        f"IN THE {court.upper()}\n\n"
        f"Case No. {case_no}\n\n"
        f"{movant_org} v. {opponent_org}\n\n"
        f"{'='*60}\n"
        f"DEFENDANT'S {motion_title.upper()}\n"
        f"{'='*60}\n\n"
        f"Defendant {movant_org}, by and through undersigned counsel, "
        f"respectfully moves this Court for {motion_relief} and states as follows:\n\n"
        f"I. INTRODUCTION\n"
        f"This matter arises from allegations of {case_topic}. "
        f"Defendant submits that {'the complaint fails to state a claim upon which relief can be granted' if 'Dismiss' in motion_title else 'the relief requested is warranted under the applicable standard'}.\n\n"
        f"II. LEGAL STANDARD\n"
        f"Under the applicable legal framework, the movant must demonstrate "
        f"that the requested relief is appropriate under the circumstances.\n\n"
        f"III. ARGUMENT\n"
        f"A. The {'complaint' if 'Dismiss' in motion_title else 'evidence'} fails to meet the required standard.\n"
        f"B. {'Plaintiff has not alleged sufficient facts.' if 'Dismiss' in motion_title else 'The undisputed facts warrant the relief sought.'}\n"
        f"C. The balance of equities favors the movant.\n\n"
        f"IV. CONCLUSION\n"
        f"For the foregoing reasons, Defendant respectfully requests that this Court "
        f"grant this {motion_title}.\n\n"
        f"Dated: {filing_date}\n"
        f"Respectfully submitted,\n"
        f"{attorney}\n"
        f"Counsel for Defendant"
    )

    structured = {
        "document_type": "motion",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"{motion_title} filed in {case_topic} matter. Contains legal arguments relevant to case disposition.",
        },
        "privilege": {
            "type": "none",
            "reasoning": "Publicly filed court document with no privilege protection.",
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"{motion_title} filed by {movant_org} in case {case_no} "
            f"seeking {motion_relief}. Related to {case_topic}."
        ),
    }

    return text, structured


def _generate_brief(rng: random.Random) -> tuple[str, dict]:
    party_org = rng.choice(ORGANIZATION_NAMES)
    opposing_org = rng.choice([o for o in ORGANIZATION_NAMES if o != party_org])
    court = rng.choice(COURT_NAMES)
    case_topic = rng.choice(CASE_TOPICS)
    case_no = f"{rng.randint(1, 9)}:{rng.randint(20, 24)}-cv-{rng.randint(1000, 9999)}"
    attorney = rng.choice(ATTORNEY_NAMES)
    filing_date = _random_date(rng)

    brief_types = [
        "Opening Brief in Support of Motion for Summary Judgment",
        "Opposition Brief to Motion to Dismiss",
        "Reply Brief in Support of Motion to Compel",
        "Appellate Brief",
        "Amicus Curiae Brief",
    ]
    brief_title = rng.choice(brief_types)

    statutes = rng.sample(STATUTE_NAMES, rng.randint(1, 3))

    entities = _pick_entities(rng, 3, 5)
    entities.append({"name": court, "type": "court", "role": "adjudicating court"})
    for s in statutes:
        entities.append({"name": s, "type": "statute", "role": "cited authority"})

    dates = _pick_dates(rng, 2, 4)
    dates.append({"date": filing_date, "event": "Brief filed"})

    relevance_score = round(rng.uniform(0.6, 1.0), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(2, 4))

    cited_refs = "\n".join(f"  - {s}" for s in statutes)

    text = (
        f"IN THE {court.upper()}\n\n"
        f"Case No. {case_no}\n\n"
        f"{party_org} v. {opposing_org}\n\n"
        f"{'='*60}\n"
        f"{brief_title.upper()}\n"
        f"{'='*60}\n\n"
        f"TABLE OF CONTENTS\n"
        f"I. Introduction ............... 1\n"
        f"II. Statement of Facts ........ 2\n"
        f"III. Legal Argument ........... 4\n"
        f"IV. Conclusion ................ 8\n\n"
        f"I. INTRODUCTION\n"
        f"{party_org} respectfully submits this {brief_title.lower()} "
        f"in the above-captioned {case_topic} matter.\n\n"
        f"II. STATEMENT OF FACTS\n"
        f"The parties entered into a business relationship in which {party_org} "
        f"and {opposing_org} were engaged in matters relating to {case_topic}. "
        f"The relevant facts demonstrate that the applicable legal standard has been met.\n\n"
        f"III. LEGAL ARGUMENT\n"
        f"The applicable legal authorities support the relief sought:\n{cited_refs}\n\n"
        f"The evidence demonstrates that the claims are {'well-founded' if rng.random() > 0.5 else 'without merit'} "
        f"and {'should be sustained' if rng.random() > 0.5 else 'should be dismissed'}.\n\n"
        f"IV. CONCLUSION\n"
        f"For the foregoing reasons, {party_org} respectfully requests that this Court "
        f"rule in its favor.\n\n"
        f"Dated: {filing_date}\n"
        f"Respectfully submitted,\n"
        f"{attorney}\n"
        f"Counsel for {party_org}"
    )

    structured = {
        "document_type": "brief",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"Legal brief in {case_topic} case containing substantive legal arguments and factual analysis.",
        },
        "privilege": {
            "type": "none",
            "reasoning": "Publicly filed court brief, no privilege protection.",
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"{brief_title} filed by {party_org} against {opposing_org} "
            f"in case {case_no}. Addresses {case_topic}."
        ),
    }

    return text, structured


def _generate_opinion(rng: random.Random) -> tuple[str, dict]:
    plaintiff_org = rng.choice(ORGANIZATION_NAMES)
    defendant_org = rng.choice([o for o in ORGANIZATION_NAMES if o != plaintiff_org])
    court = rng.choice(COURT_NAMES)
    case_topic = rng.choice(CASE_TOPICS)
    case_no = f"{rng.randint(1, 9)}:{rng.randint(20, 24)}-cv-{rng.randint(1000, 9999)}"
    judge = f"Hon. {rng.choice(PERSON_NAMES)}"
    opinion_date = _random_date(rng)

    outcome = rng.choice(["granted", "denied", "granted in part and denied in part"])

    entities = [
        {"name": plaintiff_org, "type": "organization", "role": "plaintiff"},
        {"name": defendant_org, "type": "organization", "role": "defendant"},
        {"name": court, "type": "court", "role": "adjudicating court"},
        {"name": judge, "type": "person", "role": "judge"},
    ]
    statutes = rng.sample(STATUTE_NAMES, rng.randint(1, 2))
    for s in statutes:
        entities.append({"name": s, "type": "statute", "role": "cited authority"})

    dates = [
        {"date": opinion_date, "event": "Opinion issued"},
        {"date": _random_date(rng), "event": "Motion filed"},
    ]

    relevance_score = round(rng.uniform(0.7, 1.0), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(2, 4))

    text = (
        f"IN THE {court.upper()}\n\n"
        f"Case No. {case_no}\n\n"
        f"{plaintiff_org} v. {defendant_org}\n\n"
        f"{'='*60}\n"
        f"MEMORANDUM OPINION AND ORDER\n"
        f"{'='*60}\n\n"
        f"{judge}\n\n"
        f"This matter comes before the Court on Defendant's motion. "
        f"Having considered the parties' submissions, the record, and applicable law, "
        f"the Court issues the following opinion.\n\n"
        f"I. BACKGROUND\n"
        f"This action arises from a dispute concerning {case_topic}. "
        f"Plaintiff alleges that Defendant engaged in wrongful conduct causing damages.\n\n"
        f"II. LEGAL STANDARD\n"
        f"The Court applies the standard set forth in the applicable authorities.\n\n"
        f"III. ANALYSIS\n"
        f"Having reviewed the record, the Court finds that the {'plaintiff has' if outcome == 'denied' else 'defendant has'} "
        f"{'established' if outcome == 'denied' else 'not established'} the requisite showing. "
        f"The evidence {'supports' if outcome == 'denied' else 'does not support'} the claims as alleged.\n\n"
        f"IV. CONCLUSION\n"
        f"For the foregoing reasons, the Defendant's motion is {outcome}.\n\n"
        f"IT IS SO ORDERED.\n\n"
        f"Dated: {opinion_date}\n"
        f"{judge}\n"
        f"United States District Judge"
    )

    structured = {
        "document_type": "opinion",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"Court opinion ruling on {case_topic} matter. Contains binding legal analysis and findings of fact.",
        },
        "privilege": {
            "type": "none",
            "reasoning": "Court opinion is a public judicial document with no privilege.",
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"Court opinion by {judge} in {plaintiff_org} v. {defendant_org}, "
            f"Case No. {case_no}. Motion {outcome}. Related to {case_topic}."
        ),
    }

    return text, structured


def _generate_correspondence(rng: random.Random) -> tuple[str, dict]:
    sender = rng.choice(ATTORNEY_NAMES)
    recipient_attorney = rng.choice([a for a in ATTORNEY_NAMES if a != sender])
    sender_org = rng.choice(ORGANIZATION_NAMES)
    recipient_org = rng.choice([o for o in ORGANIZATION_NAMES if o != sender_org])
    case_topic = rng.choice(CASE_TOPICS)
    letter_date = _random_date(rng)

    # Decide privilege
    is_privileged = rng.random() > 0.4
    if is_privileged:
        privilege_type = rng.choice(["attorney_client", "work_product"])
    else:
        privilege_type = "none"

    correspondence_types = [
        ("settlement negotiation", f"discuss potential resolution of the {case_topic} matter"),
        ("discovery dispute", f"address outstanding discovery obligations in the {case_topic} litigation"),
        ("scheduling", f"coordinate upcoming deadlines and scheduling matters"),
        ("demand letter", f"formally demand that {recipient_org} cease its wrongful conduct"),
        ("meet and confer", f"meet and confer regarding the disputed discovery requests"),
    ]
    corr_type, purpose = rng.choice(correspondence_types)

    entities = [
        {"name": sender.replace("Attorney ", "").replace("Counsel ", ""), "type": "person", "role": "sender / counsel"},
        {"name": recipient_attorney.replace("Attorney ", "").replace("Counsel ", ""), "type": "person", "role": "recipient / opposing counsel"},
        {"name": sender_org, "type": "organization", "role": "client of sender"},
        {"name": recipient_org, "type": "organization", "role": "client of recipient"},
    ]

    dates = [
        {"date": letter_date, "event": "Letter sent"},
        {"date": _random_date(rng), "event": rng.choice(["Response deadline", "Meeting proposed", "Hearing date"])},
    ]

    relevance_score = round(rng.uniform(0.3, 0.9), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(1, 3))

    text = (
        f"{'PRIVILEGED AND CONFIDENTIAL' if is_privileged else ''}\n"
        f"{'ATTORNEY-CLIENT COMMUNICATION' if privilege_type == 'attorney_client' else ''}\n\n"
        f"Date: {letter_date}\n\n"
        f"From: {sender}\n"
        f"      Counsel for {sender_org}\n\n"
        f"To:   {recipient_attorney}\n"
        f"      Counsel for {recipient_org}\n\n"
        f"Re: {sender_org} v. {recipient_org} — {case_topic.title()}\n\n"
        f"Dear {recipient_attorney.split()[-1]},\n\n"
        f"I write to {purpose}.\n\n"
        f"As you are aware, our client {sender_org} has been {'adversely affected' if rng.random() > 0.5 else 'pursuing resolution'} "
        f"in this matter. We {'request your prompt attention' if rng.random() > 0.5 else 'propose the following course of action'} "
        f"regarding the pending {corr_type} issues.\n\n"
        f"Please respond by {_random_date(rng)} so that we may proceed accordingly.\n\n"
        f"Sincerely,\n"
        f"{sender}\n"
    )

    structured = {
        "document_type": "correspondence",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"Attorney correspondence regarding {corr_type} in {case_topic} matter.",
        },
        "privilege": {
            "type": privilege_type,
            "reasoning": rng.choice(PRIVILEGE_REASONING[privilege_type]),
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"Correspondence from {sender} to {recipient_attorney} regarding {corr_type} "
            f"in {sender_org} v. {recipient_org} ({case_topic})."
        ),
    }

    return text, structured


def _generate_memo(rng: random.Random) -> tuple[str, dict]:
    author = rng.choice(ATTORNEY_NAMES)
    org = rng.choice(ORGANIZATION_NAMES)
    case_topic = rng.choice(CASE_TOPICS)
    memo_date = _random_date(rng)

    # Memos are typically privileged
    privilege_type = rng.choice(["work_product", "attorney_client", "none"])

    memo_subjects = [
        (f"Legal analysis of {case_topic} claims", "legal analysis"),
        (f"Case strategy for upcoming {rng.choice(['deposition', 'hearing', 'mediation', 'trial'])}", "strategy"),
        (f"Review of document production in {case_topic} matter", "discovery review"),
        (f"Risk assessment — {case_topic} litigation exposure", "risk assessment"),
        (f"Summary of witness interviews — {case_topic}", "witness summary"),
    ]
    subject, memo_type = rng.choice(memo_subjects)

    recipients = rng.sample(
        [a for a in ATTORNEY_NAMES if a != author] + [f"Legal Team at {org}"],
        rng.randint(1, 3),
    )

    entities = _pick_entities(rng, 2, 4)
    dates = _pick_dates(rng, 1, 3)
    dates.append({"date": memo_date, "event": "Memorandum prepared"})

    relevance_score = round(rng.uniform(0.4, 1.0), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(1, 3))

    text = (
        f"{'PRIVILEGED AND CONFIDENTIAL — ATTORNEY WORK PRODUCT' if privilege_type == 'work_product' else ''}\n"
        f"{'PRIVILEGED AND CONFIDENTIAL — ATTORNEY-CLIENT' if privilege_type == 'attorney_client' else ''}\n\n"
        f"MEMORANDUM\n"
        f"{'='*60}\n"
        f"Date: {memo_date}\n"
        f"From: {author}\n"
        f"To:   {', '.join(recipients)}\n"
        f"Re:   {subject}\n"
        f"{'='*60}\n\n"
        f"I. PURPOSE\n"
        f"This memorandum provides a {memo_type} regarding the {case_topic} matter.\n\n"
        f"II. BACKGROUND\n"
        f"Our client {org} is involved in proceedings relating to {case_topic}. "
        f"This memo analyzes the current state of the matter and provides recommendations.\n\n"
        f"III. ANALYSIS\n"
        f"Based on our review of the facts and applicable law, we note the following:\n"
        f"- The {'strength' if rng.random() > 0.5 else 'weakness'} of the claims relates to {rng.choice(RELEVANCE_CATEGORIES)}.\n"
        f"- Key risks include {'adverse precedent' if rng.random() > 0.5 else 'unfavorable facts'}.\n"
        f"- {'Settlement' if rng.random() > 0.5 else 'Continued litigation'} may be advisable.\n\n"
        f"IV. RECOMMENDATIONS\n"
        f"We recommend proceeding with the proposed strategy outlined above.\n\n"
        f"Prepared by: {author}\n"
    )

    structured = {
        "document_type": "memo",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"Internal legal memorandum providing {memo_type} for {case_topic} matter.",
        },
        "privilege": {
            "type": privilege_type,
            "reasoning": rng.choice(PRIVILEGE_REASONING[privilege_type]),
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"Internal memorandum by {author} regarding {memo_type} for {org}'s "
            f"{case_topic} matter."
        ),
    }

    return text, structured


def _generate_contract_legal(rng: random.Random) -> tuple[str, dict]:
    """Generate a contract document for legal discovery (different focus from contract domain)."""
    party_a = rng.choice(ORGANIZATION_NAMES)
    party_b = rng.choice([o for o in ORGANIZATION_NAMES if o != party_a])
    effective_date = _random_date(rng)
    case_topic = rng.choice(CASE_TOPICS)
    signatory_a = rng.choice(PERSON_NAMES)
    signatory_b = rng.choice([p for p in PERSON_NAMES if p != signatory_a])

    contract_types = [
        "Master Services Agreement", "Non-Disclosure Agreement",
        "Software License Agreement", "Settlement Agreement",
        "Supply Agreement", "Joint Venture Agreement",
    ]
    contract_type = rng.choice(contract_types)

    entities = [
        {"name": party_a, "type": "organization", "role": "contracting party"},
        {"name": party_b, "type": "organization", "role": "contracting party"},
        {"name": signatory_a, "type": "person", "role": f"signatory for {party_a}"},
        {"name": signatory_b, "type": "person", "role": f"signatory for {party_b}"},
    ]

    dates = [
        {"date": effective_date, "event": "Contract effective date"},
        {"date": _random_date(rng), "event": "Contract expiration date"},
    ]

    # Relevance depends on whether contract relates to case topic
    relevance_score = round(rng.uniform(0.3, 0.95), 2)
    categories = rng.sample(RELEVANCE_CATEGORIES, rng.randint(1, 3))

    privilege_type = "none"

    text = (
        f"{contract_type.upper()}\n"
        f"{'='*60}\n\n"
        f"This {contract_type} (the \"Agreement\") is entered into as of {effective_date} "
        f"by and between:\n\n"
        f"{party_a} (\"Party A\")\nand\n{party_b} (\"Party B\")\n\n"
        f"WHEREAS, the parties wish to establish the terms and conditions governing "
        f"their business relationship;\n\n"
        f"NOW, THEREFORE, in consideration of the mutual promises and covenants herein, "
        f"the parties agree as follows:\n\n"
        f"1. SCOPE OF AGREEMENT\n"
        f"This Agreement governs the terms under which the parties will conduct business.\n\n"
        f"2. TERM\n"
        f"This Agreement shall be effective from {effective_date} and shall continue "
        f"for a period of {rng.choice([1, 2, 3, 5])} year(s).\n\n"
        f"3. CONFIDENTIALITY\n"
        f"Each party shall maintain the confidentiality of the other party's proprietary information.\n\n"
        f"4. GOVERNING LAW\n"
        f"This Agreement shall be governed by the laws of the State of {rng.choice(['Delaware', 'New York', 'California'])}.\n\n"
        f"IN WITNESS WHEREOF, the parties have executed this Agreement.\n\n"
        f"{party_a}: {signatory_a}\n"
        f"{party_b}: {signatory_b}\n"
        f"Date: {effective_date}\n"
    )

    structured = {
        "document_type": "contract",
        "relevance": {
            "score": relevance_score,
            "categories": categories,
            "reasoning": f"{contract_type} between {party_a} and {party_b}. {'Directly relevant to' if relevance_score > 0.7 else 'Potentially relevant to'} the {case_topic} matter.",
        },
        "privilege": {
            "type": privilege_type,
            "reasoning": "Contract is a business document, not a privileged communication.",
        },
        "key_entities": entities,
        "dates": dates,
        "summary": (
            f"{contract_type} between {party_a} and {party_b}, "
            f"effective {effective_date}. Relevant to {case_topic} discovery."
        ),
    }

    return text, structured


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

GENERATORS = {
    "complaint": _generate_complaint,
    "motion": _generate_motion,
    "brief": _generate_brief,
    "opinion": _generate_opinion,
    "contract": _generate_contract_legal,
    "correspondence": _generate_correspondence,
    "memo": _generate_memo,
}

DOC_TYPE_WEIGHTS = {
    "complaint": 0.15,
    "motion": 0.15,
    "brief": 0.15,
    "opinion": 0.10,
    "contract": 0.10,
    "correspondence": 0.20,
    "memo": 0.15,
}


def generate_examples(count: int, seed: int) -> list[dict]:
    """Generate *count* legal training examples."""
    rng = random.Random(seed)
    examples = []
    skipped = 0

    type_counts = {}
    remaining = count
    for doc_type, weight in DOC_TYPE_WEIGHTS.items():
        n = int(count * weight)
        type_counts[doc_type] = n
        remaining -= n
    for doc_type in list(type_counts.keys()):
        if remaining <= 0:
            break
        type_counts[doc_type] += 1
        remaining -= 1

    for doc_type, n in type_counts.items():
        gen_fn = GENERATORS[doc_type]
        for _ in range(n):
            text, structured = gen_fn(rng)
            assistant_content = json.dumps(structured, indent=2, ensure_ascii=False)

            total_text = SYSTEM_PROMPT + text + assistant_content
            if estimate_tokens(total_text) > 4096:
                skipped += 1
                continue

            user_msg = (
                f"Analyze this legal document for e-discovery purposes:\n\n"
                f"{text}\n\n"
                f"Return JSON with: document_type, relevance (score, categories, reasoning), "
                f"privilege (type, reasoning), key_entities (name, type, role), "
                f"dates (date, event), and summary."
            )

            example = make_conversation(SYSTEM_PROMPT, user_msg, assistant_content)
            examples.append(example)

    if skipped:
        logger.info("Skipped %d examples (token limit)", skipped)

    logger.info("Generated %d legal examples", len(examples))
    return examples


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic legal training dataset for DocIntel."
    )
    parser.add_argument(
        "--count", type=int, default=5000,
        help="Number of examples to generate (default: 5000)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Generate a small sample (50 examples) for testing",
    )
    add_seed_argument(parser)
    args = parser.parse_args()

    count = 50 if args.dry_run else args.count
    logger.info(
        "Starting legal dataset generation (%d examples, seed=%d%s)",
        count, args.seed, ", DRY RUN" if args.dry_run else "",
    )

    examples = generate_examples(count, args.seed)

    output_dir = DATASETS_DIR / "legal"
    counts = save_dataset(examples, output_dir, seed=args.seed)

    logger.info("Dataset saved to %s", output_dir)
    for split, n in counts.items():
        logger.info("  %s: %d examples", split, n)

    # Distribution
    type_dist: dict[str, int] = {}
    priv_dist: dict[str, int] = {}
    for ex in examples:
        doc = json.loads(ex["messages"][2]["content"])
        dt = doc["document_type"]
        pt = doc["privilege"]["type"]
        type_dist[dt] = type_dist.get(dt, 0) + 1
        priv_dist[pt] = priv_dist.get(pt, 0) + 1

    logger.info("Document type distribution:")
    for dt, n in sorted(type_dist.items()):
        logger.info("  %s: %d (%.1f%%)", dt, n, 100 * n / len(examples))

    logger.info("Privilege type distribution:")
    for pt, n in sorted(priv_dist.items()):
        logger.info("  %s: %d (%.1f%%)", pt, n, 100 * n / len(examples))


if __name__ == "__main__":
    main()
