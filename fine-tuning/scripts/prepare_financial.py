#!/usr/bin/env python3
"""
Prepare Financial Extraction Dataset
======================================

Generates synthetic financial documents (invoices, bank statements,
financial statements, tax forms, receipts) and their structured extractions
for DocIntel fine-tuning.

Usage:
    python prepare_financial.py                # Full run (8000 examples)
    python prepare_financial.py --dry-run      # Quick test (50 examples)
    python prepare_financial.py --count 2000   # Custom count
"""

from __future__ import annotations

import argparse
import json
import random
import string
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

logger = setup_logging("prepare_financial")

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are DocIntel, a financial document analysis AI. "
    "Extract structured information from financial documents. "
    "Return valid JSON matching the provided schema. "
    "Include line items, totals, tax amounts, currency, account numbers, "
    "and payment terms."
)

# ---------------------------------------------------------------------------
# Data pools for synthetic generation
# ---------------------------------------------------------------------------

CURRENCIES = [
    ("USD", "$"), ("EUR", "€"), ("GBP", "£"), ("CAD", "C$"),
    ("AUD", "A$"), ("JPY", "¥"), ("CHF", "CHF "),
]

COMPANY_NAMES = [
    "Acme Corporation", "GlobalTech Solutions", "Pinnacle Industries",
    "Stellar Dynamics", "Horizon Enterprises", "Quantum Systems Inc.",
    "Atlas Manufacturing", "Vertex Digital", "Cascade Technologies",
    "Summit Partners LLC", "Meridian Consulting Group", "Blue Ocean Logistics",
    "Iron Bridge Capital", "Pacific Rim Trading Co.", "Eagle Point Services",
    "Nova Healthcare Solutions", "Titan Construction Ltd.", "Sapphire Analytics",
    "Redwood Financial Group", "Silverline Communications", "Apex Energy Corp.",
    "Crescent Real Estate", "Phoenix Aerospace", "Diamond IT Solutions",
    "Cobalt Mining International", "Emerald Pharmaceuticals", "Obsidian Security",
    "Amber Technologies", "Jade Consulting Partners", "Onyx Manufacturing Co.",
]

INVOICE_ITEMS = [
    ("Professional consulting services", (100, 500)),
    ("Software development - Phase 1", (2000, 15000)),
    ("Cloud hosting - monthly", (50, 2000)),
    ("Data analytics platform license", (500, 5000)),
    ("Technical support - annual", (1000, 10000)),
    ("UI/UX design services", (500, 8000)),
    ("Network infrastructure setup", (1000, 20000)),
    ("Cybersecurity audit", (2000, 15000)),
    ("Training and onboarding", (200, 3000)),
    ("Hardware - servers", (3000, 25000)),
    ("Hardware - workstations", (800, 3000)),
    ("Office supplies", (20, 500)),
    ("Printing and copying services", (50, 1000)),
    ("Marketing campaign management", (1000, 10000)),
    ("Legal services - contract review", (500, 5000)),
    ("Accounting and bookkeeping", (200, 2000)),
    ("Warehouse storage - monthly", (300, 3000)),
    ("Freight and shipping", (100, 5000)),
    ("Equipment maintenance", (200, 2000)),
    ("Quality assurance testing", (500, 5000)),
]

PAYMENT_TERMS_OPTIONS = [
    "Net 30", "Net 60", "Net 90", "Net 15",
    "Due on receipt", "2/10 Net 30", "Net 45",
    "50% upfront, 50% on completion",
]

BANK_TRANSACTION_TYPES = [
    ("Direct deposit - Payroll", (2000, 8000)),
    ("Wire transfer - Vendor payment", (500, 50000)),
    ("ACH debit - Utility payment", (50, 500)),
    ("Check deposit", (100, 10000)),
    ("ATM withdrawal", (20, 500)),
    ("Point of sale purchase", (5, 200)),
    ("Online transfer", (100, 5000)),
    ("Mortgage payment", (1000, 4000)),
    ("Insurance premium", (100, 1500)),
    ("Subscription service", (10, 200)),
    ("Loan payment", (200, 2000)),
    ("Tax payment", (500, 15000)),
    ("Refund received", (20, 1000)),
    ("Interest earned", (1, 100)),
    ("Service charge", (5, 50)),
]

