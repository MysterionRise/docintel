# Plan: Dataset Curation for Fine-Tuning

## Goal
Curate, clean, and format training datasets for each of the 4 document domains. Each dataset should be in ShareGPT/ChatML format ready for Unsloth QLoRA training.

## Prerequisites
- Python 3.10+, CUDA-capable GPU for validation
- HuggingFace account with API token

## Tasks

### 1. Set up fine-tuning environment
```bash
cd fine-tuning/
python -m venv .venv
source .venv/bin/activate
pip install unsloth datasets huggingface-hub pandas tqdm
```

Create `fine-tuning/requirements.txt`:
```
unsloth[colab-new]
datasets>=3.4.1
huggingface-hub
hf_transfer
pandas
tqdm
scikit-learn
```

### 2. Define universal output schema (`fine-tuning/schemas/`)
Each domain needs a consistent JSON output schema that the fine-tuned model will produce.

`schemas/contract_schema.json`:
```json
{
  "document_type": "NDA | MSA | SaaS | Employment | Lease | Other",
  "parties": [{ "name": "", "role": "party_a | party_b | third_party" }],
  "effective_date": "",
  "expiration_date": "",
  "key_clauses": [{
    "clause_type": "limitation_of_liability | indemnification | termination | non_compete | confidentiality | ip_ownership | governing_law | dispute_resolution | payment_terms | auto_renewal",
    "text": "",
    "page": 0,
    "risk_level": "high | medium | low",
    "risk_reason": ""
  }],
  "obligations": [{ "party": "", "obligation": "", "deadline": "" }],
  "summary": ""
}
```

`schemas/medical_schema.json`:
```json
{
  "document_type": "discharge_summary | lab_report | prescription | referral | progress_note",
  "patient_info": { "age": "", "sex": "" },
  "diagnoses": [{ "name": "", "icd10": "", "status": "active | resolved | suspected" }],
  "medications": [{ "name": "", "dose": "", "frequency": "", "route": "" }],
  "procedures": [{ "name": "", "date": "", "findings": "" }],
  "lab_results": [{ "test": "", "value": "", "unit": "", "flag": "normal | high | low | critical" }],
  "follow_up": [{ "action": "", "timeframe": "", "provider": "" }],
  "summary": ""
}
```

`schemas/financial_schema.json`:
```json
{
  "document_type": "invoice | bank_statement | tax_form | financial_statement | receipt",
  "issuer": "",
  "recipient": "",
  "date": "",
  "line_items": [{ "description": "", "quantity": 0, "unit_price": 0, "total": 0 }],
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "currency": "",
  "account_numbers": [],
  "tax_ids": [],
  "payment_terms": "",
  "due_date": ""
}
```

`schemas/legal_schema.json`:
```json
{
  "document_type": "complaint | motion | brief | opinion | contract | correspondence | memo",
  "relevance": { "score": 0.0, "categories": [], "reasoning": "" },
  "privilege": { "type": "none | attorney_client | work_product | joint_defense", "reasoning": "" },
  "key_entities": [{ "name": "", "type": "person | organization | court | statute", "role": "" }],
  "dates": [{ "date": "", "event": "" }],
  "summary": ""
}
```

### 3. Curate contract analysis dataset
Source: CUAD (Contract Understanding Atticus Dataset)

```python
# fine-tuning/scripts/prepare_contracts.py
from datasets import load_dataset

# Load CUAD
cuad = load_dataset("theatticusproject/cuad-qa", split="train")

# Transform into our training format
# CUAD has: context (clause text), question, answers
# We need: document_chunk → structured extraction

def cuad_to_training_example(row):
    """Convert CUAD QA format to our structured extraction format."""
    return {
        "conversations": [
            {
                "role": "system",
                "content": "You are DocIntel, a contract analysis AI. Extract structured information from contract clauses. Return valid JSON matching the provided schema."
            },
            {
                "role": "user",
                "content": f"Analyze this contract clause and extract key information:\n\n{row['context']}\n\nReturn JSON with: clause_type, risk_level (high/medium/low), risk_reason, parties, obligations, and key_dates."
            },
            {
                "role": "assistant",
                "content": generate_structured_output(row)  # Build from CUAD annotations
            }
        ]
    }
```

