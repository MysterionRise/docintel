import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/gte-small';

let embedder: FeatureExtractionPipeline | null = null;

type WorkerMessage =
  | { type: 'load' }
  | { type: 'embed'; texts: string[] };

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  if (type === 'load') {
    await loadModel();
  } else if (type === 'embed') {
    await embed(e.data.texts);
  }
};

async function loadModel() {
  try {
    self.postMessage({ type: 'status', status: 'loading' });
    embedder = await (pipeline as Function)('feature-extraction', MODEL_ID, {
      dtype: 'fp32',
      device: 'webgpu',
      progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (progress.status === 'progress' && progress.loaded != null && progress.total != null) {
          self.postMessage({
            type: 'progress',
            loaded: progress.loaded,
            total: progress.total,
            name: progress.file ?? MODEL_ID,
          });
        }
      },
    });
    self.postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}

async function embed(texts: string[]) {
  if (!embedder) {
    self.postMessage({ type: 'error', error: 'Embedding model not loaded' });
    return;
  }

  try {
    const output = await embedder(texts, { pooling: 'mean', normalize: true });
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      vectors.push(Array.from((output as any)[i].data as Float32Array));
    }
    self.postMessage({ type: 'embeddings', vectors });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}