FINANCIAL_STATEMENT_ITEMS = {
    "revenue": [
        ("Product revenue", (1000000, 50000000)),
        ("Service revenue", (500000, 20000000)),
        ("Subscription revenue", (200000, 10000000)),
        ("Licensing revenue", (100000, 5000000)),
    ],
    "expenses": [
        ("Cost of goods sold", (500000, 30000000)),
        ("Research and development", (200000, 10000000)),
        ("Sales and marketing", (100000, 8000000)),
        ("General and administrative", (100000, 5000000)),
        ("Depreciation and amortization", (50000, 3000000)),
    ],
}

TAX_FORM_TYPES = [
    "W-2", "1099-NEC", "1099-INT", "1099-DIV", "1099-MISC",
]

STREET_NAMES = [
    "Main St", "Oak Ave", "Park Blvd", "Commerce Dr", "Industrial Way",
    "Tech Lane", "Market St", "Broadway", "First Ave", "Elm St",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _random_address(rng: random.Random) -> str:
    num = rng.randint(100, 9999)
    street = rng.choice(STREET_NAMES)
    cities = ["New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
              "Phoenix, AZ", "San Francisco, CA", "Seattle, WA", "Denver, CO",
              "Boston, MA", "Atlanta, GA", "Austin, TX", "Portland, OR"]
    city = rng.choice(cities)
    zipcode = rng.randint(10000, 99999)
    return f"{num} {street}, {city} {zipcode}"


def _random_account_number(rng: random.Random) -> str:
    """Generate a masked account number."""
    last4 = "".join(rng.choices(string.digits, k=4))
    return f"****{last4}"


def _random_tax_id(rng: random.Random) -> str:
    """Generate a masked tax ID."""
    last4 = "".join(rng.choices(string.digits, k=4))
    return f"**-***{last4}"


def _random_date(rng: random.Random, year: int = 2024) -> str:
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return f"{year}-{month:02d}-{day:02d}"


# ---------------------------------------------------------------------------
# Document generators
# ---------------------------------------------------------------------------


def _generate_invoice(rng: random.Random) -> tuple[str, dict]:
    issuer = rng.choice(COMPANY_NAMES)
    recipient = rng.choice([c for c in COMPANY_NAMES if c != issuer])
    currency_code, symbol = rng.choice(CURRENCIES)
    date = _random_date(rng)
    inv_num = f"INV-{rng.randint(1000, 99999)}"
    terms = rng.choice(PAYMENT_TERMS_OPTIONS)

    # Generate line items
    n_items = rng.randint(2, 8)
    chosen_items = rng.sample(INVOICE_ITEMS, min(n_items, len(INVOICE_ITEMS)))

    line_items = []
    for desc, (lo, hi) in chosen_items:
        qty = rng.randint(1, 20)
        unit_price = round(rng.uniform(lo, hi), 2)
        total = round(qty * unit_price, 2)
        line_items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": unit_price,
            "total": total,
        })

    subtotal = round(sum(item["total"] for item in line_items), 2)
    tax_rate = rng.choice([0.0, 0.05, 0.06, 0.07, 0.08, 0.0825, 0.10, 0.13, 0.20])
    tax = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax, 2)

    # Due date
    due_offsets = {"Net 30": 30, "Net 60": 60, "Net 90": 90, "Net 15": 15, "Net 45": 45}
    due_date = _random_date(rng)  # simplified

    acct = _random_account_number(rng)
    tax_id = _random_tax_id(rng)

    # Build text
    item_lines = "\n".join(
        f"  {i+1}. {item['description']:<45} {item['quantity']:>4} x {symbol}{item['unit_price']:>10,.2f} = {symbol}{item['total']:>12,.2f}"
        for i, item in enumerate(line_items)
    )

    text = (
        f"INVOICE\n"
        f"{'='*60}\n"
        f"Invoice #: {inv_num}\n"
        f"Date: {date}\n"
        f"Due Date: {due_date}\n\n"
        f"FROM:\n  {issuer}\n  {_random_address(rng)}\n  Tax ID: {tax_id}\n\n"
        f"BILL TO:\n  {recipient}\n  {_random_address(rng)}\n\n"
        f"ITEMS:\n{item_lines}\n\n"
        f"{'':>50} Subtotal: {symbol}{subtotal:>12,.2f}\n"
        f"{'':>50}      Tax: {symbol}{tax:>12,.2f} ({tax_rate*100:.1f}%)\n"
        f"{'':>50}    TOTAL: {symbol}{total:>12,.2f}\n\n"
        f"Payment Terms: {terms}\n"
        f"Payment Account: {acct}\n\n"
        f"Thank you for your business."
    )

    structured = {
        "document_type": "invoice",
        "issuer": issuer,
        "recipient": recipient,
        "date": date,
        "line_items": line_items,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "currency": currency_code,
        "account_numbers": [acct],
        "tax_ids": [tax_id],
        "payment_terms": terms,
        "due_date": due_date,
        "summary": (
            f"Invoice {inv_num} from {issuer} to {recipient} for {symbol}{total:,.2f} {currency_code}. "
            f"{len(line_items)} line items, tax {symbol}{tax:,.2f}. Payment terms: {terms}."
        ),
    }

    return text, structured


