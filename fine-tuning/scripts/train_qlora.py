"""
DocIntel QLoRA Fine-Tuning Script
=================================

Fine-tunes a language model with QLoRA using Unsloth for efficient training.

Usage:
    python training/scripts/train_qlora.py --domain <domain_name> [--config path/to/config.yaml]

The script expects training data at:
    training/data/<domain>_train.jsonl

Each line of the JSONL must contain a "messages" field in ChatML format:
    {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import yaml
from datasets import Dataset
from trl import SFTTrainer
from transformers import TrainingArguments
from unsloth import FastLanguageModel


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_config(config_path: str) -> dict:
    """Load and return the YAML training configuration."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def format_chatml(messages: list[dict]) -> str:
    """Convert a list of ChatML messages to a single formatted string.

    Format:
        <|im_start|>role
        content<|im_end|>
    Ends with a trailing newline so the model sees a clean boundary.
    """
    parts: list[str] = []
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        parts.append(f"<|im_start|>{role}\n{content}<|im_end|>")
    return "\n".join(parts) + "\n"


def load_jsonl_dataset(data_path: str) -> Dataset:
    """Load a JSONL file with ChatML messages and return a HuggingFace Dataset.

    Each line must have a ``messages`` key containing the conversation turns.
    The function converts these into a single ``text`` field using ChatML
    formatting so that SFTTrainer can consume it directly.
    """
    texts: list[str] = []
    with open(data_path, "r") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"WARNING: skipping malformed JSON at line {line_num}: {exc}")
                continue

            if "messages" not in record:
                print(f"WARNING: skipping line {line_num} — missing 'messages' key")
                continue

            texts.append(format_chatml(record["messages"]))

    if not texts:
        print(f"ERROR: no valid training examples found in {data_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(texts)} training examples from {data_path}")
    return Dataset.from_dict({"text": texts})


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="DocIntel QLoRA fine-tuning with Unsloth")
    parser.add_argument(
        "--domain",
        type=str,
        required=True,
        help="Domain name — expects training/data/<domain>_train.jsonl",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to training_config.yaml (default: training/configs/training_config.yaml)",
    )
    args = parser.parse_args()

    # Resolve paths relative to the project root (two levels up from this script).
    project_root = Path(__file__).resolve().parent.parent
    config_path = args.config or str(project_root / "configs" / "training_config.yaml")
    data_path = str(project_root / "data" / f"{args.domain}_train.jsonl")

    if not Path(config_path).exists():
        print(f"ERROR: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)
    if not Path(data_path).exists():
        print(f"ERROR: training data not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    cfg = load_config(config_path)
    model_cfg = cfg["model"]
    lora_cfg = cfg["lora"]
    train_cfg = cfg["training"]
    sft_cfg = cfg["sft"]
    wandb_cfg = cfg.get("wandb", {})

    # -----------------------------------------------------------------------
    # WandB setup
    # -----------------------------------------------------------------------
    if train_cfg.get("report_to") == "wandb":
        import wandb

        wandb.init(
            project=wandb_cfg.get("project", "docintel"),
            entity=wandb_cfg.get("entity"),
            name=f"docintel-{args.domain}",
            config=cfg,
        )

    # -----------------------------------------------------------------------
    # Load model + tokenizer via Unsloth
    # -----------------------------------------------------------------------
    print(f"Loading model: {model_cfg['name']}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_cfg["name"],
        max_seq_length=model_cfg["max_seq_length"],
        dtype=model_cfg.get("dtype"),
        load_in_4bit=model_cfg["load_in_4bit"],
    )

    # -----------------------------------------------------------------------
    # Apply LoRA adapters
    # -----------------------------------------------------------------------
    print("Applying LoRA adapters …")
    model = FastLanguageModel.get_peft_model(
        model,
        r=lora_cfg["r"],
        lora_alpha=lora_cfg["lora_alpha"],
        lora_dropout=lora_cfg["lora_dropout"],
        bias=lora_cfg["bias"],
        target_modules=lora_cfg["target_modules"],
        use_gradient_checkpointing=lora_cfg["use_gradient_checkpointing"],
        random_state=lora_cfg["random_state"],
    )

    # -----------------------------------------------------------------------
    # Load dataset
    # -----------------------------------------------------------------------
    dataset = load_jsonl_dataset(data_path)

    # -----------------------------------------------------------------------
    # Configure training arguments
    # -----------------------------------------------------------------------
    output_dir = os.path.join(
        str(project_root),
        train_cfg.get("output_dir", "./output"),
        args.domain,
    )

    training_args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=train_cfg["per_device_train_batch_size"],
        gradient_accumulation_steps=train_cfg["gradient_accumulation_steps"],
        num_train_epochs=train_cfg["num_train_epochs"],
        learning_rate=train_cfg["learning_rate"],
        lr_scheduler_type=train_cfg["lr_scheduler_type"],
        warmup_ratio=train_cfg["warmup_ratio"],
        weight_decay=train_cfg["weight_decay"],
        max_grad_norm=train_cfg["max_grad_norm"],
        fp16=train_cfg["fp16"],
        bf16=train_cfg["bf16"],
        optim=train_cfg["optim"],
        logging_steps=train_cfg["logging_steps"],
        save_strategy=train_cfg["save_strategy"],
        seed=train_cfg["seed"],
        report_to=train_cfg.get("report_to", "none"),
    )

    # -----------------------------------------------------------------------
    # Build SFTTrainer
    # -----------------------------------------------------------------------
    print("Initialising SFTTrainer …")
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=training_args,
        max_seq_length=sft_cfg["max_seq_length"],
        packing=sft_cfg["packing"],
        dataset_num_proc=sft_cfg["dataset_num_proc"],
    )

    # -----------------------------------------------------------------------
    # Train
    # -----------------------------------------------------------------------
    print("Starting training …")
    trainer_stats = trainer.train()

    print("Training complete.")
    print(f"  Total steps : {trainer_stats.global_step}")
    print(f"  Train loss  : {trainer_stats.training_loss:.4f}")

    # -----------------------------------------------------------------------
    # Save adapter
    # -----------------------------------------------------------------------
    adapter_dir = os.path.join(output_dir, "adapter")
    print(f"Saving LoRA adapter to {adapter_dir}")
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)

    if train_cfg.get("report_to") == "wandb":
        wandb.finish()

    print("Done.")


if __name__ == "__main__":
    main()
