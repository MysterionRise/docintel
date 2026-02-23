import { useCallback } from 'react';
import { create } from 'zustand';
import {
  EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_MODEL,
  type EmbeddingModelConfig,
  type EmbeddingWorkerOutMessage,
} from '@docintel/ai-engine';

type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'embedding' | 'error';

interface EmbeddingState {
  status: EmbeddingStatus;
  progress: number;
  loadProgress: { loaded: number; total: number } | null;
  embedProgress: { completed: number; total: number } | null;
  error: string | null;
  activeModelId: string | null;
  loadTimeMs: number | null;
  setStatus: (status: EmbeddingStatus) => void;
  setLoadProgress: (loaded: number, total: number) => void;
  setEmbedProgress: (completed: number, total: number) => void;
  setError: (error: string | null) => void;
  setReady: (modelId: string, loadTimeMs: number) => void;
  reset: () => void;
}

export const useEmbeddingStore = create<EmbeddingState>()((set) => ({
  status: 'idle',
  progress: 0,
  loadProgress: null,
  embedProgress: null,
  error: null,
  activeModelId: null,
  loadTimeMs: null,
  setStatus: (status) => set({ status }),
  setLoadProgress: (loaded, total) => set({
    loadProgress: { loaded, total },
    progress: total > 0 ? loaded / total : 0,
  }),
  setEmbedProgress: (completed, total) => set({
    embedProgress: { completed, total },
    progress: total > 0 ? completed / total : 0,
  }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  setReady: (modelId, loadTimeMs) => set({
    status: 'ready',
    activeModelId: modelId,
    loadTimeMs,
    error: null,
  }),
  reset: () => set({
    status: 'idle',
    progress: 0,
    loadProgress: null,
    embedProgress: null,
    error: null,
    activeModelId: null,
    loadTimeMs: null,
  }),
}));

// Singleton worker
let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('@docintel/ai-engine/workers/embedding', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = handleWorkerMessage;
  }
  return worker;
}

// Pending promise resolvers for one-off requests
let embedResolve: ((vectors: number[][]) => void) | null = null;
let embedReject: ((err: Error) => void) | null = null;
let queryResolve: ((vector: number[]) => void) | null = null;
let queryReject: ((err: Error) => void) | null = null;

function handleWorkerMessage(e: MessageEvent<EmbeddingWorkerOutMessage>) {
  const msg = e.data;
  const store = useEmbeddingStore.getState();

  switch (msg.type) {
    case 'model-progress':
      store.setLoadProgress(msg.loaded, msg.total);
      break;
    case 'model-ready':
      store.setReady(msg.modelId, msg.loadTimeMs);
      break;
    case 'model-error':
      store.setError(msg.error);
      break;
    case 'status':
      store.setStatus(msg.status === 'embedding' ? 'embedding' : msg.status === 'loading' ? 'loading' : msg.status === 'ready' ? 'ready' : msg.status === 'error' ? 'error' : 'idle');
      break;
    case 'embeddings':
      if (embedResolve) {
        embedResolve(msg.vectors);
        embedResolve = null;
        embedReject = null;
      }
      break;
    case 'query-embedding':
      if (queryResolve) {
        queryResolve(msg.embedding);
        queryResolve = null;
        queryReject = null;
      }
      break;
    case 'embed-progress':
      store.setEmbedProgress(msg.completed, msg.total);
      break;
    case 'error':
      store.setError(msg.error);
      if (embedReject) {
        embedReject(new Error(msg.error));
        embedResolve = null;
        embedReject = null;
      }
      if (queryReject) {
        queryReject(new Error(msg.error));
        queryResolve = null;
        queryReject = null;
      }
      break;
  }
}

export function useEmbedding() {
  const store = useEmbeddingStore();

  const loadModel = useCallback((config?: EmbeddingModelConfig, device?: 'webgpu' | 'wasm') => {
    const model = config ?? DEFAULT_EMBEDDING_MODEL;
    const resolvedDevice = device ?? 'webgpu';
    useEmbeddingStore.getState().setStatus('loading');
    getWorker().postMessage({
      type: 'load-model',
      modelId: model.id,
      device: resolvedDevice,
      dtype: model.dtype,
    });
  }, []);

  const embedTexts = useCallback((texts: string[]): Promise<number[][]> => {
    return new Promise((resolve, reject) => {
      embedResolve = resolve;
      embedReject = reject;
      getWorker().postMessage({ type: 'embed-texts', texts });
    });
  }, []);

  const embedQuery = useCallback((query: string): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      queryResolve = resolve;
      queryReject = reject;
      getWorker().postMessage({ type: 'embed-query', query });
    });
  }, []);

  return {
    status: store.status,
    progress: store.progress,
    loadProgress: store.loadProgress,
    embedProgress: store.embedProgress,
    error: store.error,
    activeModelId: store.activeModelId,
    loadTimeMs: store.loadTimeMs,
    isReady: store.status === 'ready',
    isLoading: store.status === 'loading',
    isEmbedding: store.status === 'embedding',
    availableModels: EMBEDDING_MODELS,
    loadModel,
    embedTexts,
    embedQuery,
  };
}