def _generate_bank_statement(rng: random.Random) -> tuple[str, dict]:
    bank_name = rng.choice([
        "First National Bank", "Citizens Federal Bank", "Pacific Coast Credit Union",
        "Heritage Savings Bank", "Metro Commercial Bank", "Cornerstone Financial",
    ])
    holder = rng.choice(COMPANY_NAMES)
    currency_code, symbol = rng.choice(CURRENCIES[:3])  # USD/EUR/GBP for bank statements
    acct = _random_account_number(rng)
    date = _random_date(rng)
    month = int(date.split("-")[1])
    month_names = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]

    # Generate transactions
    n_txns = rng.randint(8, 20)
    chosen_txns = [rng.choice(BANK_TRANSACTION_TYPES) for _ in range(n_txns)]

    line_items = []
    running_balance = round(rng.uniform(5000, 50000), 2)
    opening_balance = running_balance

    for desc, (lo, hi) in chosen_txns:
        amount = round(rng.uniform(lo, hi), 2)
        is_credit = "deposit" in desc.lower() or "refund" in desc.lower() or "earned" in desc.lower()
        if not is_credit:
            amount = -amount
        running_balance = round(running_balance + amount, 2)
        line_items.append({
            "description": desc,
            "total": amount,
        })

    closing_balance = running_balance
    total_credits = round(sum(item["total"] for item in line_items if item["total"] > 0), 2)
    total_debits = round(sum(item["total"] for item in line_items if item["total"] < 0), 2)

    txn_lines = "\n".join(
        f"  {_random_date(rng)}  {item['description']:<40} {symbol}{item['total']:>12,.2f}"
        for item in line_items
    )

    text = (
        f"BANK STATEMENT\n"
        f"{'='*60}\n"
        f"{bank_name}\n"
        f"Account Holder: {holder}\n"
        f"Account: {acct}\n"
        f"Statement Period: {month_names[month]} 2024\n\n"
        f"Opening Balance: {symbol}{opening_balance:>12,.2f}\n\n"
        f"TRANSACTIONS:\n{txn_lines}\n\n"
        f"Total Credits:  {symbol}{total_credits:>12,.2f}\n"
        f"Total Debits:   {symbol}{total_debits:>12,.2f}\n"
        f"Closing Balance: {symbol}{closing_balance:>12,.2f}\n"
    )

    structured = {
        "document_type": "bank_statement",
        "issuer": bank_name,
        "recipient": holder,
        "date": date,
        "line_items": line_items,
        "subtotal": round(total_credits + total_debits, 2),
        "tax": 0,
        "total": closing_balance,
        "currency": currency_code,
        "account_numbers": [acct],
        "tax_ids": [],
        "payment_terms": "N/A",
        "due_date": "N/A",
        "summary": (
            f"Bank statement for {holder} at {bank_name}, account {acct}. "
            f"{month_names[month]} 2024. {len(line_items)} transactions. "
            f"Opening balance {symbol}{opening_balance:,.2f}, closing balance {symbol}{closing_balance:,.2f}."
        ),
    }

    return text, structured


