# DocIntel — Claude Code Implementation Plans (v2 — Turborepo + pnpm)

## Overview
18 implementation plans for building DocIntel, a browser-based on-device document intelligence PWA. Each plan is designed to be fed directly to Claude Code as a task specification.

## Monorepo Structure
```
docintel/
├── apps/
│   └── web/                        # Main PWA (React + Vite)
├── packages/
│   ├── ai-engine/                  # Model loading, inference, RAG, vector store
│   ├── document-parser/            # PDF.js, Tesseract OCR, smart chunking
│   └── tsconfig/                   # Shared TypeScript configs
├── services/
│   └── billing-worker/             # Cloudflare Worker (Stripe + auth)
├── fine-tuning/                    # Python (outside Turbo pipeline)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## How to Use with Claude Code
```bash
cd docintel

# Implement an entire plan
claude "Read the plan at plans/PLAN-01-project-scaffolding.md and implement it fully"

# Implement a specific task within a plan
claude "Read plans/PLAN-02-webgpu-model-inference.md and implement Task 3 (inference Web Worker) in packages/ai-engine/src/workers/inference.worker.ts"

# Chain plans
claude "I've completed Plan 01. Now read plans/PLAN-02-webgpu-model-inference.md and implement it"
```

## Package → Plan Mapping
| Package | Relevant Plans |
|---------|---------------|
| `apps/web` | 01, 04, 10, 11, 12, 14 |
| `packages/ai-engine` | 02, 05, 06 |
| `packages/document-parser` | 03 |
| `services/billing-worker` | 13 |
| `fine-tuning/` | 07, 08, 09 |
| Root / cross-cutting | 15, 16, 17, 18 |

## Plans by Phase

### Phase 1: Foundation (Weeks 1-4)
| # | Plan | Description | Depends On | Effort |
|---|------|-------------|------------|--------|
| 01 | [Project Scaffolding](PLAN-01-project-scaffolding.md) | Turborepo + pnpm monorepo, all packages | — | 1-2 days |
| 02 | [WebGPU Model Inference](PLAN-02-webgpu-model-inference.md) | SmolLM3-3B in Web Worker, streaming, WASM fallback | 01 | 3-5 days |
| 03 | [PDF Parsing & Document Intake](PLAN-03-pdf-parsing-document-intake.md) | PDF.js, Tesseract OCR, drag-drop upload | 01 | 3-4 days |
| 04 | [Single-Doc Q&A Chat](PLAN-04-single-doc-qa-chat.md) | Chat UI, prompt templates, streaming | 02, 03 | 3-5 days |

### Phase 2: RAG Pipeline (Weeks 5-8)
| # | Plan | Description | Depends On | Effort |
|---|------|-------------|------------|--------|
| 05 | [Embedding & Vector Store](PLAN-05-embedding-vector-store.md) | Embedding worker, chunking, IndexedDB vectors | 01, 03 | 4-5 days |
| 06 | [RAG Pipeline](PLAN-06-rag-pipeline.md) | Retrieval, citation, multi-doc, multi-turn | 04, 05 | 5-7 days |

### Phase 3: Fine-Tuning (Weeks 9-14)
| # | Plan | Description | Depends On | Effort |
|---|------|-------------|------------|--------|
| 07 | [Dataset Curation](PLAN-07-dataset-curation.md) | Training data for 4 domains | — | 5-7 days |
| 08 | [Fine-Tuning (Unsloth)](PLAN-08-fine-tuning-unsloth.md) | QLoRA training, 4 domain models | 07 | 3-5 days |
| 09 | [ONNX Export & Quantization](PLAN-09-onnx-export-quantization.md) | PyTorch → ONNX → 4-bit WebGPU | 08 | 3-5 days |

### Phase 4: Domain UIs (Weeks 15-20)
| # | Plan | Description | Depends On | Effort |
|---|------|-------------|------------|--------|
| 10 | [Contract Analyzer UI](PLAN-10-contract-analyzer-ui.md) | Risk analysis, obligations, comparison | 06, 09 | 5-7 days |
| 11 | [Medical + Financial + Legal UIs](PLAN-11-medical-financial-legal-uis.md) | 3 remaining domain interfaces | 10 | 10-14 days |

### Phase 5: Launch (Weeks 21-24)
| # | Plan | Description | Depends On | Effort |
|---|------|-------------|------------|--------|
| 12 | [PWA & Offline](PLAN-12-pwa-offline.md) | Install, offline, caching, settings | 06 | 3-4 days |
| 13 | [Monetization & Auth](PLAN-13-monetization-auth.md) | Stripe, freemium gating, license JWT | 11 | 5-7 days |
| 14 | [Landing Page & Launch](PLAN-14-landing-page-launch.md) | Marketing site, demo, launch prep | 12, 13 | 3-5 days |

### Cross-Cutting (Ongoing)
| # | Plan | Description | Start After | Effort |
|---|------|-------------|-------------|--------|
| 15 | [Testing & QA](PLAN-15-testing-qa.md) | Unit, integration, golden, browser tests | 01 | Ongoing |
| 16 | [CI/CD & Deployment](PLAN-16-cicd-deployment.md) | GitHub Actions, Turbo cache, Cloudflare | 01 | 1-2 days + maint |
| 17 | [Performance Benchmarking](PLAN-17-performance-benchmarking.md) | Benchmarks, targets, device matrix | 04 | 2-3 days + ongoing |
| 18 | [Security & Privacy Audit](PLAN-18-security-privacy-audit.md) | Network audit, CSP, GDPR | 06 | 2-3 days |

## Dependency Graph
```
01 ──┬── 02 ──┐
     │        ├── 04 ──┐
     ├── 03 ──┤        │
     │        ├── 05 ──┼── 06 ──┬── 10 ──── 11
     │        │        │        ├── 12
     │        │        │        └── 18
     └── 16   │        │
              │        └── 17
