"""
DocIntel Olive Quantisation Script
====================================

Quantises an ONNX model for WebGPU deployment using Microsoft Olive.
Applies QInt4 weight quantisation with Float16 activations, producing a
compact model suitable for in-browser inference.

Usage:
    python training/scripts/quantize_olive.py \
        [--onnx_dir <path/to/onnx_model>] \
        [--output_dir <path/to/olive_model>] \
        [--olive_config <path/to/olive_config.json>] \
        [--config path/to/config.yaml]
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

import yaml
from olive.workflows import run as olive_run


def load_config(config_path: str) -> dict:
    """Load and return the YAML training configuration."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def build_olive_config(
    onnx_model_dir: str,
    output_dir: str,
    olive_config_path: str | None = None,
) -> dict:
    """Build or load the Olive run configuration.

    If ``olive_config_path`` is given and the file exists, load it and inject
    the model/output paths.  Otherwise, construct a sensible default config
    targeting WebGPU with QInt4 weights and Float16 activations.
    """
    if olive_config_path and Path(olive_config_path).exists():
        with open(olive_config_path, "r") as f:
            config = json.load(f)
        # Patch paths into the loaded config.
        if "input_model" in config:
            config["input_model"]["model_path"] = onnx_model_dir
        if "output_dir" not in config:
            config["output_dir"] = output_dir
        return config

    # Fallback: build config programmatically.
    return {
        "input_model": {
            "type": "OnnxModel",
            "model_path": onnx_model_dir,
        },
        "systems": {
            "local_system": {
                "type": "LocalSystem",
                "accelerators": [
                    {"device": "gpu", "execution_providers": ["WebGpuExecutionProvider"]}
                ],
            }
        },
        "evaluators": {
            "common_evaluator": {
                "metrics": [
                    {
                        "name": "latency",
                        "type": "latency",
                        "sub_types": [{"name": "avg"}],
                    }
                ]
            }
        },
        "passes": {
            "quantization": {
                "type": "OnnxMatMul4Quantizer",
                "config": {
                    "block_size": 32,
                    "is_symmetric": True,
                },
            },
            "conversion": {
                "type": "OnnxFloatToFloat16",
                "config": {
                    "keep_io_types": True,
                },
            },
        },
        "pass_flows": [["quantization", "conversion"]],
        "host": "local_system",
        "target": "local_system",
        "output_dir": output_dir,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quantise ONNX model with Olive for WebGPU deployment"
    )
    parser.add_argument(
        "--onnx_dir",
        type=str,
        default=None,
        help="Path to the ONNX model directory (default: from config)",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default=None,
        help="Output directory for quantised model (default: from config)",
    )
    parser.add_argument(
        "--olive_config",
        type=str,
        default=None,
        help="Path to olive_config.json (default: training/configs/olive_config.json)",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to training_config.yaml (default: training/configs/training_config.yaml)",
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

    onnx_dir = args.onnx_dir or str(
        project_root / export_cfg.get("onnx_output_dir", "./onnx_model")
    )
    output_dir = args.output_dir or str(
        project_root / export_cfg.get("olive_output_dir", "./olive_model")
    )
    olive_config_path = args.olive_config or str(
        project_root / "configs" / "olive_config.json"
    )

    if not Path(onnx_dir).exists():
        print(f"ERROR: ONNX model directory not found: {onnx_dir}", file=sys.stderr)
        sys.exit(1)

    # ------------------------------------------------------------------
    # Build Olive config
    # ------------------------------------------------------------------
    olive_cfg = build_olive_config(onnx_dir, output_dir, olive_config_path)

    print("Olive quantisation configuration:")
    print(json.dumps(olive_cfg, indent=2))
    print()

    # ------------------------------------------------------------------
    # Run Olive pipeline
    # ------------------------------------------------------------------
    print(f"Running Olive quantisation pipeline …")
    print(f"  Input : {onnx_dir}")
    print(f"  Output: {output_dir}")

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False
    ) as tmp:
        json.dump(olive_cfg, tmp, indent=2)
        tmp_path = tmp.name

    try:
        olive_run(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    print(f"Quantised model saved to {output_dir}")
    print("Done.")


if __name__ == "__main__":
    main()
