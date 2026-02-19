# Plan: Testing & QA

## Goal
Comprehensive testing strategy covering unit tests, integration tests, model quality tests, and cross-browser compatibility across all monorepo packages.

## Scope
Every package has its own test suite. Turbo runs them in parallel.

## Tasks

### 1. Set up test infrastructure per package
Each package already has vitest configured (Plan 01). Add shared test utilities:

`packages/ai-engine/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'] },
  },
});
```

`apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'] },
  },
});
```

### 2. Unit tests for `packages/ai-engine`
```
packages/ai-engine/src/__tests__/
├── vector-store.test.ts       # CRUD, cosine similarity, top-K, threshold
├── context-manager.test.ts    # Fitting, truncation, page selection
├── rag-pipeline.test.ts       # Retrieval, context construction, citation
├── gpu-monitor.test.ts        # Mock navigator.gpu, all detection paths
├── model-manager.test.ts      # State transitions, error handling
└── prompt-templates.test.ts   # Prompt construction, variable injection
```

### 3. Unit tests for `packages/document-parser`
```
packages/document-parser/src/__tests__/
├── chunker.test.ts            # Size limits, overlap, sentence boundaries
├── document-parser.test.ts    # File type detection, error handling
└── pdf-parser.test.ts         # Text extraction (mock PDF.js)
```

### 4. Component tests for `apps/web`
```
apps/web/src/components/__tests__/
├── DocumentUploader.test.tsx  # Drag-drop, file validation
├── ChatInterface.test.tsx     # Message sending, streaming display
├── MessageBubble.test.tsx     # Markdown rendering, citations
├── ModelLoader.test.tsx       # Progress, error states
├── AnalysisPanel.test.tsx     # Domain results display
└── PricingPage.test.tsx       # Tier display, CTA clicks
```

### 5. Integration tests (`apps/web/src/__tests__/`)
Full user flows with mocked inference:
- Upload PDF → parse → display → chat
- Upload → chunk → embed → RAG query → cited answer
- Free user hits limit → upgrade prompt
- Model download → cache → offline usage

### 6. Model quality tests (golden tests)
```
fine-tuning/golden_tests/
├── contracts/        # 50 hand-verified examples
├── medical/
├── financial/
├── legal/
└── run_golden_tests.py
```

Separate from Turbo pipeline. Run manually or in a dedicated GPU CI job.

### 7. Cross-browser testing matrix
| Browser | WebGPU | WASM | PDF Parse | OCR | Export |
|---------|--------|------|-----------|-----|--------|
| Chrome 120+ (Windows) | | | | | |
| Chrome 120+ (macOS) | | | | | |
| Edge 120+ (Windows) | | | | | |
| Safari 26+ (macOS) | | | | | |
| Firefox 141+ | | | | | |
| Chrome Android | | | | | |
| Safari iOS | | | | | |

### 8. Performance regression tests
Track: model load, TTFT, tok/s, PDF parse, embedding, RAG total time. Fail CI if thresholds exceeded.

### 9. Accessibility testing
axe-core on all views. WCAG 2.1 AA compliance. Keyboard navigation. Screen reader support.

### 10. Turbo test commands
Root `package.json`:
```json
{
  "test": "turbo test",
  "test:coverage": "turbo test:coverage",
  "test:watch": "turbo test -- --watch"
}
```

Run specific package: `pnpm test --filter=@docintel/ai-engine`

## Acceptance Criteria
- [ ] >80% coverage on `packages/ai-engine` and `packages/document-parser`
- [ ] All component tests pass in `apps/web`
- [ ] Golden tests pass at >85% accuracy per domain
- [ ] Cross-browser matrix: no critical failures on Chrome/Edge
- [ ] Performance baselines established
- [ ] Accessibility: 0 critical, <5 moderate issues
- [ ] `pnpm test` runs all packages via Turbo
