"""
Shared Utilities for DocIntel Dataset Curation
===============================================

Common functions used by all domain-specific dataset preparation scripts.

Usage:
    from shared import (
        estimate_tokens,
        make_conversation,
        save_dataset,
        load_json_schema,
        setup_logging,
    )
"""

from __future__ import annotations

import json
import logging
import random
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = PROJECT_ROOT / "schemas"
DATASETS_DIR = PROJECT_ROOT / "datasets"

VALID_DOMAINS = ("contracts", "medical", "financial", "legal")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def setup_logging(name: str, *, level: int = logging.INFO) -> logging.Logger:
    """Create and return a consistently configured logger.

    Args:
        name: Logger name (typically the script/module name).
        level: Logging level. Defaults to INFO.

    Returns:
        A configured ``logging.Logger`` instance.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s | %(name)s | %(levelname)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


def estimate_tokens(text: str) -> int:
    """Estimate the number of tokens in *text*.

    Uses the common heuristic of ~4 characters per token.  This is a rough
    approximation that works reasonably well for English text and avoids
    requiring a tokenizer dependency at curation time.

    Args:
        text: The input string.

    Returns:
        Estimated token count (always >= 0).
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


# ---------------------------------------------------------------------------
# ChatML conversation builder
# ---------------------------------------------------------------------------


def make_conversation(
    system: str,
    user: str,
    assistant: str,
) -> dict[str, list[dict[str, str]]]:
    """Build a ChatML-format conversation dict.

    This matches the format expected by ``train_qlora.py``'s
    ``load_jsonl_dataset`` / ``format_chatml`` functions, which require a
    ``"messages"`` key with ``"role"`` / ``"content"`` turn dicts.

    Args:
        system: The system prompt.
        user: The user message.
        assistant: The expected assistant response.

    Returns:
        A dict with a ``"messages"`` key containing the three turns::

            {
                "messages": [
                    {"role": "system", "content": "..."},
                    {"role": "user", "content": "..."},
                    {"role": "assistant", "content": "..."},
                ]
            }
    """
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ]
    }


# ---------------------------------------------------------------------------
# Dataset persistence (shuffle + split + write)
# ---------------------------------------------------------------------------


def save_dataset(
    examples: list[dict[str, Any]],
    output_dir: str | Path,
    *,
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> dict[str, int]:
    """Shuffle, split, and write a dataset to disk as JSON files.

    Produces three files in *output_dir*:
        - ``train.json``       (80 % by default)
        - ``validation.json``  (10 % by default)
        - ``test.json``        (10 % by default)

    Args:
        examples: List of example dicts (ChatML format with "messages" key).
        output_dir: Directory to write the split files into.
        seed: Random seed for reproducible shuffling.
        train_ratio: Fraction of data for the training split.
        val_ratio: Fraction of data for the validation split.

    Returns:
        A dict mapping split name to example count, e.g.
        ``{"train": 8000, "validation": 1000, "test": 1000}``.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    rng = random.Random(seed)
    shuffled = list(examples)
    rng.shuffle(shuffled)

    n = len(shuffled)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    splits = {
        "train": shuffled[:n_train],
        "validation": shuffled[n_train : n_train + n_val],
        "test": shuffled[n_train + n_val :],
    }

    counts: dict[str, int] = {}
    for split_name, split_data in splits.items():
        out_path = output_dir / f"{split_name}.json"
        with open(out_path, "w") as f:
            json.dump(split_data, f, indent=2, ensure_ascii=False)
        counts[split_name] = len(split_data)

    return counts


# ---------------------------------------------------------------------------
# Schema loading
# ---------------------------------------------------------------------------


def load_json_schema(domain: str) -> dict[str, Any]:
    """Load the JSON schema for the given domain.

    Looks for ``fine-tuning/schemas/<domain>_schema.json``.

    Args:
        domain: One of ``contracts``, ``medical``, ``financial``, ``legal``.

    Returns:
        The parsed schema dict.

    Raises:
        FileNotFoundError: If the schema file does not exist.
        ValueError: If *domain* is not a recognised domain name.
    """
    if domain not in VALID_DOMAINS:
        raise ValueError(
            f"Unknown domain {domain!r}. Expected one of {VALID_DOMAINS}"
        )

    _DOMAIN_TO_SCHEMA_STEM = {
        "contracts": "contract",
        "medical": "medical",
        "financial": "financial",
        "legal": "legal",
    }
    stem = _DOMAIN_TO_SCHEMA_STEM[domain]
    schema_path = SCHEMAS_DIR / f"{stem}_schema.json"

    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")

    with open(schema_path, "r") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Seed-aware argparse helper
# ---------------------------------------------------------------------------


def add_seed_argument(parser: "argparse.ArgumentParser") -> None:
    """Add a ``--seed`` argument to an argparse parser.

    Args:
        parser: The ``ArgumentParser`` instance to augment.
    """
    import argparse  # noqa: F811 — deferred to keep module-level import light

    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
