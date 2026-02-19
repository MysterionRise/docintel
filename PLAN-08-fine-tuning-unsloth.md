# Plan: Fine-Tuning with Unsloth QLoRA

## Goal
Fine-tune SmolLM3-3B on each of the 4 domain datasets using Unsloth QLoRA. Produce 4 domain-specific merged models ready for ONNX export.

## Prerequisites
- Plan 07 (Dataset Curation) complete
- GPU: A100 80GB (ideal) or RTX 4090 24GB (workable)
- Unsloth installed

## Tasks

### 1. Set up training environment
```bash
pip install "unsloth[colab-new]"
pip install --no-deps trl peft accelerate bitsandbytes
```

### 2. Create base training script (`fine-tuning/scripts/train_base.py`)
Shared training logic for all domains:

```python
import os
import json
import torch
from unsloth import FastLanguageModel, is_bfloat16_supported
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import Dataset

def train_domain(
    domain: str,
    dataset_path: str,
    output_dir: str,
    max_seq_length: int = 4096,
    lora_rank: int = 32,
    epochs: int = 2,
    batch_size: int = 2,
    learning_rate: float = 2e-4,
    gradient_accumulation: int = 4,
):
    """Train a domain-specific model using QLoRA."""

    # 1. Load base model
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name="HuggingFaceTB/SmolLM3-3B",
        max_seq_length=max_seq_length,
        dtype=None,  # auto-detect bf16
        load_in_4bit=True,
    )

    # 2. Add LoRA adapters
    model = FastLanguageModel.get_peft_model(
        model,
        r=lora_rank,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=lora_rank,  # alpha = rank is a good default
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",  # saves 30% VRAM
        random_state=42,
    )

    # 3. Load dataset
    with open(dataset_path) as f:
        raw_data = json.load(f)
    dataset = Dataset.from_list(raw_data)

    # 4. Format dataset for training
    def format_example(example):
        """Convert to ChatML format for SmolLM3."""
        messages = example["conversations"]
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )
        return {"text": text}

    dataset = dataset.map(format_example)

    # 5. Configure training
    training_args = TrainingArguments(
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation,
        warmup_steps=50,
        num_train_epochs=epochs,
        learning_rate=learning_rate,
        fp16=not is_bfloat16_supported(),
        bf16=is_bfloat16_supported(),
        logging_steps=10,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=42,
        output_dir=os.path.join(output_dir, "checkpoints"),
        save_strategy="epoch",
        report_to="none",
    )

    # 6. Train
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=max_seq_length,
        packing=True,  # Pack short examples together
        args=training_args,
    )

    trainer.train()

    # 7. Save LoRA adapters
    adapter_dir = os.path.join(output_dir, "adapter")
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    print(f"LoRA adapters saved to {adapter_dir}")

    # 8. Merge and save full model (16-bit)
    merged_dir = os.path.join(output_dir, "merged")
    model.save_pretrained_merged(merged_dir, tokenizer, save_method="merged_16bit")
    print(f"Merged model saved to {merged_dir}")

    return merged_dir
```

### 3. Create domain-specific training configs
`fine-tuning/configs/contracts.yaml`:
```yaml
domain: contracts
dataset_path: datasets/contracts/train.json
output_dir: models/contracts
max_seq_length: 4096
lora_rank: 32
epochs: 3
batch_size: 2
learning_rate: 2e-4
gradient_accumulation: 4
```

Create similar configs for: `medical.yaml`, `financial.yaml`, `legal.yaml`

### 4. Create training runner scripts
`fine-tuning/scripts/train_contracts.py`:
```python
from train_base import train_domain

merged_dir = train_domain(
    domain="contracts",
    dataset_path="datasets/contracts/train.json",
    output_dir="models/contracts",
    epochs=3,
    lora_rank=32,
)
print(f"Contract model ready at: {merged_dir}")
```

One script per domain.

### 5. Create evaluation script (`fine-tuning/scripts/evaluate.py`)
Test the fine-tuned model against the held-out test set:

```python
def evaluate_domain(model_path: str, test_path: str, domain: str):
    """Evaluate fine-tuned model on test set."""
    model, tokenizer = FastLanguageModel.from_pretrained(model_path, load_in_4bit=True)
    FastLanguageModel.for_inference(model)

    with open(test_path) as f:
        test_data = json.load(f)

    results = {
        "total": len(test_data),
        "valid_json": 0,
        "schema_compliant": 0,
        "field_accuracy": {},
    }

    for example in tqdm(test_data):
        # Generate output
        prompt = example["conversations"][:-1]  # All but assistant message
        expected = json.loads(example["conversations"][-1]["content"])

        output = generate(model, tokenizer, prompt)

        # Check valid JSON
        try:
            parsed = json.loads(output)
            results["valid_json"] += 1

            # Check schema compliance
            if validate_schema(parsed, domain):
                results["schema_compliant"] += 1

            # Check field-level accuracy
            for field in expected:
                if field not in results["field_accuracy"]:
                    results["field_accuracy"][field] = {"correct": 0, "total": 0}
                results["field_accuracy"][field]["total"] += 1
                if parsed.get(field) == expected[field]:
                    results["field_accuracy"][field]["correct"] += 1

        except json.JSONDecodeError:
            pass

    return results
```

### 6. Create golden test suite
50 hand-crafted examples per domain with perfect expected outputs.
These serve as regression tests after any model change.

`fine-tuning/golden_tests/contracts/`:
- 10 NDA clauses with expected risk assessment
- 10 MSA clauses with expected obligations
- 10 SaaS agreement terms with expected extraction
- 10 Employment contract clauses
- 10 Edge cases (ambiguous clauses, multi-language, poor formatting)

### 7. Hyperparameter sweep (optional but recommended)
Test variations:
- Rank: [16, 32, 64]
- Learning rate: [1e-4, 2e-4, 5e-4]
- Epochs: [2, 3, 4]

Track: JSON validity rate, schema compliance, field accuracy

### 8. Compare base vs fine-tuned
Run the same golden test suite on:
1. Base SmolLM3-3B (no fine-tuning)
2. Fine-tuned SmolLM3-3B (our model)

Document the improvement in a comparison table. This becomes your portfolio evidence and marketing material.

## Expected Training Times (per domain)
| Hardware | Time per domain | VRAM Used |
|----------|----------------|-----------|
| A100 80GB | ~2 hours | ~20GB |
| RTX 4090 24GB | ~4 hours | ~18GB |
| RTX 3090 24GB | ~6 hours | ~20GB |
| Google Colab T4 | ~8 hours | ~15GB |

## Output
```
fine-tuning/models/
├── contracts/
│   ├── adapter/           # LoRA weights only (~100MB)
│   ├── merged/            # Full 16-bit model (~6GB)
│   └── eval_results.json
├── medical/
├── financial/
└── legal/
```

## Acceptance Criteria
- [ ] All 4 domain models train to completion without errors
- [ ] Training loss decreases steadily (no divergence)
- [ ] JSON validity rate on test set > 90%
- [ ] Schema compliance rate > 85%
- [ ] Measurable improvement over base model on golden tests
- [ ] LoRA adapters and merged models saved correctly
- [ ] Evaluation results documented per domain
