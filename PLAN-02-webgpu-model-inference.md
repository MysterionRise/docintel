# Plan: WebGPU Model Loading & Inference Engine

## Goal
Load SmolLM3-3B-ONNX (q4f16) in a Web Worker with WebGPU acceleration, implement streaming text generation, model caching via Cache API, and graceful WASM fallback.

## Package
`packages/ai-engine`

## Dependencies
- Plan 01 (Project Scaffolding) must be complete

## Tasks

### 1. Build GPU capability detector (`packages/ai-engine/src/gpu-monitor.ts`)
Detect WebGPU support, estimate available VRAM, and determine the best execution strategy:
```typescript
export interface DeviceCapability {
  hasWebGPU: boolean;
  hasFp16: boolean;
  adapterInfo: GPUAdapterInfo | null;
  estimatedVRAM: 'high' | 'medium' | 'low' | 'unknown'; // >8GB, 4-8GB, <4GB
  recommendedModel: string;
  recommendedDtype: string;
  recommendedDevice: 'webgpu' | 'wasm';
}

export async function detectCapabilities(): Promise<DeviceCapability>
```

Key logic:
- Check `navigator.gpu` exists
- Request adapter, check `adapter.features.has('shader-f16')`
- Read `adapter.limits.maxBufferSize` to estimate VRAM tier
- Map to model recommendation:
  - High VRAM: SmolLM3-3B q4f16 on WebGPU
  - Medium VRAM: SmolLM3-3B q4f16 on WebGPU (with shorter context limit)
  - Low VRAM: Qwen2.5-0.5B q4 on WebGPU, or SmolLM3-3B q8 on WASM
  - No WebGPU: SmolLM3-3B q8 on WASM

### 2. Build model manager (`packages/ai-engine/src/model-manager.ts`)
Singleton that handles model lifecycle:
```typescript
export interface ModelLoadOptions {
  modelId: string;
  dtype: string;
  device: 'webgpu' | 'wasm';
  onProgress?: (progress: ModelProgress) => void;
}

export interface ModelManager {
  loadModel(options: ModelLoadOptions): Promise<void>;
  generate(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string>;
  isLoaded(): boolean;
  unloadModel(): Promise<void>;
  getStatus(): ModelStatus;
}
```

Model IDs and configs in `packages/ai-engine/src/constants.ts`:
```typescript
export const MODELS = {
  SMOLLM3_3B: {
    id: 'HuggingFaceTB/SmolLM3-3B-ONNX',
    dtype: 'q4f16',
    sizeBytes: 1_900_000_000,
    contextLength: 4096,
    maxContextLength: 65536,
    label: 'SmolLM3 3B (Recommended)',
  },
  QWEN_05B: {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q4',
    sizeBytes: 400_000_000,
    contextLength: 2048,
    maxContextLength: 4096,
    label: 'Qwen 0.5B (Lite - for low-end devices)',
  },
} as const;
```

### 3. Build inference Web Worker (`packages/ai-engine/src/workers/inference.worker.ts`)
This is the core of the system. The worker:
- Receives messages from main thread: `load-model`, `generate`, `abort`, `unload`
- Posts messages back: `model-progress`, `model-ready`, `model-error`, `token`, `generation-done`

```typescript
// Message protocol (export from packages/ai-engine/src/types.ts)
export type InferenceWorkerInMessage =
  | { type: 'load-model'; modelId: string; dtype: string; device: string }
  | { type: 'generate'; messages: Array<{role: string; content: string}>; maxTokens: number; temperature?: number }
  | { type: 'abort' }
  | { type: 'unload' };

export type InferenceWorkerOutMessage =
  | { type: 'model-progress'; progress: number; status: string; loaded: number; total: number }
  | { type: 'model-ready'; modelId: string; loadTimeMs: number }
  | { type: 'model-error'; error: string }
  | { type: 'token'; text: string }
  | { type: 'generation-done'; fullText: string; tokensGenerated: number; tokensPerSecond: number };
```