def _generate_financial_statement(rng: random.Random) -> tuple[str, dict]:
    company = rng.choice(COMPANY_NAMES)
    currency_code, symbol = "USD", "$"
    date = _random_date(rng)
    fiscal_year = rng.choice([2022, 2023, 2024])
    tax_id = _random_tax_id(rng)

    # Revenue items
    rev_items = []
    for desc, (lo, hi) in FINANCIAL_STATEMENT_ITEMS["revenue"]:
        if rng.random() > 0.3:
            amount = round(rng.uniform(lo, hi), 2)
            rev_items.append({"description": desc, "total": amount})

    # Expense items
    exp_items = []
    for desc, (lo, hi) in FINANCIAL_STATEMENT_ITEMS["expenses"]:
        if rng.random() > 0.2:
            amount = round(rng.uniform(lo, hi), 2)
            exp_items.append({"description": desc, "total": -amount})

    total_revenue = round(sum(item["total"] for item in rev_items), 2)
    total_expenses = round(sum(item["total"] for item in exp_items), 2)
    net_income = round(total_revenue + total_expenses, 2)  # expenses are negative
    tax_amount = round(max(0, net_income * rng.uniform(0.15, 0.25)), 2)
    net_after_tax = round(net_income - tax_amount, 2)

    all_items = rev_items + exp_items

    rev_lines = "\n".join(
        f"  {item['description']:<45} {symbol}{item['total']:>15,.2f}" for item in rev_items
    )
    exp_lines = "\n".join(
        f"  {item['description']:<45} ({symbol}{abs(item['total']):>14,.2f})" for item in exp_items
    )

    text = (
        f"INCOME STATEMENT (10-K Summary)\n"
        f"{'='*60}\n"
        f"{company}\n"
        f"Fiscal Year Ended December 31, {fiscal_year}\n"
        f"(In USD)\n\n"
        f"REVENUE:\n{rev_lines}\n"
        f"{'':>45} {'─'*17}\n"
        f"  {'Total Revenue':<45} {symbol}{total_revenue:>15,.2f}\n\n"
        f"OPERATING EXPENSES:\n{exp_lines}\n"
        f"{'':>45} {'─'*17}\n"
        f"  {'Total Expenses':<45} ({symbol}{abs(total_expenses):>14,.2f})\n\n"
        f"  {'Operating Income':<45} {symbol}{net_income:>15,.2f}\n"
        f"  {'Income Tax':<45} ({symbol}{tax_amount:>14,.2f})\n"
        f"{'':>45} {'═'*17}\n"
        f"  {'NET INCOME':<45} {symbol}{net_after_tax:>15,.2f}\n"
    )

    structured = {
        "document_type": "financial_statement",
        "issuer": company,
        "recipient": "Shareholders and SEC",
        "date": f"{fiscal_year}-12-31",
        "line_items": all_items,
        "subtotal": total_revenue,
        "tax": tax_amount,
        "total": net_after_tax,
        "currency": currency_code,
        "account_numbers": [],
        "tax_ids": [tax_id],
        "payment_terms": "N/A",
        "due_date": "N/A",
        "summary": (
            f"Income statement for {company}, FY{fiscal_year}. "
            f"Total revenue {symbol}{total_revenue:,.2f}, total expenses {symbol}{abs(total_expenses):,.2f}. "
            f"Net income after tax: {symbol}{net_after_tax:,.2f}."
        ),
    }

    return text, structured


