"""
DocIntel LoRA Adapter Merge Script
===================================

Merges a trained LoRA adapter back into the base model and saves a full
16-bit checkpoint ready for ONNX export or direct inference.

Usage:
    python training/scripts/merge_adapter.py \
        --adapter_dir <path/to/adapter> \
        [--config path/to/config.yaml] \
        [--output_dir <path/to/merged_model>]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml
from unsloth import FastLanguageModel


def load_config(config_path: str) -> dict:
    """Load and return the YAML training configuration."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge LoRA adapter into base model")
    parser.add_argument(
        "--adapter_dir",
        type=str,
        required=True,
        help="Path to the saved LoRA adapter directory",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to training_config.yaml (default: training/configs/training_config.yaml)",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default=None,
        help="Output directory for merged model (default: from config or ./merged_model)",
    )
    args = parser.parse_args()

    # Resolve paths.
    project_root = Path(__file__).resolve().parent.parent
    config_path = args.config or str(project_root / "configs" / "training_config.yaml")

    if not Path(config_path).exists():
        print(f"ERROR: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)
    if not Path(args.adapter_dir).exists():
        print(f"ERROR: adapter directory not found: {args.adapter_dir}", file=sys.stderr)
        sys.exit(1)

    cfg = load_config(config_path)
    model_cfg = cfg["model"]
    export_cfg = cfg.get("export", {})

    output_dir = args.output_dir or str(
        project_root / export_cfg.get("merged_model_dir", "./merged_model")
    )

    # ------------------------------------------------------------------
    # Load base model + adapter
    # ------------------------------------------------------------------
    print(f"Loading base model with adapter from {args.adapter_dir}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.adapter_dir,
        max_seq_length=model_cfg["max_seq_length"],
        dtype=model_cfg.get("dtype"),
        load_in_4bit=False,  # load in full precision for merging
    )

    # ------------------------------------------------------------------
    # Merge and save
    # ------------------------------------------------------------------
    print(f"Merging adapter and saving 16-bit model to {output_dir}")
    model.save_pretrained_merged(
        output_dir,
        tokenizer,
        save_method="merged_16bit",
    )

    print(f"Merged model saved to {output_dir}")
    print("Done.")


if __name__ == "__main__":
    main()
