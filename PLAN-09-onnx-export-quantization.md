# Plan: ONNX Export & WebGPU Quantization

## Goal
Convert each fine-tuned domain model from PyTorch to ONNX, quantize to 4-bit, validate in-browser, and publish to HuggingFace Hub.

## Prerequisites
- Plan 08 (Fine-Tuning) complete — merged 16-bit models available
- Microsoft Olive or HuggingFace Optimum installed

## Tasks

### 1. Install ONNX export tools
```bash
pip install optimum[onnxruntime] onnxruntime onnx
pip install olive-ai  # Microsoft Olive for WebGPU optimization
```

### 2. Export merged model to ONNX (`fine-tuning/scripts/export_onnx.py`)
```python
from optimum.onnxruntime import ORTModelForCausalLM
from transformers import AutoTokenizer

def export_to_onnx(merged_model_path: str, onnx_output_path: str):
    """Export merged PyTorch model to ONNX format."""
    model = ORTModelForCausalLM.from_pretrained(
        merged_model_path,
        export=True,
        provider="CPUExecutionProvider",
    )
    tokenizer = AutoTokenizer.from_pretrained(merged_model_path)

    model.save_pretrained(onnx_output_path)
    tokenizer.save_pretrained(onnx_output_path)
    print(f"ONNX model saved to {onnx_output_path}")

# Alternative using CLI:
# optimum-cli export onnx \
#   --model fine-tuning/models/contracts/merged \
#   --task text-generation-with-past \
#   fine-tuning/models/contracts/onnx/
```

### 3. Quantize to 4-bit for WebGPU
Two approaches (try both, use whichever works better):

**Approach A: Microsoft Olive (preferred for WebGPU)**
```python
# fine-tuning/scripts/quantize_olive.py
# Olive config for WebGPU-optimized 4-bit quantization
olive_config = {
    "input_model": {
        "type": "OnnxModel",
        "model_path": "models/contracts/onnx/model.onnx",
    },
    "systems": {
        "local_system": {
            "type": "LocalSystem",
            "accelerators": [{"device": "gpu"}],
        }
    },
    "passes": {
        "quantize": {
            "type": "OnnxMatMul4Quantizer",
            "config": {
                "block_size": 32,
                "is_symmetric": True,
                "accuracy_level": 4,
            }
        },
        "optimize": {
            "type": "OrtTransformersOptimization",
            "config": {
                "model_type": "gpt2",  # or appropriate architecture
                "opt_level": 2,
                "use_gpu": True,
            }
        }
    },
    "engine": {
        "target": "local_system",
        "output_dir": "models/contracts/webgpu",
    }
}

# Run: olive run --config olive_config.json
```

**Approach B: HuggingFace scripts (alternative)**
```bash
python -m scripts.convert \
  --quantize \
  --model_id fine-tuning/models/contracts/onnx \
  --output_dir fine-tuning/models/contracts/webgpu \
  --task text-generation-with-past
```

### 4. Validate ONNX model locally
```python
# fine-tuning/scripts/validate_onnx.py
import onnxruntime as ort
import numpy as np

def validate_onnx_model(model_path: str):
    """Quick validation that ONNX model loads and produces output."""
    session = ort.InferenceSession(model_path)

    # Check inputs/outputs
    print("Inputs:", [(i.name, i.shape, i.type) for i in session.get_inputs()])
    print("Outputs:", [(o.name, o.shape, o.type) for o in session.get_outputs()])

    # Test inference
    # ... create dummy inputs matching the model's expected shapes
    # ... run session.run() and verify output is not garbage
```

### 5. Validate in browser (critical!)
Create a minimal test HTML page:

```html
<!-- fine-tuning/test/browser_test.html -->
<script type="module">
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

const modelId = './models/contracts/webgpu';  // or HF Hub path
const generator = await pipeline('text-generation', modelId, {
  dtype: 'q4f16',
  device: 'webgpu',
});

const output = await generator([
  { role: 'system', content: 'You are DocIntel...' },
  { role: 'user', content: 'Analyze this clause: ...' },
], { max_new_tokens: 512 });

console.log(output[0].generated_text.at(-1).content);
</script>
```