def _generate_tax_form(rng: random.Random) -> tuple[str, dict]:
    form_type = rng.choice(TAX_FORM_TYPES)
    payer = rng.choice(COMPANY_NAMES)
    recipient_name = f"{rng.choice(['John', 'Jane', 'Robert', 'Maria', 'David', 'Sarah', 'Michael', 'Lisa'])} {rng.choice(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'])}"
    currency_code, symbol = "USD", "$"
    tax_year = rng.choice([2022, 2023, 2024])
    payer_tin = _random_tax_id(rng)
    recipient_tin = _random_tax_id(rng)

    if form_type == "W-2":
        wages = round(rng.uniform(30000, 250000), 2)
        fed_tax = round(wages * rng.uniform(0.10, 0.30), 2)
        ss_wages = min(wages, 160200)
        ss_tax = round(ss_wages * 0.062, 2)
        medicare_tax = round(wages * 0.0145, 2)
        state_tax = round(wages * rng.uniform(0.02, 0.10), 2)
        total = wages

        line_items = [
            {"description": "Wages, tips, other compensation", "total": wages},
            {"description": "Federal income tax withheld", "total": -fed_tax},
            {"description": "Social security wages", "total": ss_wages},
            {"description": "Social security tax withheld", "total": -ss_tax},
            {"description": "Medicare tax withheld", "total": -medicare_tax},
            {"description": "State income tax withheld", "total": -state_tax},
        ]
        tax = round(fed_tax + ss_tax + medicare_tax + state_tax, 2)

        text = (
            f"FORM W-2: Wage and Tax Statement\n"
            f"{'='*60}\n"
            f"Tax Year: {tax_year}\n\n"
            f"EMPLOYER:\n  {payer}\n  EIN: {payer_tin}\n\n"
            f"EMPLOYEE:\n  {recipient_name}\n  SSN: {recipient_tin}\n\n"
            f"Box 1 - Wages: {symbol}{wages:>12,.2f}\n"
            f"Box 2 - Federal tax withheld: {symbol}{fed_tax:>12,.2f}\n"
            f"Box 3 - Social security wages: {symbol}{ss_wages:>12,.2f}\n"
            f"Box 4 - Social security tax: {symbol}{ss_tax:>12,.2f}\n"
            f"Box 5 - Medicare wages: {symbol}{wages:>12,.2f}\n"
            f"Box 6 - Medicare tax: {symbol}{medicare_tax:>12,.2f}\n"
            f"Box 17 - State income tax: {symbol}{state_tax:>12,.2f}\n"
        )
    else:
        # 1099 forms
        amount = round(rng.uniform(500, 100000), 2)
        fed_tax = round(amount * rng.uniform(0, 0.24), 2)
        total = amount
        tax = fed_tax

        line_items = [
            {"description": f"{'Nonemployee compensation' if form_type == '1099-NEC' else 'Income reported'}", "total": amount},
        ]
        if fed_tax > 0:
            line_items.append({"description": "Federal income tax withheld", "total": -fed_tax})

        income_type = {
            "1099-NEC": "Nonemployee compensation",
            "1099-INT": "Interest income",
            "1099-DIV": "Dividend income",
            "1099-MISC": "Miscellaneous income",
        }.get(form_type, "Income")

        text = (
            f"FORM {form_type}\n"
            f"{'='*60}\n"
            f"Tax Year: {tax_year}\n\n"
            f"PAYER:\n  {payer}\n  TIN: {payer_tin}\n\n"
            f"RECIPIENT:\n  {recipient_name}\n  TIN: {recipient_tin}\n\n"
            f"{income_type}: {symbol}{amount:>12,.2f}\n"
            + (f"Federal tax withheld: {symbol}{fed_tax:>12,.2f}\n" if fed_tax > 0 else "")
        )

    structured = {
        "document_type": "tax_form",
        "issuer": payer,
        "recipient": recipient_name,
        "date": f"{tax_year}-12-31",
        "line_items": line_items,
        "subtotal": total,
        "tax": tax,
        "total": total,
        "currency": currency_code,
        "account_numbers": [],
        "tax_ids": [payer_tin, recipient_tin],
        "payment_terms": "N/A",
        "due_date": "N/A",
        "summary": (
            f"Form {form_type} for tax year {tax_year}. "
            f"Payer: {payer}. Recipient: {recipient_name}. "
            f"Total reported: {symbol}{total:,.2f}, tax withheld: {symbol}{tax:,.2f}."
        ),
    }

    return text, structured


