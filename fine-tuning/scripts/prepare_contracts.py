"""
Prepare Contract Analysis Dataset
==================================

Builds a training dataset for contract clause extraction and risk analysis.

Primary source: CUAD (Contract Understanding Atticus Dataset) from HuggingFace.
Fallback / supplement: synthetic contract generation using Faker.

Usage:
    python fine-tuning/scripts/prepare_contracts.py                     # Full CUAD + synthetic
    python fine-tuning/scripts/prepare_contracts.py --synthetic-only     # Synthetic only
    python fine-tuning/scripts/prepare_contracts.py --dry-run            # Small sample (100)
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from faker import Faker

# Allow importing shared.py from the same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
from shared import (
    DATASETS_DIR,
    add_seed_argument,
    estimate_tokens,
    load_json_schema,
    make_conversation,
    save_dataset,
    setup_logging,
)

logger = setup_logging("prepare_contracts")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are DocIntel, a contract analysis AI. Extract structured information "
    "from contract clauses. Return valid JSON matching the provided schema.\n\n"
    "Schema fields:\n"
    "- document_type: NDA | MSA | SaaS | Employment | Lease | Other\n"
    "- parties: [{name, role}]\n"
    "- effective_date, expiration_date\n"
    "- key_clauses: [{clause_type, text, page, risk_level, risk_reason}]\n"
    "- obligations: [{party, obligation, deadline}]\n"
    "- summary"
)

CONTRACT_TYPES = ["NDA", "MSA", "SaaS", "Employment", "Lease", "Other"]

CLAUSE_TYPES = [
    "limitation_of_liability",
    "indemnification",
    "termination",
    "non_compete",
    "confidentiality",
    "ip_ownership",
    "governing_law",
    "dispute_resolution",
    "payment_terms",
    "auto_renewal",
]

# Mapping of clause type to typical risk level
CLAUSE_RISK_MAP: dict[str, str] = {
    "limitation_of_liability": "high",
    "indemnification": "high",
    "termination": "medium",
    "non_compete": "high",
    "confidentiality": "medium",
    "ip_ownership": "high",
    "governing_law": "low",
    "dispute_resolution": "medium",
    "payment_terms": "medium",
    "auto_renewal": "medium",
}

RISK_REASONS: dict[str, list[str]] = {
    "limitation_of_liability": [
        "Caps total liability at contract value, limiting recovery for material breaches.",
        "Excludes consequential damages which may leave party exposed.",
        "Mutual limitation with carve-outs for IP and confidentiality breaches.",
        "One-sided cap favoring the service provider.",
    ],
    "indemnification": [
        "Broad indemnification clause covering third-party IP claims.",
        "Includes defense obligation and duty to hold harmless.",
        "Indemnification survives termination with no time limit.",
        "Mutual indemnification with reasonable scope.",
    ],
    "termination": [
        "Allows termination for convenience with 30-day notice.",
        "Termination for cause requires written notice and 60-day cure period.",
        "Immediate termination upon insolvency or bankruptcy.",
        "No termination for convenience clause, only for material breach.",
    ],
    "non_compete": [
        "Broad non-compete restricting similar business for 2 years post-termination.",
        "Geographic restriction covers the entire United States.",
        "Non-compete limited to specific product category for 12 months.",
        "Overly broad scope that may be unenforceable in certain jurisdictions.",
    ],
    "confidentiality": [
        "Standard mutual NDA with 3-year survival period.",
        "Confidentiality obligations survive indefinitely for trade secrets.",
        "Exclusions for publicly available information and independent development.",
        "One-directional confidentiality favoring disclosing party.",
    ],
    "ip_ownership": [
        "All work product is owned by the commissioning party.",
        "Pre-existing IP remains with original owner; new IP is jointly owned.",
        "Broad assignment of all IP rights with no license-back provision.",
        "Contractor retains IP with perpetual license to client.",
    ],
    "governing_law": [
        "Governed by the laws of the State of Delaware.",
        "Governed by the laws of England and Wales.",
        "Choice of law provision specifies New York without forum selection.",
        "Governing law tied to the location of the service provider.",
    ],
    "dispute_resolution": [
        "Mandatory binding arbitration under AAA rules.",
        "Disputes resolved through mediation first, then litigation.",
        "Arbitration in a neutral jurisdiction with limited discovery.",
        "Exclusive jurisdiction in federal courts of the Northern District of California.",
    ],
    "payment_terms": [
        "Net 30 payment terms with 1.5% monthly late fee.",
        "Payment due upon receipt with no grace period.",
        "Quarterly billing in advance with annual price escalation clause.",
        "Net 60 terms with early payment discount of 2%.",
    ],
    "auto_renewal": [
        "Auto-renews for successive 1-year terms unless 90-day notice given.",
        "Auto-renewal with price increase capped at CPI adjustment.",
        "Evergreen clause with no termination mechanism specified.",
        "Renews month-to-month after initial term with 30-day opt-out.",
    ],
}

US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
    "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York",
    "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
    "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
    "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
    "West Virginia", "Wisconsin", "Wyoming",
]


# ---------------------------------------------------------------------------
# CUAD mapping (for real CUAD data)
# ---------------------------------------------------------------------------

# CUAD has 41 annotation categories; map them to our 10 clause types
CUAD_CATEGORY_MAP: dict[str, str] = {
    "Limitation Of Liability": "limitation_of_liability",
    "Cap On Liability": "limitation_of_liability",
    "Indemnification": "indemnification",
    "Termination For Convenience": "termination",
    "Rofr/Rofo/Rofn": "termination",
    "Non-Compete": "non_compete",
    "Exclusivity": "non_compete",
    "No-Solicit Of Employees": "non_compete",
    "Non-Disparagement": "non_compete",
    "Confidentiality": "confidentiality",
    "Ip Ownership Assignment": "ip_ownership",
    "License Grant": "ip_ownership",
    "Governing Law": "governing_law",
    "Dispute Resolution": "dispute_resolution",
    "Audit Rights": "payment_terms",
    "Price Restrictions": "payment_terms",
    "Minimum Commitment": "payment_terms",
    "Revenue/Profit Sharing": "payment_terms",
    "Renewal Term": "auto_renewal",
    "Auto-Renewal": "auto_renewal",
    "Change Of Control": "termination",
    "Anti-Assignment": "termination",
    "Uncapped Liability": "limitation_of_liability",
    "Insurance": "indemnification",
    "Warranty Duration": "limitation_of_liability",
    "Post-Termination Services": "termination",
    "Covenant Not To Sue": "dispute_resolution",
    "Third Party Beneficiary": "indemnification",
}


def cuad_category_to_clause_type(category: str) -> str | None:
    """Map a CUAD annotation category to our clause_type enum."""
    return CUAD_CATEGORY_MAP.get(category)


# ---------------------------------------------------------------------------
# Synthetic contract generation
# ---------------------------------------------------------------------------


def _generate_clause_text(
    fake: Faker,
    rng: random.Random,
    clause_type: str,
    *,
    company_a: str = "",
    company_b: str = "",
    state: str = "",
) -> str:
    """Generate a realistic-looking contract clause paragraph.

    Args:
        company_a: Party A name — must be passed in to ensure consistency
                   between document text and structured extraction.
        company_b: Party B name.
        state: Governing state for jurisdiction clauses.
    """
    company_a = company_a or fake.company()
    company_b = company_b or fake.company()
    state = state or rng.choice(US_STATES)

    templates: dict[str, list[str]] = {
        "limitation_of_liability": [
            (
                f"LIMITATION OF LIABILITY. IN NO EVENT SHALL {company_a.upper()} BE LIABLE TO "
                f"{company_b.upper()} FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR "
                f"PUNITIVE DAMAGES, REGARDLESS OF THE CAUSE OF ACTION OR THE THEORY OF LIABILITY, "
                f"EVEN IF {company_a.upper()} HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. "
                f"THE TOTAL AGGREGATE LIABILITY OF {company_a.upper()} UNDER THIS AGREEMENT SHALL "
                f"NOT EXCEED THE TOTAL FEES PAID BY {company_b.upper()} DURING THE TWELVE (12) "
                f"MONTH PERIOD PRECEDING THE EVENT GIVING RISE TO THE CLAIM."
            ),
            (
                f"Liability Cap. The maximum aggregate liability of either party arising out of or "
                f"related to this Agreement shall not exceed the greater of (a) the amounts paid or "
                f"payable under this Agreement during the twelve (12) months prior to the claim, or "
                f"(b) ${rng.randint(50, 500) * 1000:,}. This limitation shall not apply to breaches "
                f"of confidentiality obligations or indemnification for third-party IP claims."
            ),
        ],
        "indemnification": [
            (
                f"Indemnification. {company_a} (the \"Indemnifying Party\") shall defend, indemnify, "
                f"and hold harmless {company_b} (the \"Indemnified Party\"), its officers, directors, "
                f"employees, and agents from and against any and all claims, damages, losses, "
                f"liabilities, costs, and expenses (including reasonable attorneys' fees) arising out "
                f"of or resulting from: (a) any breach of this Agreement by the Indemnifying Party; "
                f"(b) any third-party claim alleging that the Indemnifying Party's products or "
                f"services infringe any intellectual property right; or (c) the Indemnifying Party's "
                f"negligence or willful misconduct."
            ),
            (
                f"Mutual Indemnification. Each party agrees to indemnify, defend, and hold harmless "
                f"the other party from any third-party claims arising from: (i) a material breach of "
                f"representations or warranties; (ii) violation of applicable law; or (iii) gross "
                f"negligence or willful misconduct. The indemnified party must provide prompt written "
                f"notice and reasonable cooperation in the defense of any claim."
            ),
        ],
        "termination": [
            (
                f"Termination for Convenience. Either party may terminate this Agreement at any time, "
                f"for any reason or no reason, upon {rng.choice([30, 60, 90])} days' prior written "
                f"notice to the other party. Upon such termination, {company_b} shall pay {company_a} "
                f"for all services performed and expenses incurred through the effective date of "
                f"termination."
            ),
            (
                f"Termination for Cause. Either party may terminate this Agreement immediately upon "
                f"written notice if the other party: (a) materially breaches this Agreement and fails "
                f"to cure such breach within {rng.choice([15, 30, 45])} days after receiving written "
                f"notice thereof; (b) becomes insolvent or files for bankruptcy; or (c) ceases to "
                f"conduct business in the normal course."
            ),
        ],
        "non_compete": [
            (
                f"Non-Competition. During the term of this Agreement and for a period of "
                f"{rng.choice([6, 12, 18, 24])} months following its termination, {company_b} agrees "
                f"not to directly or indirectly engage in, own, manage, operate, or participate in "
                f"any business that competes with {company_a}'s core business of {fake.bs()} within "
                f"the geographic region of {state}."
            ),
            (
                f"Non-Solicitation. For a period of {rng.choice([12, 18, 24])} months following "
                f"termination of this Agreement, neither party shall directly or indirectly solicit, "
                f"recruit, or hire any employee or contractor of the other party who was involved in "
                f"the performance of services under this Agreement."
            ),
        ],
        "confidentiality": [
            (
                f"Confidentiality. Each party acknowledges that in connection with this Agreement it "
                f"may receive Confidential Information of the other party. \"Confidential Information\" "
                f"means any information disclosed by one party to the other, whether orally, in "
                f"writing, or electronically, that is designated as confidential or that reasonably "
                f"should be understood to be confidential. The receiving party shall: (a) hold the "
                f"Confidential Information in strict confidence; (b) not disclose it to any third "
                f"party without prior written consent; and (c) use it solely for the purposes of "
                f"this Agreement. These obligations shall survive for {rng.choice([2, 3, 5])} years "
                f"after termination."
            ),
        ],
        "ip_ownership": [
            (
                f"Intellectual Property Ownership. All Work Product created by {company_b} in "
                f"connection with the Services shall be considered \"work made for hire\" as defined "
                f"under the Copyright Act and shall be the sole and exclusive property of {company_a}. "
                f"To the extent any Work Product does not qualify as work made for hire, {company_b} "
                f"hereby irrevocably assigns to {company_a} all right, title, and interest in and to "
                f"such Work Product, including all intellectual property rights therein."
            ),
            (
                f"License Grant. {company_a} grants to {company_b} a non-exclusive, non-transferable, "
                f"revocable license to use the Software during the term of this Agreement solely for "
                f"{company_b}'s internal business purposes. {company_b} shall not sublicense, modify, "
                f"reverse engineer, or create derivative works based on the Software."
            ),
        ],
        "governing_law": [
            (
                f"Governing Law. This Agreement shall be governed by and construed in accordance with "
                f"the laws of the State of {state}, without regard to its conflict of laws principles. "
                f"Any legal action or proceeding arising under this Agreement shall be brought "
                f"exclusively in the federal or state courts located in {state}, and the parties "
                f"hereby consent to personal jurisdiction and venue therein."
            ),
        ],
        "dispute_resolution": [
            (
                f"Dispute Resolution. Any dispute, controversy, or claim arising out of or relating "
                f"to this Agreement shall first be submitted to mediation in accordance with the "
                f"mediation rules of the American Arbitration Association. If mediation fails to "
                f"resolve the dispute within {rng.choice([30, 45, 60])} days, either party may "
                f"initiate binding arbitration under the Commercial Arbitration Rules of the AAA. "
                f"The arbitration shall take place in {fake.city()}, {state}."
            ),
        ],
        "payment_terms": [
            (
                f"Payment Terms. {company_b} shall pay {company_a} the fees set forth in the "
                f"applicable Statement of Work within {rng.choice(['Net 30', 'Net 45', 'Net 60'])} "
                f"days of receipt of a valid invoice. Late payments shall accrue interest at the rate "
                f"of {rng.choice([1.0, 1.5, 2.0])}% per month or the maximum rate permitted by law, "
                f"whichever is less. All fees are exclusive of applicable taxes."
            ),
        ],
        "auto_renewal": [
            (
                f"Term and Renewal. This Agreement shall commence on the Effective Date and continue "
                f"for an initial term of {rng.choice([1, 2, 3])} year(s) (the \"Initial Term\"). "
                f"Thereafter, this Agreement shall automatically renew for successive "
                f"{rng.choice([1, 2])}-year periods (each a \"Renewal Term\") unless either party "
                f"provides written notice of non-renewal at least {rng.choice([30, 60, 90])} days "
                f"prior to the end of the then-current term."
            ),
        ],
    }

    clause_templates = templates.get(clause_type, templates["confidentiality"])
    return rng.choice(clause_templates)


def _generate_contract_text(
    fake: Faker,
    rng: random.Random,
    contract_type: str,
    clauses: list[dict],
    *,
    company_a: str,
    company_b: str,
    effective_date: str,
) -> str:
    """Assemble clause texts into a contract-like document section.

    All identity fields (company names, date) are passed in from the caller
    to ensure the document text is consistent with the structured extraction.
    """
    header = (
        f"{contract_type} AGREEMENT\n\n"
        f"This {contract_type} Agreement (this \"Agreement\") is entered into as of {effective_date} "
        f"(the \"Effective Date\") by and between {company_a}, a {fake.state()} "
        f"corporation (\"{company_a}\" or \"Party A\"), and {company_b}, a {fake.state()} "
        f"corporation (\"{company_b}\" or \"Party B\").\n\n"
        f"WHEREAS, {company_a} desires to engage {company_b} to provide certain services "
        f"related to {fake.bs()}; and\n\n"
        f"WHEREAS, {company_b} desires to provide such services subject to the terms and "
        f"conditions set forth herein;\n\n"
        f"NOW, THEREFORE, in consideration of the mutual covenants and agreements hereinafter "
        f"set forth and for other good and valuable consideration, the receipt and sufficiency "
        f"of which are hereby acknowledged, the parties agree as follows:\n\n"
    )

    body_parts = []
    for i, clause in enumerate(clauses, start=1):
        body_parts.append(f"Section {i}. {clause['text']}\n")

    return header + "\n".join(body_parts)


def generate_synthetic_contract(
    fake: Faker,
    rng: random.Random,
) -> dict:
    """Generate one synthetic contract training example."""
    contract_type = rng.choice(CONTRACT_TYPES)
    num_clauses = rng.randint(2, 5)
    selected_clause_types = rng.sample(CLAUSE_TYPES, min(num_clauses, len(CLAUSE_TYPES)))

    # Generate identity data ONCE — used consistently across document text and extraction
    company_a = fake.company()
    company_b = fake.company()
    state = rng.choice(US_STATES)
    effective_date = fake.date_between(start_date="-5y", end_date="today").isoformat()
    expiration_date = fake.date_between(start_date="+1y", end_date="+5y").isoformat()

    clauses = []
    obligations = []
    for clause_type in selected_clause_types:
        # Pass the SAME company names and state to ensure clause text matches extraction
        text = _generate_clause_text(
            fake, rng, clause_type,
            company_a=company_a, company_b=company_b, state=state,
        )
        risk_level = CLAUSE_RISK_MAP[clause_type]
        # Sometimes vary the risk level
        if rng.random() < 0.2:
            risk_level = rng.choice(["high", "medium", "low"])
        # Pick a risk reason that matches the actual clause parameters
        risk_reason = rng.choice(RISK_REASONS[clause_type])

        clauses.append({
            "clause_type": clause_type,
            "text": text[:300] + "..." if len(text) > 300 else text,
            "page": rng.randint(1, 15),
            "risk_level": risk_level,
            "risk_reason": risk_reason,
        })

        # Generate an obligation from some clauses
        if clause_type in ("payment_terms", "confidentiality", "non_compete", "termination"):
            obligation_texts = {
                "payment_terms": f"Pay invoiced amounts within agreed payment terms",
                "confidentiality": f"Maintain confidentiality of disclosed information",
                "non_compete": f"Refrain from competing activities during restriction period",
                "termination": f"Provide required written notice before termination",
            }
            obligations.append({
                "party": rng.choice([company_a, company_b]),
                "obligation": obligation_texts[clause_type],
                "deadline": rng.choice(["Ongoing", "30 days", "60 days", "Upon termination", effective_date]),
            })

    # Build the document text — pass same identity to ensure consistency
    contract_text = _generate_contract_text(
        fake, rng, contract_type, clauses,
        company_a=company_a, company_b=company_b, effective_date=effective_date,
    )

    # Build structured output
    structured_output = {
        "document_type": contract_type,
        "parties": [
            {"name": company_a, "role": "party_a"},
            {"name": company_b, "role": "party_b"},
        ],
        "effective_date": effective_date,
        "expiration_date": expiration_date,
        "key_clauses": clauses,
        "obligations": obligations,
        "summary": (
            f"This {contract_type} agreement between {company_a} and {company_b}, effective "
            f"{effective_date}, covers {', '.join(ct.replace('_', ' ') for ct in selected_clause_types)}. "
            f"The agreement expires on {expiration_date}."
        ),
    }

    user_message = (
        f"Analyze this contract and extract key information:\n\n"
        f"{contract_text}\n\n"
        f"Return JSON with: document_type, parties, effective_date, expiration_date, "
        f"key_clauses (with clause_type, text, page, risk_level, risk_reason), "
        f"obligations, and summary."
    )

    assistant_response = json.dumps(structured_output, indent=2, ensure_ascii=False)

    return make_conversation(SYSTEM_PROMPT, user_message, assistant_response)


# ---------------------------------------------------------------------------
# CUAD dataset processing (for network-enabled environments)
# ---------------------------------------------------------------------------


def load_cuad_dataset(max_examples: int) -> list[dict]:
    """Load and transform CUAD dataset from HuggingFace.

    Requires network access and the ``datasets`` library.

    Args:
        max_examples: Maximum number of examples to produce.

    Returns:
        List of conversation dicts in ShareGPT format.
    """
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("datasets library not available. Use --synthetic-only.")
        return []

    logger.info("Loading CUAD dataset from HuggingFace...")
    try:
        cuad = load_dataset("theatticusproject/cuad-qa", split="train")
    except Exception as e:
        logger.error("Failed to load CUAD dataset: %s", e)
        return []

    examples: list[dict] = []
    seen_contexts: set[str] = set()

    for row in cuad:
        if len(examples) >= max_examples:
            break

        context = row.get("context", "")
        question = row.get("question", "")
        answers = row.get("answers", {})

        # Skip empty or duplicate contexts
        context_key = context[:200]
        if not context or context_key in seen_contexts:
            continue
        seen_contexts.add(context_key)

        # Determine clause type from the question
        clause_type = None
        for cuad_cat, our_type in CUAD_CATEGORY_MAP.items():
            if cuad_cat.lower() in question.lower():
                clause_type = our_type
                break

        if clause_type is None:
            clause_type = "confidentiality"  # default fallback

        answer_texts = answers.get("text", [])
        answer_text = answer_texts[0] if answer_texts else ""

        risk_level = CLAUSE_RISK_MAP.get(clause_type, "medium")
        risk_reason = random.choice(RISK_REASONS.get(clause_type, RISK_REASONS["confidentiality"]))

        structured_output = {
            "document_type": "Other",
            "parties": [],
            "effective_date": "",
            "expiration_date": "",
            "key_clauses": [
                {
                    "clause_type": clause_type,
                    "text": answer_text[:300] if answer_text else context[:300],
                    "page": 0,
                    "risk_level": risk_level,
                    "risk_reason": risk_reason,
                }
            ],
            "obligations": [],
            "summary": f"Contract clause related to {clause_type.replace('_', ' ')}.",
        }

        user_message = (
            f"Analyze this contract clause and extract key information:\n\n"
            f"{context}\n\n"
            f"Return JSON with: document_type, parties, effective_date, expiration_date, "
            f"key_clauses (with clause_type, text, page, risk_level, risk_reason), "
            f"obligations, and summary."
        )

        assistant_response = json.dumps(structured_output, indent=2, ensure_ascii=False)
        examples.append(make_conversation(SYSTEM_PROMPT, user_message, assistant_response))

    logger.info("Loaded %d examples from CUAD.", len(examples))
    return examples


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare contract analysis training dataset"
    )
    parser.add_argument(
        "--synthetic-only",
        action="store_true",
        help="Skip CUAD download; generate all data synthetically.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate a small sample (100 examples) for testing.",
    )
    parser.add_argument(
        "--num-examples",
        type=int,
        default=6000,
        help="Target number of total examples (default: 6000).",
    )
    add_seed_argument(parser)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    fake = Faker()
    Faker.seed(args.seed)

    target = 100 if args.dry_run else args.num_examples
    output_dir = DATASETS_DIR / "contracts"

    logger.info("Target examples: %d (dry_run=%s, synthetic_only=%s)", target, args.dry_run, args.synthetic_only)

    examples: list[dict] = []

    # Step 1: Try loading CUAD (unless synthetic-only)
    if not args.synthetic_only and not args.dry_run:
        cuad_target = int(target * 0.6)  # 60% from CUAD
        cuad_examples = load_cuad_dataset(cuad_target)
        examples.extend(cuad_examples)
        logger.info("CUAD examples collected: %d", len(cuad_examples))

    # Step 2: Fill remaining with synthetic data
    remaining = target - len(examples)
    logger.info("Generating %d synthetic contract examples...", remaining)

    for i in range(remaining):
        example = generate_synthetic_contract(fake, rng)

        # Filter out examples that are too long (> 4096 estimated tokens)
        total_text = "".join(
            turn["content"] for turn in example["messages"]
        )
        if estimate_tokens(total_text) > 4096:
            continue

        examples.append(example)

        if (i + 1) % 500 == 0:
            logger.info("  Generated %d / %d synthetic examples", i + 1, remaining)

    logger.info("Total examples: %d", len(examples))

    # Step 3: Save with train/val/test split
    counts = save_dataset(examples, output_dir, seed=args.seed)
    logger.info("Saved dataset to %s", output_dir)
    logger.info("  train: %d | validation: %d | test: %d", counts["train"], counts["validation"], counts["test"])

    # Step 4: Print a sample
    if examples:
        logger.info("Sample example (first):")
        sample = examples[0]
        for turn in sample["messages"]:
            logger.info("  [%s] %s", turn["role"], turn["content"][:120] + "...")


if __name__ == "__main__":
    main()
