# Plan: Performance Benchmarking

## Goal
Establish baseline performance metrics, build automated benchmarks, and implement monitoring to catch regressions.

## Packages
`packages/ai-engine` (benchmark logic) + `apps/web` (benchmark runner UI)

## Dependencies
- Plan 04 (Single-Doc Q&A) complete

## Tasks

### 1. Build benchmark suite (`packages/ai-engine/src/benchmarks/`)
```typescript
// model-loading.bench.ts
export async function benchmarkModelLoad(modelId: string, device: string): Promise<{
  loadTimeMs: number;
  cached: boolean;
}>;

// inference.bench.ts
export async function benchmarkInference(generator: any, promptTokens: number): Promise<{
  timeToFirstTokenMs: number;
  totalTimeMs: number;
  tokensGenerated: number;
  tokensPerSecond: number;
}>;

// rag.bench.ts
export async function benchmarkRAG(vectorStore: VectorStore, embeddingWorker: Worker): Promise<{
  embedTimeMs: number;
  searchTimeMs: number;
  totalRetrievalMs: number;
}>;
```

### 2. Define performance targets (`packages/ai-engine/src/benchmarks/targets.ts`)
```typescript
export const PERFORMANCE_TARGETS = {
  modelLoadCached: { target: 3000, max: 8000 },       // ms
  timeToFirstToken: { target: 2000, max: 5000 },       // ms
  tokensPerSecondWebGPU: { target: 15, min: 5 },       // tok/s
  tokensPerSecondWASM: { target: 3, min: 1 },          // tok/s
  pdfParsePerPage: { target: 200, max: 1000 },         // ms
  embeddingPerChunk: { target: 100, max: 500 },        // ms
  vectorSearchTopK: { target: 50, max: 200 },          // ms (10K vectors)
  ragEndToEnd: { target: 8000, max: 15000 },           // ms
  appInteractive: { target: 2000, max: 4000 },         // ms
  memoryFootprint: { target: 3_000_000_000, max: 4_000_000_000 },
};
```

### 3. Build benchmark runner page (`apps/web/src/components/settings/BenchmarkRunner.tsx`)
Dev-only interactive page:
- GPU info, model load (cold + warm), inference at various prompt lengths
- Embedding batch, vector search, RAG end-to-end
- Export results as JSON

### 4. Memory profiling (`packages/ai-engine/src/benchmarks/memory-monitor.ts`)
Track JS heap + estimated WebGPU buffers + IndexedDB usage.

### 5. Bundle size analysis
`rollup-plugin-visualizer` in `apps/web/vite.config.ts`. Target: < 500KB app code.

### 6. Lighthouse CI (in `.github/workflows/ci.yml`)
Performance > 90, Accessibility > 90, Best Practices > 90, PWA > 90.

### 7. Device testing matrix
Document: MacBook Pro M2, MacBook Air M1, Dell XPS (Intel Iris), Desktop RTX 3060/4090, ThinkPad AMD iGPU.

## Acceptance Criteria
- [ ] Benchmark suite covers all critical paths
- [ ] Performance targets defined and documented
- [ ] Benchmark runner page works in dev mode
- [ ] Bundle size < 500KB (app code only)
- [ ] Lighthouse > 90 all categories
- [ ] At least 5 devices tested and documented
