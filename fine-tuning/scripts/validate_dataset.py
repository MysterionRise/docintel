"""
DocIntel Dataset Validation Script
===================================

Comprehensive validation tool for all domain fine-tuning datasets.

Checks performed:
  1. JSON validity          -- every example parses as valid JSON
  2. Schema compliance      -- assistant JSON conforms to domain JSON Schema (draft-07)
  3. Empty fields           -- no empty/null required fields in assistant response
  4. Category balance       -- no category > 3x any other
  5. Duplicates             -- detect duplicate examples by content hash
  6. Token length           -- flag outliers > 4096 tokens
  7. Split ratios           -- train/validation/test ~80/10/10
  8. PII detection          -- scan for SSN, email, phone, credit card patterns
  9. Conversation format    -- valid ChatML format ("messages" key, system/user/assistant roles)

Usage:
    python fine-tuning/scripts/validate_dataset.py --domain contracts
    python fine-tuning/scripts/validate_dataset.py --all
    python fine-tuning/scripts/validate_dataset.py --domain contracts --datasets-dir /custom/path
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import jsonschema
except ImportError:
    jsonschema = None  # type: ignore[assignment]

# Import shared utilities
sys.path.insert(0, str(Path(__file__).resolve().parent))
from shared import (  # noqa: E402
    DATASETS_DIR,
    SCHEMAS_DIR,
    VALID_DOMAINS,
    estimate_tokens,
    load_json_schema,
    setup_logging,
)

logger = setup_logging("validate_dataset")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_ROLES = {"system", "user", "assistant"}

# Canonical conversation key -- must match train_qlora.py / shared.make_conversation
CONVERSATION_KEY = "messages"

MAX_TOKEN_LENGTH = 4096

SPLIT_NAMES = ["train", "validation", "test"]

# Expected split ratios (within tolerance)
EXPECTED_RATIOS = {"train": 0.80, "validation": 0.10, "test": 0.10}
RATIO_TOLERANCE = 0.05

# PII regex patterns
PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone_us": re.compile(
        r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
    ),
    "credit_card": re.compile(
        r"\b(?:\d{4}[-\s]?){3}\d{1,4}\b"
    ),
}

# Known placeholder / Faker-style names that are acceptable
FAKER_INDICATORS = {
    "john doe", "jane doe", "acme", "example", "test", "sample",
    "lorem", "ipsum", "placeholder", "xxx", "redacted", "[name]",
    "[patient]", "[doctor]", "[company]",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    """Result of a single validation check."""

    name: str
    passed: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)
        self.passed = False

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)


@dataclass
class DomainReport:
    """Aggregated validation report for one domain."""

    domain: str
    checks: list[CheckResult] = field(default_factory=list)
    example_count: int = 0
    split_counts: dict[str, int] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return all(c.passed for c in self.checks)


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def check_json_validity(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 1: All examples are valid JSON objects."""
    result = CheckResult(name="JSON validity", passed=True)
    for i, ex in enumerate(examples):
        if not isinstance(ex, dict):
            result.add_error(f"{file_label} example {i}: not a JSON object")
    result.stats["total"] = len(examples)
    return result