Test each model variant in Chrome with WebGPU enabled. Check:
- Model loads without errors
- Inference produces coherent output
- No OOM on 8GB VRAM device
- Token speed > 5 tok/s

### 6. Handle the Transformers.js conversion path
If Olive/Optimum export fails or produces bad results, use the Transformers.js conversion script directly:

```bash
# Clone transformers.js repo
git clone https://github.com/huggingface/transformers.js.git
cd transformers.js

# Convert model
python -m scripts.convert \
  --quantize \
  --model_id /path/to/merged/model \
  --output_dir /path/to/output
```

This produces files in the exact format Transformers.js expects:
- `onnx/model_q4f16.onnx` (quantized model)
- `onnx/model_q4f16.onnx_data` (weights)
- `tokenizer.json`, `tokenizer_config.json`
- `config.json`

### 7. Upload to HuggingFace Hub
```python
# fine-tuning/scripts/upload_model.py
from huggingface_hub import HfApi

api = HfApi()

domains = ["contracts", "medical", "financial", "legal"]

for domain in domains:
    repo_id = f"your-org/docintel-{domain}-3b-webgpu"
    api.create_repo(repo_id, exist_ok=True)
    api.upload_folder(
        folder_path=f"models/{domain}/webgpu",
        repo_id=repo_id,
        commit_message=f"Upload {domain} model v1.0",
    )
    print(f"Uploaded to https://huggingface.co/{repo_id}")
```

### 8. Create model cards
Each model repo gets a README.md:
```markdown
# DocIntel Contract Analyzer (3B, WebGPU-ready)

Fine-tuned SmolLM3-3B for contract analysis. Runs in-browser via WebGPU.

## Usage with Transformers.js
\```javascript
import { pipeline } from '@huggingface/transformers';
const analyzer = await pipeline('text-generation', 'your-org/docintel-contracts-3b-webgpu', {
  dtype: 'q4f16', device: 'webgpu'
});
\```

## Training Details
- Base model: SmolLM3-3B
- Method: QLoRA (rank 32, all linear layers)
- Dataset: 5,000+ contract analysis examples
- Quantization: 4-bit (int4, block size 32)

## Benchmarks
| Metric | Base SmolLM3 | This Model |
|--------|-------------|------------|
| JSON validity | X% | Y% |
| Schema compliance | X% | Y% |
```

### 9. Fallback strategy
If fine-tuned ONNX export fails for SmolLM3:
1. Try with Phi-3-mini-4k (known good ONNX-web path from Microsoft)
2. Try with Qwen2.5-3B (good ONNX community support)
3. Use the base SmolLM3-3B-ONNX with domain-specific system prompts (no fine-tune, just prompt engineering)

Document which path worked and why.

## Output
```
fine-tuning/models/
├── contracts/
│   ├── adapter/         # LoRA adapters
│   ├── merged/          # Full 16-bit PyTorch
│   ├── onnx/            # ONNX (full precision)
│   └── webgpu/          # Quantized 4-bit for browser
│       ├── onnx/
│       │   ├── model_q4f16.onnx
│       │   └── model_q4f16.onnx_data
│       ├── config.json
│       ├── tokenizer.json
│       └── tokenizer_config.json
├── medical/
├── financial/
└── legal/
```

## Acceptance Criteria
- [ ] All 4 domain models export to ONNX without errors
- [ ] Quantized models are < 2GB each
- [ ] All 4 models load in Chrome with WebGPU
- [ ] Inference produces domain-appropriate structured output
- [ ] No OOM on a device with 8GB VRAM
- [ ] Token generation speed > 5 tok/s on discrete GPU
- [ ] Models uploaded to HuggingFace Hub
- [ ] Model cards document usage and benchmarks
