# DocIntel - Document Intelligence Platform

## Project Overview
DocIntel is a browser-native document intelligence platform that uses WebGPU-accelerated LLMs and embedding models to analyze PDFs across 4 domains: contracts, medical, financial, and legal. All AI inference runs locally in the browser via Web Workers.

## Architecture
- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: `apps/web` — React + Vite + TailwindCSS + Zustand
- **AI Engine**: `packages/ai-engine` — RAG pipeline, embedding, inference workers, vector store, model manager, context manager, GPU monitor
- **Document Parser**: `packages/document-parser` — PDF parsing, OCR, chunking (pdfjs-dist, tesseract.js)
- **Fine-Tuning**: `fine-tuning/` — Python (Unsloth QLoRA), dataset curation, validation, ONNX export
- **Shared Config**: `packages/tsconfig`
- **Billing Worker**: `services/billing-worker` — Cloudflare Worker stub

## Key Patterns
- **Source-level resolution**: Internal packages are imported as TypeScript source (no build step); Vite resolves them directly
- **Web Workers**: Inference and embedding run in separate workers with typed message protocols (`InferenceWorkerInMessage`/`OutMessage`, `EmbeddingWorkerInMessage`/`OutMessage`)
- **StorageAdapter**: `packages/ai-engine` uses a `StorageAdapter` interface to decouple from Dexie IndexedDB (implemented by `DexieStorageAdapter` in `apps/web/src/lib/dexie-storage.ts`)
- **Zustand stores**: `useModelStore`, `useInferenceStore`, `useEmbeddingStore`, `useDocumentStore`, `useAppStore`, `useLicenseStore` in `apps/web/src/stores/`
- **Custom hooks**: `useModel`, `useInference`, `useEmbedding`, `useRAG`, `useDocumentChat` in `apps/web/src/hooks/`
- **RAG pipeline**: query embedding → cosine similarity vector search → context construction → prompt building → LLM generation
- **ChatML format**: Fine-tuning datasets use `{"messages": [{"role": "...", "content": "..."}]}` format (must match `train_qlora.py`)

## Commands
- **Build**: `pnpm turbo build`
- **Dev**: `pnpm --filter @docintel/web dev`
- **Test**: `pnpm turbo test` (228 tests: 85 ai-engine, 69 document-parser, 74 web)
- **Test single package**: `pnpm --filter @docintel/ai-engine test`
- **Type check**: `pnpm turbo type-check`
- **Lint**: `pnpm turbo lint`
- **Validate datasets**: `python3 fine-tuning/scripts/validate_dataset.py --all`

## CI/CD
GitHub Actions (`.github/workflows/ci.yml`) runs 5 jobs on push/PR to master:
1. **Build** — `pnpm turbo build`
2. **Type Check** — `pnpm turbo type-check` (all packages)
3. **Lint** — `pnpm turbo lint` (all packages)
4. **Test** — `pnpm turbo test` (all packages)
5. **Python Validation** — dataset validation across all 4 domains

## Completed Plans
- PLAN-01: Turborepo monorepo migration
- PLAN-02: WebGPU model loading & inference engine
- PLAN-03: PDF parsing & document intake pipeline
- PLAN-04: Single-document Q&A chat interface
- PLAN-05: Embedding engine & vector store
- PLAN-06: RAG pipeline integration
- PLAN-07: Dataset curation for fine-tuning (4 domains)
- Quality sprint: bug fixes, 228 tests, CI/CD enhancement

## Domain Schemas (for fine-tuning datasets)
JSON schemas live in `fine-tuning/schemas/`. Each domain has a JSON output schema the fine-tuned model should produce:
- **Contracts**: document_type, parties, dates, key_clauses (with risk_level), obligations, summary
- **Medical**: document_type, patient_info, diagnoses (ICD-10), medications, procedures, lab_results, follow_up, summary
- **Financial**: document_type, issuer/recipient, line_items, totals, tax, account_numbers, payment_terms
- **Legal**: document_type, relevance scoring, privilege classification, key_entities, dates, summary

## Fine-Tuning Data Format
Training data lives in `fine-tuning/datasets/<domain>/` as JSON files with train/validation/test splits (80/10/10). Each example:
```json
{
  "messages": [
    {"role": "system", "content": "You are DocIntel, a <domain> analysis AI..."},
    {"role": "user", "content": "Analyze this document...\n\n<text>"},
    {"role": "assistant", "content": "<structured JSON output>"}
  ]
}
```

Dataset preparation scripts: `fine-tuning/scripts/prepare_{contracts,medical,financial,legal}.py`
Shared utilities: `fine-tuning/scripts/shared.py`
Validation: `fine-tuning/scripts/validate_dataset.py --all`

## Important Notes
- TypeScript strict mode is on; unused variables/imports cause build failures
- Tests use vitest (workspace root devDependency); web tests use jsdom environment
- Python requires `>=3.10`; ruff config in `fine-tuning/pyproject.toml` (line-length=100)
- Never commit API keys, HuggingFace tokens, or PII to the repo
- Training data format is ChatML (`"messages"` key), NOT ShareGPT (`"conversations"` key)