def check_conversation_format(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 9: Valid ChatML conversation format ('messages' key required)."""
    result = CheckResult(name="Conversation format", passed=True)
    for i, ex in enumerate(examples):
        conv_key = _get_conversation_key(ex)
        if conv_key is None:
            if "conversations" in ex:
                result.add_error(
                    f"{file_label} example {i}: uses 'conversations' key -- "
                    f"must use '{CONVERSATION_KEY}' to match train_qlora.py"
                )
            else:
                result.add_error(
                    f"{file_label} example {i}: missing '{CONVERSATION_KEY}' key"
                )
            continue

        turns = ex[conv_key]
        if not isinstance(turns, list) or len(turns) == 0:
            result.add_error(
                f"{file_label} example {i}: '{conv_key}' must be a non-empty list"
            )
            continue

        roles_seen: set[str] = set()
        for j, turn in enumerate(turns):
            if not isinstance(turn, dict):
                result.add_error(
                    f"{file_label} example {i} turn {j}: not a dict"
                )
                continue

            role = turn.get("role")
            if role not in VALID_ROLES:
                result.add_error(
                    f"{file_label} example {i} turn {j}: invalid role '{role}'"
                )
            else:
                roles_seen.add(role)

            content = turn.get("content")
            if content is None or (isinstance(content, str) and not content.strip()):
                result.add_error(
                    f"{file_label} example {i} turn {j}: empty content for role '{role}'"
                )

        if "user" not in roles_seen:
            result.add_error(f"{file_label} example {i}: missing 'user' role")
        if "assistant" not in roles_seen:
            result.add_error(f"{file_label} example {i}: missing 'assistant' role")

    return result


def check_schema_compliance(
    examples: list[dict[str, Any]],
    schema: dict[str, Any],
    file_label: str,
) -> CheckResult:
    """Check 2: Assistant response JSON conforms to the domain JSON Schema."""
    result = CheckResult(name="Schema compliance", passed=True)
    checked = 0
    non_json_count = 0
    error_count = 0

    use_jsonschema = jsonschema is not None
    if not use_jsonschema:
        result.add_warning(
            "jsonschema package not installed; falling back to required-key check"
        )

    required_keys = set(schema.get("required", []))

    for i, ex in enumerate(examples):
        assistant_content = _get_assistant_content(ex)
        if assistant_content is None:
            continue

        parsed = _try_parse_json(assistant_content)
        if parsed is None:
            non_json_count += 1
            if non_json_count <= 5:
                result.add_warning(
                    f"{file_label} example {i}: assistant content is not valid JSON"
                )
            continue

        if not isinstance(parsed, dict):
            non_json_count += 1
            continue

        checked += 1

        if use_jsonschema:
            errors = list(jsonschema.Draft7Validator(schema).iter_errors(parsed))
            if errors:
                error_count += 1
                if error_count <= 10:
                    messages = [e.message for e in errors[:3]]
                    result.add_error(
                        f"{file_label} example {i}: schema violations: "
                        + "; ".join(messages)
                    )
        else:
            actual_keys = set(parsed.keys())
            missing = required_keys - actual_keys
            if missing:
                error_count += 1
                if error_count <= 10:
                    result.add_error(
                        f"{file_label} example {i}: missing required keys: "
                        f"{sorted(missing)}"
                    )

    if error_count > 10:
        result.add_error(
            f"{file_label}: {error_count} total schema violations (showing first 10)"
        )

    if non_json_count > 0:
        result.add_warning(
            f"{file_label}: {non_json_count} examples have non-JSON assistant content"
        )
    result.stats["checked"] = checked
    result.stats["non_json"] = non_json_count
    result.stats["violations"] = error_count
    return result


def check_empty_fields(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 3: No empty/null required fields in assistant response."""
    result = CheckResult(name="Empty fields", passed=True)
    empty_count = 0

    for i, ex in enumerate(examples):
        assistant_content = _get_assistant_content(ex)
        if assistant_content is None:
            continue

        parsed = _try_parse_json(assistant_content)
        if parsed is None or not isinstance(parsed, dict):
            continue

        empties = _find_empty_fields(parsed)
        if empties:
            empty_count += 1
            if empty_count <= 10:
                result.add_error(
                    f"{file_label} example {i}: empty fields: {empties}"
                )

    if empty_count > 10:
        result.add_error(
            f"{file_label}: {empty_count} total examples with empty fields "
            f"(showing first 10)"
        )
    result.stats["examples_with_empties"] = empty_count
    return result


def check_category_balance(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 4: Category distribution is balanced (no class > 3x any other)."""
    result = CheckResult(name="Category balance", passed=True)
    doc_types: Counter[str] = Counter()

    for ex in examples:
        assistant_content = _get_assistant_content(ex)
        if assistant_content is None:
            continue
        parsed = _try_parse_json(assistant_content)
        if parsed is None or not isinstance(parsed, dict):
            continue
        doc_type = parsed.get("document_type", "unknown")
        doc_types[doc_type] += 1

    if not doc_types:
        result.add_warning(f"{file_label}: no document_type values found")
        return result

    result.stats["category_distribution"] = dict(doc_types.most_common())

    if len(doc_types) < 2:
        result.add_warning(f"{file_label}: only 1 category found")
        return result

    counts = list(doc_types.values())
    max_count = max(counts)
    min_count = min(counts)

    if min_count > 0:
        ratio = max_count / min_count
        result.stats["imbalance_ratio"] = f"{ratio:.1f}x"

        if ratio > 3:
            result.add_error(
                f"{file_label}: imbalanced categories -- max={max_count}, "
                f"min={min_count} (ratio {ratio:.1f}x, threshold 3x)"
            )
        elif ratio > 2:
            result.add_warning(
                f"{file_label}: moderate category imbalance -- max={max_count}, "
                f"min={min_count} (ratio {ratio:.1f}x)"
            )

    return result


def check_duplicates(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 5: No duplicate examples by content hash."""
    result = CheckResult(name="Duplicates", passed=True)
    seen: dict[str, int] = {}
    dup_count = 0

    for i, ex in enumerate(examples):
        content_hash = hashlib.sha256(
            json.dumps(ex, sort_keys=True).encode()
        ).hexdigest()
        if content_hash in seen:
            dup_count += 1
            if dup_count <= 5:
                result.add_error(
                    f"{file_label} example {i}: duplicate of example {seen[content_hash]}"
                )
        else:
            seen[content_hash] = i

    if dup_count > 5:
        result.add_error(
            f"{file_label}: {dup_count} total duplicates found (showing first 5)"
        )
    result.stats["duplicates"] = dup_count
    return result


def check_token_length(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 6: Flag examples with estimated token count > 4096."""
    result = CheckResult(name="Token length", passed=True)
    lengths: list[int] = []
    outlier_count = 0

    for i, ex in enumerate(examples):
        total_text = json.dumps(ex)
        est_tokens = estimate_tokens(total_text)
        lengths.append(est_tokens)

        if est_tokens > MAX_TOKEN_LENGTH:
            outlier_count += 1
            if outlier_count <= 5:
                result.add_warning(
                    f"{file_label} example {i}: ~{est_tokens} tokens (>{MAX_TOKEN_LENGTH})"
                )

    if lengths:
        sorted_lengths = sorted(lengths)
        result.stats["min_tokens"] = sorted_lengths[0]
        result.stats["max_tokens"] = sorted_lengths[-1]
        result.stats["mean_tokens"] = int(sum(lengths) / len(lengths))
        result.stats["median_tokens"] = sorted_lengths[len(lengths) // 2]
    result.stats["outliers"] = outlier_count

    if outlier_count > 0:
        result.add_warning(
            f"{file_label}: {outlier_count} examples exceed {MAX_TOKEN_LENGTH} tokens"
        )

    return result


def check_split_ratios(split_counts: dict[str, int]) -> CheckResult:
    """Check 7: Train/validation/test split ratios are ~80/10/10."""
    result = CheckResult(name="Split ratios", passed=True)
    total = sum(split_counts.values())

    if total == 0:
        result.add_error("No examples found in any split")
        return result

    missing = [s for s in SPLIT_NAMES if s not in split_counts or split_counts[s] == 0]
    if missing:
        result.add_error(f"Missing or empty splits: {missing}")

    ratios: dict[str, float] = {}
    for split_name, count in split_counts.items():
        ratio = count / total
        ratios[split_name] = ratio
        expected = EXPECTED_RATIOS.get(split_name)
        if expected is not None and abs(ratio - expected) > RATIO_TOLERANCE:
            result.add_error(
                f"Split '{split_name}': ratio {ratio:.2%} deviates from "
                f"expected {expected:.0%} (tolerance {RATIO_TOLERANCE:.0%})"
            )

    result.stats["split_counts"] = split_counts
    result.stats["split_ratios"] = {k: f"{v:.2%}" for k, v in ratios.items()}
    return result


def check_pii(
    examples: list[dict[str, Any]], file_label: str
) -> CheckResult:
    """Check 8: Scan for PII patterns (SSN, email, phone, credit card)."""
    result = CheckResult(name="PII detection", passed=True)
    pii_counts: Counter[str] = Counter()

    for i, ex in enumerate(examples):
        text = json.dumps(ex)
        for pii_type, pattern in PII_PATTERNS.items():
            matches = pattern.findall(text)
            if matches:
                real_matches = [
                    m for m in matches if not _is_placeholder(m, pii_type)
                ]
                if real_matches:
                    pii_counts[pii_type] += len(real_matches)
                    if pii_counts[pii_type] <= 3:
                        result.add_error(
                            f"{file_label} example {i}: potential {pii_type} "
                            f"detected: {real_matches[0]!r}"
                        )

    result.stats["pii_counts"] = dict(pii_counts)
    if any(pii_counts.values()):
        total_pii = sum(pii_counts.values())
        result.add_error(f"{file_label}: {total_pii} total PII matches found")
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_conversation_key(example: dict[str, Any]) -> str | None:
    """Return the conversation key if it matches the canonical format, or None."""
    if CONVERSATION_KEY in example:
        return CONVERSATION_KEY
    return None


def _get_assistant_content(example: dict[str, Any]) -> str | None:
    """Extract the assistant turn content from a conversation example."""
    conv_key = _get_conversation_key(example)
    if conv_key is None:
        return None
    turns = example.get(conv_key, [])
    if not isinstance(turns, list):
        return None
    for turn in turns:
        if isinstance(turn, dict) and turn.get("role") == "assistant":
            return turn.get("content")
    return None


def _try_parse_json(text: str | None) -> Any | None:
    """Attempt to parse a string as JSON, returning None on failure."""
    if not text or not isinstance(text, str):
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _find_empty_fields(obj: dict[str, Any], prefix: str = "") -> list[str]:
    """Recursively find empty/null fields in a parsed JSON object."""
    empties: list[str] = []
    for key, value in obj.items():
        path = f"{prefix}.{key}" if prefix else key
        if value is None:
            empties.append(path)
        elif isinstance(value, str) and not value.strip():
            empties.append(path)
        elif isinstance(value, dict):
            empties.extend(_find_empty_fields(value, path))
        elif isinstance(value, list):
            for j, item in enumerate(value):
                if isinstance(item, dict):
                    empties.extend(_find_empty_fields(item, f"{path}[{j}]"))
    return empties


def _luhn_check(number: str) -> bool:
    """Validate a number string using the Luhn algorithm."""
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 13:
        return False
    checksum = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def _is_placeholder(value: str, pii_type: str) -> bool:
    """Return True if the matched value looks like a known placeholder."""
    lower = value.lower().strip()
    if any(indicator in lower for indicator in FAKER_INDICATORS):
        return True
    if pii_type == "ssn" and value in ("000-00-0000", "123-45-6789"):
        return True
    if pii_type == "email" and ("example.com" in lower or "test.com" in lower):
        return True
    if pii_type == "credit_card" and not _luhn_check(value):
        return True  # Not a valid card number, treat as false positive
    return False


# ---------------------------------------------------------------------------
# File loading
# ---------------------------------------------------------------------------

def load_split_file(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    """Load a dataset split file (.json or .jsonl).

    Returns (examples, errors).
    """
    errors: list[str] = []
    examples: list[dict[str, Any]] = []

    if not path.exists():
        return examples, [f"File not found: {path}"]

    suffix = path.suffix.lower()
    try:
        with open(path, "r", encoding="utf-8") as f:
            if suffix == ".jsonl":
                for line_num, line in enumerate(f, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        examples.append(json.loads(line))
                    except json.JSONDecodeError as exc:
                        errors.append(f"{path.name} line {line_num}: {exc}")
            else:
                # .json -- expect a list
                data = json.load(f)
                if isinstance(data, list):
                    examples = data
                else:
                    errors.append(f"{path.name}: expected a JSON array at top level")
    except json.JSONDecodeError as exc:
        errors.append(f"{path.name}: invalid JSON -- {exc}")

    return examples, errors


# ---------------------------------------------------------------------------
# Domain validation
# ---------------------------------------------------------------------------

def validate_domain(
    domain: str,
    datasets_dir: Path,
    schemas_dir: Path,
) -> DomainReport:
    """Run all validation checks for a single domain."""
    report = DomainReport(domain=domain)
    domain_dir = datasets_dir / domain

    # --- Load JSON Schema via shared utility ---
    schema: dict[str, Any] | None = None
    try:
        schema = load_json_schema(domain)
        logger.info("Loaded JSON Schema for domain '%s'", domain)
    except (FileNotFoundError, ValueError) as exc:
        report.checks.append(
            CheckResult(
                name="Schema loading",
                passed=False,
                errors=[str(exc)],
            )
        )

    # --- Check domain directory exists ---
    if not domain_dir.exists():
        report.checks.append(
            CheckResult(
                name="Dataset directory",
                passed=False,
                errors=[f"Directory not found: {domain_dir}"],
            )
        )
        return report

    # --- Load all splits ---
    all_examples: list[dict[str, Any]] = []
    load_errors: list[str] = []

    for split in SPLIT_NAMES:
        json_path = domain_dir / f"{split}.json"
        jsonl_path = domain_dir / f"{split}.jsonl"
        path = json_path if json_path.exists() else jsonl_path

        examples, errors = load_split_file(path)
        report.split_counts[split] = len(examples)
        all_examples.extend(examples)
        load_errors.extend(errors)

    report.example_count = len(all_examples)

    if load_errors:
        report.checks.append(
            CheckResult(
                name="File loading",
                passed=False,
                errors=load_errors,
            )
        )

    if not all_examples:
        report.checks.append(
            CheckResult(
                name="Data presence",
                passed=False,
                errors=[f"No examples loaded for domain '{domain}'"],
            )
        )
        return report

    file_label = f"[{domain}]"

    # --- Run checks ---
    report.checks.append(check_json_validity(all_examples, file_label))
    report.checks.append(check_conversation_format(all_examples, file_label))

    if schema is not None:
        report.checks.append(
            check_schema_compliance(all_examples, schema, file_label)
        )

    report.checks.append(check_empty_fields(all_examples, file_label))
    report.checks.append(check_category_balance(all_examples, file_label))
    report.checks.append(check_duplicates(all_examples, file_label))
    report.checks.append(check_token_length(all_examples, file_label))
    report.checks.append(check_split_ratios(report.split_counts))
    report.checks.append(check_pii(all_examples, file_label))

    return report


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_report(report: DomainReport) -> None:
    """Print a human-readable validation report for one domain."""
    banner = f"  Domain: {report.domain}  "
    print()
    print("=" * 70)
    print(banner.center(70))
    print("=" * 70)

    print(f"\n  Total examples : {report.example_count}")
    if report.split_counts:
        for split, count in report.split_counts.items():
            print(f"    {split:12s} : {count}")

    for check in report.checks:
        status = "PASS" if check.passed else "FAIL"
        marker = "[+]" if check.passed else "[X]"
        print(f"\n  {marker} {check.name}: {status}")

        if check.stats:
            for key, val in check.stats.items():
                print(f"      {key}: {val}")

        for err in check.errors:
            print(f"      ERROR: {err}")

        for warn in check.warnings[:10]:
            print(f"      WARN:  {warn}")

    verdict = "PASS" if report.passed else "FAIL"
    print(f"\n  {'=' * 30}")
    print(f"  Overall verdict: {verdict}")
    print(f"  {'=' * 30}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="DocIntel dataset validation tool"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--domain",
        type=str,
        choices=list(VALID_DOMAINS),
        help="Validate a single domain dataset",
    )
    group.add_argument(
        "--all",
        action="store_true",
        help="Validate all domain datasets",
    )
    parser.add_argument(
        "--datasets-dir",
        type=str,
        default=None,
        help=f"Path to the datasets directory (default: {DATASETS_DIR})",
    )
    parser.add_argument(
        "--schemas-dir",
        type=str,
        default=None,
        help=f"Path to the schemas directory (default: {SCHEMAS_DIR})",
    )
    args = parser.parse_args()

    datasets_dir = Path(args.datasets_dir) if args.datasets_dir else DATASETS_DIR
    schemas_dir = Path(args.schemas_dir) if args.schemas_dir else SCHEMAS_DIR

    domains = list(VALID_DOMAINS) if args.all else [args.domain]
    reports: list[DomainReport] = []

    for domain in domains:
        report = validate_domain(domain, datasets_dir, schemas_dir)
        reports.append(report)
        print_report(report)

    # --- Overall summary ---
    print("\n" + "=" * 70)
    print("  OVERALL SUMMARY".center(70))
    print("=" * 70)

    all_passed = True
    for report in reports:
        status = "PASS" if report.passed else "FAIL"
        marker = "[+]" if report.passed else "[X]"
        print(f"  {marker} {report.domain:15s}  {report.example_count:>6} examples  {status}")
        if not report.passed:
            all_passed = False

    verdict = "PASS" if all_passed else "FAIL"
    print(f"\n  Final verdict: {verdict}")
    print()

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
