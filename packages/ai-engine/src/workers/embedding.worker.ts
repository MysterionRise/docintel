import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

// --- Typed message protocol ---

export type EmbeddingWorkerInMessage =
  | { type: 'load-model'; modelId: string; device: string; dtype: string }
  | { type: 'embed-texts'; texts: string[]; batchId?: string }
  | { type: 'embed-query'; query: string }
  | { type: 'unload' };

export type EmbeddingWorkerOutMessage =
  | { type: 'model-progress'; progress: number; status: string; loaded: number; total: number; file: string }
  | { type: 'model-ready'; modelId: string; loadTimeMs: number }
  | { type: 'model-error'; error: string }
  | { type: 'status'; status: 'idle' | 'loading' | 'ready' | 'embedding' | 'error' }
  | { type: 'embeddings'; vectors: number[][]; batchId?: string }
  | { type: 'query-embedding'; embedding: number[] }
  | { type: 'embed-progress'; completed: number; total: number; batchId?: string }
  | { type: 'error'; error: string };

// --- Worker state ---

let embedder: FeatureExtractionPipeline | null = null;
let currentModelId: string | null = null;

const BATCH_SIZE = 8;

// --- Message handler ---

self.onmessage = async (e: MessageEvent<EmbeddingWorkerInMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'load-model':
      await loadModel(msg.modelId, msg.device, msg.dtype);
      break;
    case 'embed-texts':
      await embedTexts(msg.texts, msg.batchId);
      break;
    case 'embed-query':
      await embedQuery(msg.query);
      break;
    case 'unload':
      embedder = null;
      currentModelId = null;
      post({ type: 'status', status: 'idle' });
      break;
  }
};

function post(msg: EmbeddingWorkerOutMessage) {
  self.postMessage(msg);
}

async function loadModel(modelId: string, device: string, dtype: string) {
  // Skip if same model already loaded
  if (embedder && currentModelId === modelId) {
    post({ type: 'model-ready', modelId, loadTimeMs: 0 });
    return;
  }

  // Unload previous
  embedder = null;
  currentModelId = null;

  post({ type: 'status', status: 'loading' });
  const startTime = performance.now();

  try {
    embedder = await (pipeline as Function)('feature-extraction', modelId, {
      dtype,
      device,
      progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
        if (progress.status === 'progress' && progress.loaded != null && progress.total != null) {
          post({
            type: 'model-progress',
            progress: progress.progress ?? (progress.loaded / progress.total) * 100,
            status: progress.status,
            loaded: progress.loaded,
            total: progress.total,
            file: progress.file ?? modelId,
          });
        }
      },
    });

    currentModelId = modelId;
    const loadTimeMs = Math.round(performance.now() - startTime);
    post({ type: 'status', status: 'ready' });
    post({ type: 'model-ready', modelId, loadTimeMs });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Try WASM fallback if WebGPU failed
    if (device === 'webgpu') {
      try {
        embedder = await (pipeline as Function)('feature-extraction', modelId, {
          dtype,
          device: 'wasm',
          progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
            if (progress.status === 'progress' && progress.loaded != null && progress.total != null) {
              post({
                type: 'model-progress',
                progress: progress.progress ?? (progress.loaded / progress.total) * 100,
                status: progress.status,
                loaded: progress.loaded,
                total: progress.total,
                file: progress.file ?? modelId,
              });
            }
          },
        });

        currentModelId = modelId;
        const loadTimeMs = Math.round(performance.now() - startTime);
        post({ type: 'status', status: 'ready' });
        post({ type: 'model-ready', modelId, loadTimeMs });
        return;
      } catch (wasmErr: unknown) {
        const wasmErrorMsg = wasmErr instanceof Error ? wasmErr.message : String(wasmErr);
        post({ type: 'status', status: 'error' });
        post({ type: 'model-error', error: `WebGPU failed: ${errorMsg}. WASM fallback also failed: ${wasmErrorMsg}` });
        return;
      }
    }

    post({ type: 'status', status: 'error' });
    post({ type: 'model-error', error: errorMsg });
  }
}

async function embedTexts(texts: string[], batchId?: string) {
  if (!embedder) {
    post({ type: 'error', error: 'Embedding model not loaded' });
    return;
  }

  post({ type: 'status', status: 'embedding' });

  try {
    const allVectors: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const output = await embedder(batch, { pooling: 'mean', normalize: true });

      for (let j = 0; j < batch.length; j++) {
        allVectors.push(Array.from((output as any)[j].data as Float32Array));
      }

      post({
        type: 'embed-progress',
        completed: Math.min(i + BATCH_SIZE, texts.length),
        total: texts.length,
        batchId,
      });
    }

    post({ type: 'embeddings', vectors: allVectors, batchId });
    post({ type: 'status', status: 'ready' });
  } catch (err: unknown) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    post({ type: 'status', status: 'ready' });
  }
}

async function embedQuery(query: string) {
  if (!embedder) {
    post({ type: 'error', error: 'Embedding model not loaded' });
    return;
  }

  try {
    const output = await embedder([query], { pooling: 'mean', normalize: true });
    const embedding = Array.from((output as any)[0].data as Float32Array);
    post({ type: 'query-embedding', embedding });
  } catch (err: unknown) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
