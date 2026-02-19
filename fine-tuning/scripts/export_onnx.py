"""
DocIntel ONNX Export Script
============================

Exports a merged HuggingFace model to ONNX format using HF Optimum.
The exported model uses the ``text-generation-with-past`` task so that
the KV-cache is included in the graph for efficient autoregressive inference.

Usage:
    python training/scripts/export_onnx.py \
        [--model_dir <path/to/merged_model>] \
        [--output_dir <path/to/onnx_model>] \
        [--config path/to/config.yaml] \
        [--opset <17>]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml
from optimum.exporters.onnx import main_export


def load_config(config_path: str) -> dict:
    """Load and return the YAML training configuration."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export merged model to ONNX via HF Optimum")
    parser.add_argument(
        "--model_dir",
        type=str,
        default=None,
        help="Path to the merged model directory (default: from config)",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default=None,
        help="Output directory for the ONNX model (default: from config)",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to training_config.yaml (default: training/configs/training_config.yaml)",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=None,
        help="ONNX opset version (default: from config or 17)",
    )
    args = parser.parse_args()

    # Resolve paths.
    project_root = Path(__file__).resolve().parent.parent
    config_path = args.config or str(project_root / "configs" / "training_config.yaml")

    if not Path(config_path).exists():
        print(f"ERROR: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    cfg = load_config(config_path)
    export_cfg = cfg.get("export", {})

    model_dir = args.model_dir or str(
        project_root / export_cfg.get("merged_model_dir", "./merged_model")
    )
    output_dir = args.output_dir or str(
        project_root / export_cfg.get("onnx_output_dir", "./onnx_model")
    )
    opset = args.opset or export_cfg.get("opset", 17)

    if not Path(model_dir).exists():
        print(f"ERROR: merged model directory not found: {model_dir}", file=sys.stderr)
        sys.exit(1)

    # ------------------------------------------------------------------
    # Export to ONNX
    # ------------------------------------------------------------------
    print(f"Exporting model from {model_dir}")
    print(f"  Task  : text-generation")
    print(f"  Opset : {opset}")
    print(f"  Output: {output_dir}")

    main_export(
        model_name_or_path=model_dir,
        output=output_dir,
        task="text-generation",
        opset=opset,
    )

    print(f"ONNX model exported to {output_dir}")
    print("Done.")


if __name__ == "__main__":
    main()