Target: 5,000-8,000 training examples covering:
- Clause identification (indemnification, limitation of liability, termination, etc.)
- Risk assessment (high/medium/low with reasoning)
- Obligation extraction
- Date and deadline extraction
- Party identification

### 4. Curate medical summarization dataset
Source: MTSamples + synthetic generation

```python
# fine-tuning/scripts/prepare_medical.py
# MTSamples is publicly available medical transcription samples
# Supplement with synthetically generated examples using a larger model

# Target format:
{
    "conversations": [
        {"role": "system", "content": "You are DocIntel, a medical document summarizer..."},
        {"role": "user", "content": "Summarize this clinical note and extract structured data:\n\n{note_text}\n\nReturn JSON with: diagnoses, medications, procedures, lab_results, follow_up, and summary."},
        {"role": "assistant", "content": "{structured_json}"}
    ]
}
```

Target: 5,000 examples from:
- MTSamples (~5,000 medical transcriptions across specialties)
- Synthetic discharge summaries (generated with Claude/GPT-4, human-validated)
- Publicly available medical case studies

### 5. Curate financial extraction dataset
Source: Synthetic invoices + SEC filings

```python
# fine-tuning/scripts/prepare_financial.py
# Generate synthetic invoices with randomized but realistic data
# Also use SEC EDGAR for financial statement extraction

import random
from faker import Faker

fake = Faker()

def generate_synthetic_invoice():
    """Generate a realistic invoice text + structured extraction."""
    items = [
        {"description": fake.bs(), "quantity": random.randint(1, 100),
         "unit_price": round(random.uniform(10, 5000), 2)}
        for _ in range(random.randint(2, 10))
    ]
    # ... generate text representation and structured JSON pair
```

Target: 8,000 examples:
- 3,000 synthetic invoices (varying formats, languages)
- 2,000 bank statement extractions
- 2,000 SEC filing extractions (10-K summary, revenue tables)
- 1,000 tax form extractions

### 6. Curate legal discovery dataset
Source: CASEHOLD + synthetic

```python
# fine-tuning/scripts/prepare_legal.py
from datasets import load_dataset

casehold = load_dataset("casehold/casehold", split="train")

# Transform into relevance classification + entity extraction format
```

Target: 5,000 examples:
- Relevance scoring (0-1 on case issues)
- Privilege classification (attorney-client, work product, none)
- Key entity extraction
- Document categorization

### 7. Data validation and quality checks
Create `fine-tuning/scripts/validate_dataset.py`:
- Check all examples parse as valid JSON
- Verify schema compliance
- Check for empty/null fields
- Ensure balanced distribution across categories
- Remove duplicates
- Check token length distribution (remove outliers > 4096 tokens)
- Train/validation/test split (80/10/10)

### 8. Upload datasets to HuggingFace Hub
```bash
# Upload each dataset
python -c "
from datasets import Dataset
import json

data = json.load(open('datasets/contracts/train.json'))
ds = Dataset.from_list(data)
ds.push_to_hub('your-org/docintel-contracts-train')
"
```

### 9. Create dataset cards
Each dataset gets a README.md on HuggingFace with:
- Description and intended use
- Data sources and licensing
- Statistics (size, token distribution, category distribution)
- Example entries
- Known limitations

## Output Structure
```
fine-tuning/
├── schemas/
│   ├── contract_schema.json
│   ├── medical_schema.json
│   ├── financial_schema.json
│   └── legal_schema.json
├── datasets/
│   ├── contracts/
│   │   ├── train.json      # 80%
│   │   ├── validation.json  # 10%
│   │   └── test.json        # 10%
│   ├── medical/
│   ├── financial/
│   └── legal/
├── scripts/
│   ├── prepare_contracts.py
│   ├── prepare_medical.py
│   ├── prepare_financial.py
│   ├── prepare_legal.py
│   └── validate_dataset.py
└── requirements.txt
```

## Acceptance Criteria
- [ ] Each domain has 5,000+ training examples
- [ ] All examples are valid JSON and schema-compliant
- [ ] Datasets are balanced across categories
- [ ] Train/validation/test splits exist
- [ ] No PII in publicly shared datasets
- [ ] Datasets uploaded to HuggingFace Hub
- [ ] Dataset cards document sources and limitations
