# DocIntel - Document Intelligence Platform

## Project Overview
DocIntel is a browser-native document intelligence platform that uses WebGPU-accelerated LLMs and embedding models to analyze PDFs across 4 domains: contracts, medical, financial, and legal. All AI inference runs locally in the browser via Web Workers.

## Architecture
- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: `apps/web` — React + Vite + TailwindCSS + Zustand
- **AI Engine**: `packages/ai-engine` — RAG pipeline, embedding, inference workers, vector store
- **Document Parser**: `packages/document-parser` — PDF parsing, chunking (pdfjs-dist)
- **Fine-Tuning**: `fine-tuning/` — Python (Unsloth QLoRA), dataset curation, ONNX export
- **Shared Config**: `packages/tsconfig`

## Key Patterns
- **Source-level resolution**: Internal packages are imported as TypeScript source (no build step); Vite resolves them directly
- **Web Workers**: Inference and embedding run in separate workers with typed message protocols (`InferenceWorkerInMessage`/`OutMessage`, `EmbeddingWorkerInMessage`/`OutMessage`)
- **StorageAdapter**: `packages/ai-engine` uses a `StorageAdapter` interface to decouple from Dexie IndexedDB (defined in `apps/web/src/lib/db.ts`)
- **Zustand stores**: `useModelStore`, `useInferenceStore`, `useEmbeddingStore`, `useDocumentStore` in `apps/web/src/stores/`
- **RAG pipeline**: query embedding → cosine similarity vector search → context construction → prompt building → LLM generation
- **ShareGPT/ChatML format**: Fine-tuning datasets use `{"conversations": [{"role": "...", "content": "..."}]}` format

## Commands
- **Build**: `pnpm turbo build` (from root)
- **Dev**: `pnpm --filter @docintel/web dev`
- **Test**: `pnpm --filter @docintel/ai-engine test` / `pnpm --filter @docintel/document-parser test`
- **Lint**: `pnpm turbo lint`
- **Python (fine-tuning)**: `cd fine-tuning && pip install -e .`

## Completed Plans
- PLAN-01: Turborepo monorepo migration
- PLAN-02: WebGPU model loading & inference engine
- PLAN-03: PDF parsing & document intake pipeline
- PLAN-04: Single-document Q&A chat interface
- PLAN-05: Embedding engine & vector store
- PLAN-06: RAG pipeline integration

## Current Branch
`feat/webgpu-inference` — all PLAN-01 through PLAN-06 work

## Domain Schemas (for fine-tuning datasets)
Each domain has a JSON output schema the fine-tuned model should produce:
- **Contracts**: document_type, parties, dates, key_clauses (with risk_level), obligations, summary
- **Medical**: document_type, patient_info, diagnoses (ICD-10), medications, procedures, lab_results, follow_up, summary
- **Financial**: document_type, issuer/recipient, line_items, totals, tax, account_numbers, payment_terms
- **Legal**: document_type, relevance scoring, privilege classification, key_entities, dates, summary

## Fine-Tuning Data Format
Training data lives in `fine-tuning/datasets/<domain>/` as JSON files with train/validation/test splits. Each example:
```json
{
  "conversations": [
    {"role": "system", "content": "You are DocIntel, a <domain> analysis AI..."},
    {"role": "user", "content": "Analyze this document...\n\n<text>"},
    {"role": "assistant", "content": "<structured JSON output>"}
  ]
}
```

## Important Notes
- TypeScript strict mode is on; unused variables/imports cause build failures
- Tests use vitest (workspace root devDependency)
- Python code follows ruff linting (line-length=100, py310 target)
- Never commit API keys, HuggingFace tokens, or PII to the repo