07 ── 08 ── 09 ──────────────────┘
                          11 ──── 13 ──── 14
                          15 (ongoing from 01)
```

## Parallel Execution (2-3 Devs)

**Sprint 1 (Week 1-2)**:
- Person A: Plan 01 → Plan 02 (in `packages/ai-engine`)
- Person B: Plan 01 → Plan 03 (in `packages/document-parser`)
- Person C: Plan 16 (CI/CD at root)

**Sprint 2 (Week 3-4)**:
- Person A: Plan 04 (in `apps/web`, needs 02+03)
- Person B: Plan 05 (in `packages/ai-engine`)
- Person C: Plan 15 (testing across all packages)

**Sprint 3 (Week 5-8)**:
- Person A: Plan 06 (in `packages/ai-engine` + `apps/web`)
- Person B: Plan 07 (dataset curation in `fine-tuning/`)
- Person C: Plan 17 (benchmarking)

**Sprint 4 (Week 9-14)**:
- Person A: Plan 08 → 09 (fine-tuning in `fine-tuning/`)
- Person B: Plan 10 (contract UI in `apps/web`)
- Person C: Plan 12 (PWA polish in `apps/web`)

**Sprint 5 (Week 15-20)**:
- Person A: Plan 11 (remaining domain UIs in `apps/web`)
- Person B: Plan 13 (monetization: `apps/web` + `services/billing-worker`)
- Person C: Plan 18 (security audit)

**Sprint 6 (Week 21-24)**:
- All: Plan 14 (launch) + final polish + bugs

## Quick Start (Fastest Path to Demo)
```
Plan 01 → Plan 02 → Plan 03 → Plan 04
```
Result: Upload PDF → Ask questions → Get streaming AI answers on-device.
Time: ~2 weeks for 1 developer.

## Key Turbo Commands
```bash
pnpm dev                             # Start all apps
pnpm dev --filter=@docintel/web      # Start web app only
pnpm build                           # Build everything
pnpm build --filter=@docintel/web... # Build web + its dependencies
pnpm test                            # Test everything
pnpm test --filter=@docintel/ai-engine  # Test ai-engine only
pnpm turbo build --dry               # See what turbo would build
```