def _generate_receipt(rng: random.Random) -> tuple[str, dict]:
    store = rng.choice(COMPANY_NAMES)
    currency_code, symbol = rng.choice(CURRENCIES[:3])
    date = _random_date(rng)

    receipt_items = [
        ("Office paper, A4 ream", (5, 15)),
        ("Printer ink cartridge", (20, 80)),
        ("USB flash drive 32GB", (8, 25)),
        ("Wireless mouse", (15, 50)),
        ("Desk lamp", (20, 80)),
        ("Notebook, ruled", (3, 12)),
        ("Pens, pack of 10", (5, 15)),
        ("Stapler", (8, 25)),
        ("Whiteboard markers", (5, 20)),
        ("Coffee beans, 1kg", (10, 30)),
        ("Bottled water, case", (5, 15)),
        ("Cleaning supplies", (10, 40)),
        ("First aid kit", (15, 50)),
        ("Extension cord", (10, 30)),
        ("Cable organizer", (5, 20)),
    ]

    n_items = rng.randint(1, 6)
    chosen = rng.sample(receipt_items, min(n_items, len(receipt_items)))

    line_items = []
    for desc, (lo, hi) in chosen:
        qty = rng.randint(1, 5)
        unit_price = round(rng.uniform(lo, hi), 2)
        total = round(qty * unit_price, 2)
        line_items.append({
            "description": desc,
            "quantity": qty,
            "unit_price": unit_price,
            "total": total,
        })

    subtotal = round(sum(i["total"] for i in line_items), 2)
    tax_rate = rng.choice([0.0, 0.05, 0.06, 0.07, 0.08, 0.10])
    tax = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax, 2)

    item_lines = "\n".join(
        f"  {item['description']:<30} {item['quantity']:>2} x {symbol}{item['unit_price']:>7,.2f}  {symbol}{item['total']:>8,.2f}"
        for item in line_items
    )

    text = (
        f"RECEIPT\n"
        f"{'─'*40}\n"
        f"{store}\n"
        f"{_random_address(rng)}\n"
        f"Date: {date}\n"
        f"{'─'*40}\n"
        f"{item_lines}\n"
        f"{'─'*40}\n"
        f"{'Subtotal:':>35} {symbol}{subtotal:>8,.2f}\n"
        f"{'Tax:':>35} {symbol}{tax:>8,.2f}\n"
        f"{'TOTAL:':>35} {symbol}{total:>8,.2f}\n"
        f"{'─'*40}\n"
        f"Payment: {'Credit Card' if rng.random() > 0.3 else 'Cash'}\n"
        f"Thank you for your purchase!"
    )

    structured = {
        "document_type": "receipt",
        "issuer": store,
        "recipient": "Customer",
        "date": date,
        "line_items": line_items,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "currency": currency_code,
        "account_numbers": [],
        "tax_ids": [],
        "payment_terms": "Paid in full",
        "due_date": "N/A",
        "summary": (
            f"Receipt from {store} dated {date}. "
            f"{len(line_items)} item(s), total {symbol}{total:,.2f} {currency_code} including {symbol}{tax:,.2f} tax."
        ),
    }

    return text, structured


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

GENERATORS = {
    "invoice": _generate_invoice,
    "bank_statement": _generate_bank_statement,
    "financial_statement": _generate_financial_statement,
    "tax_form": _generate_tax_form,
    "receipt": _generate_receipt,
}

# Distribution: balanced enough to pass 3x ratio check even at small scale.
# At full scale (8000): invoice ~2400, bank ~1920, financial ~1600, tax ~1120, receipt ~960
DOC_TYPE_WEIGHTS = {
    "invoice": 0.30,
    "bank_statement": 0.24,
    "financial_statement": 0.20,
    "tax_form": 0.14,
    "receipt": 0.12,
}


def generate_examples(count: int, seed: int) -> list[dict]:
    """Generate *count* financial training examples."""
    rng = random.Random(seed)
    examples = []
    skipped = 0

    # Compute per-type counts
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
                f"Extract structured financial data from this document:\n\n"
                f"{text}\n\n"
                f"Return JSON with: document_type, issuer, recipient, date, line_items, "
                f"subtotal, tax, total, currency, account_numbers, tax_ids, payment_terms, "
                f"due_date, and summary."
            )

            example = make_conversation(SYSTEM_PROMPT, user_msg, assistant_content)
            examples.append(example)

    if skipped:
        logger.info("Skipped %d examples (token limit)", skipped)

    logger.info("Generated %d financial examples", len(examples))
    return examples


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic financial training dataset for DocIntel."
    )
    parser.add_argument(
        "--count", type=int, default=8000,
        help="Number of examples to generate (default: 8000)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Generate a small sample (50 examples) for testing",
    )
    add_seed_argument(parser)
    args = parser.parse_args()

    count = 50 if args.dry_run else args.count
    logger.info(
        "Starting financial dataset generation (%d examples, seed=%d%s)",
        count, args.seed, ", DRY RUN" if args.dry_run else "",
    )

    examples = generate_examples(count, args.seed)

    output_dir = DATASETS_DIR / "financial"
    counts = save_dataset(examples, output_dir, seed=args.seed)

    logger.info("Dataset saved to %s", output_dir)
    for split, n in counts.items():
        logger.info("  %s: %d examples", split, n)

    # Distribution stats
    type_dist: dict[str, int] = {}
    for ex in examples:
        doc = json.loads(ex["messages"][2]["content"])
        dt = doc["document_type"]
        type_dist[dt] = type_dist.get(dt, 0) + 1
    logger.info("Document type distribution:")
    for dt, n in sorted(type_dist.items()):
        logger.info("  %s: %d (%.1f%%)", dt, n, 100 * n / len(examples))


if __name__ == "__main__":
    main()