Implementation inside worker:
```typescript
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator: any = null;
let isGenerating = false;

self.onmessage = async (e: MessageEvent<InferenceWorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'load-model') {
    try {
      generator = await pipeline('text-generation', msg.modelId, {
        dtype: msg.dtype,
        device: msg.device,
        progress_callback: (progress: any) => {
          self.postMessage({
            type: 'model-progress',
            progress: progress.progress ?? 0,
            status: progress.status ?? 'loading',
            loaded: progress.loaded ?? 0,
            total: progress.total ?? 0,
          });
        },
      });
      self.postMessage({ type: 'model-ready', modelId: msg.modelId, loadTimeMs: 0 });
    } catch (err: any) {
      self.postMessage({ type: 'model-error', error: err.message });
    }
  }

  if (msg.type === 'generate' && generator) {
    isGenerating = true;
    const startTime = performance.now();
    let tokenCount = 0;
    let fullText = '';

    try {
      const output = await generator(msg.messages, {
        max_new_tokens: msg.maxTokens || 1024,
        do_sample: true,
        temperature: msg.temperature ?? 0.3,
        top_p: 0.9,
        callback_function: (beams: any) => {
          const text = beams[0]?.generated_text?.at(-1)?.content;
          if (text && text !== fullText) {
            const newToken = text.slice(fullText.length);
            fullText = text;
            tokenCount++;
            self.postMessage({ type: 'token', text: newToken });
          }
        },
      });

      const elapsed = (performance.now() - startTime) / 1000;
      self.postMessage({
        type: 'generation-done',
        fullText,
        tokensGenerated: tokenCount,
        tokensPerSecond: tokenCount / elapsed,
      });
    } catch (err: any) {
      self.postMessage({ type: 'model-error', error: err.message });
    }
    isGenerating = false;
  }

  if (msg.type === 'abort') {
    isGenerating = false;
  }
};
```

### 4. Export public API from ai-engine (`packages/ai-engine/src/index.ts`)
```typescript
// Types
export type { DeviceCapability, ModelStatus, ChatMessage, GenerateOptions } from './types';
export type { InferenceWorkerInMessage, InferenceWorkerOutMessage } from './types';

// Classes & functions
export { detectCapabilities } from './gpu-monitor';
export { ModelManager } from './model-manager';
export { MODELS, EMBEDDING_MODELS } from './constants';

// Worker paths (for apps/web to instantiate)
// Workers are bundled by Vite when imported with ?worker
```

### 5. Build React hooks in web app (`apps/web/src/hooks/useModel.ts`)
```typescript
import { MODELS, type ModelStatus, type DeviceCapability } from '@docintel/ai-engine';

// Manages the inference worker lifecycle
// Returns: { loadModel, status, progress, error, capability }
// Internally creates and manages the Web Worker from @docintel/ai-engine
```

`apps/web/src/hooks/useInference.ts`:
```typescript
// Uses the loaded model to generate text
// Returns: { generate, streamingText, isGenerating, abort, stats }
// Handles streaming token accumulation and abort
```

### 6. Build ModelLoader UI component (`apps/web/src/components/model/ModelLoader.tsx`)
Visual component showing:
- Device capability detection results
- Model download progress (percentage, MB downloaded, estimated time)
- Cache status (already downloaded or new download)
- "Download Model" button with size warning
- Error states with troubleshooting tips
- Small info badge showing "Running on WebGPU" or "Running on CPU (WASM)"

### 7. Build model status indicator (`apps/web/src/components/model/ModelBadge.tsx`)
Small persistent badge in the header showing:
- Model name and size
- WebGPU/WASM indicator
- Tokens/second from last generation
- Memory usage estimate

### 8. Implement model caching strategy
Transformers.js v3 uses the browser Cache API by default (`env.useBrowserCache = true`).
Verify that:
- After first download, subsequent loads are instant (< 3s)
- Cache persists across browser restarts
- Add a "Clear model cache" button in settings
- Show cache size in settings

### 9. Build a minimal test page (`apps/web/src/components/model/ModelTestPage.tsx`)
Temporary dev-only route that:
1. Shows GPU detection results
2. Has a "Load Model" button
3. Has a text input for a prompt
4. Shows streaming generation output
5. Displays tokens/second

This validates the entire inference pipeline end-to-end before building real UI.

### 10. Write unit tests (`packages/ai-engine/src/__tests__/`)
- `gpu-monitor.test.ts`: Mock navigator.gpu, test all detection paths
- `model-manager.test.ts`: Mock worker, test state transitions
- `constants.test.ts`: Validate model configs have required fields

## Acceptance Criteria
- [ ] GPU detection correctly identifies WebGPU support and VRAM tier
- [ ] SmolLM3-3B loads in Web Worker with progress reporting
- [ ] Model is cached after first download (second load < 5s)
- [ ] WASM fallback works when WebGPU is unavailable
- [ ] Streaming text generation works at >5 tok/s (WebGPU) or >1 tok/s (WASM)
- [ ] Generation can be aborted mid-stream
- [ ] Main thread UI remains responsive during model loading and inference
- [ ] OOM errors are caught gracefully with user-friendly message
- [ ] `packages/ai-engine` exports clean public API consumed by `apps/web`
- [ ] Unit tests pass in `packages/ai-engine`
