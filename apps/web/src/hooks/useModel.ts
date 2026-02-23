import { useEffect, useRef, useCallback } from 'react';
import {
  ModelManager,
  detectCapabilities,
  MODELS,
  type InferenceStatus,
  type ModelDownloadProgress,
  type DeviceCapability,
  type GenerationStats,
} from '@docintel/ai-engine';
import { create } from 'zustand';

interface ModelState {
  status: InferenceStatus;
  downloadProgress: ModelDownloadProgress | null;
  capability: DeviceCapability | null;
  error: string | null;
  lastGenerationStats: GenerationStats | null;
  loadTimeMs: number | null;
  activeModelId: string | null;
  activeDevice: 'webgpu' | 'wasm' | null;
  setStatus: (status: InferenceStatus) => void;
  setDownloadProgress: (progress: ModelDownloadProgress | null) => void;
  setCapability: (capability: DeviceCapability) => void;
  setError: (error: string | null) => void;
  setGenerationStats: (stats: GenerationStats) => void;
  setLoadTimeMs: (ms: number) => void;
  setActiveModel: (modelId: string | null, device: 'webgpu' | 'wasm' | null) => void;
}

export const useModelStore = create<ModelState>()((set) => ({
  status: 'idle',
  downloadProgress: null,
  capability: null,
  error: null,
  lastGenerationStats: null,
  loadTimeMs: null,
  activeModelId: null,
  activeDevice: null,
  setStatus: (status) => set({ status, error: status === 'error' ? undefined : null }),
  setDownloadProgress: (downloadProgress) => set({ downloadProgress }),
  setCapability: (capability) => set({ capability }),
  setError: (error) => set({ error, status: 'error' }),
  setGenerationStats: (lastGenerationStats) => set({ lastGenerationStats }),
  setLoadTimeMs: (loadTimeMs) => set({ loadTimeMs }),
  setActiveModel: (activeModelId, activeDevice) => set({ activeModelId, activeDevice }),
}));

// Singleton model manager — shared across all hook consumers
let managerInstance: ModelManager | null = null;

export function getModelManager(): ModelManager {
  if (!managerInstance) {
    managerInstance = new ModelManager(
      () => new Worker(new URL('@docintel/ai-engine/workers/inference', import.meta.url), { type: 'module' }),
    );
  }
  return managerInstance;
}

export function useModel() {
  const store = useModelStore();
  const managerRef = useRef<ModelManager | null>(null);

  useEffect(() => {
    const manager = getModelManager();
    managerRef.current = manager;

    manager.setCallbacks({
      onStatusChange: (status) => {
        useModelStore.getState().setStatus(status);
      },
      onDownloadProgress: (progress) => {
        useModelStore.getState().setDownloadProgress(progress);
      },
      onToken: undefined, // Handled by useInference
      onGenerationDone: (stats) => {
        useModelStore.getState().setGenerationStats(stats);
      },
      onError: (error) => {
        useModelStore.getState().setError(error);
      },
    });

    // Detect GPU capabilities on mount
    detectCapabilities().then((cap) => {
      useModelStore.getState().setCapability(cap);
    });
  }, []);

  const loadModel = useCallback((modelId?: string, dtype?: string, device?: 'webgpu' | 'wasm') => {
    const manager = getModelManager();
    const cap = useModelStore.getState().capability;

    const resolvedModelId = modelId ?? cap?.recommendedModel ?? MODELS.SMOLLM3_3B.id;
    const resolvedDtype = dtype ?? cap?.recommendedDtype ?? MODELS.SMOLLM3_3B.dtype;
    const resolvedDevice = device ?? cap?.recommendedDevice ?? 'webgpu';

    useModelStore.getState().setActiveModel(resolvedModelId, resolvedDevice);
    useModelStore.getState().setStatus('loading_tokenizer');
    useModelStore.getState().setError(null);

    manager.loadModel(resolvedModelId, resolvedDtype, resolvedDevice);
  }, []);

  const unloadModel = useCallback(async () => {
    const manager = getModelManager();
    await manager.unloadModel();
    useModelStore.getState().setActiveModel(null, null);
  }, []);

  return {
    status: store.status,
    downloadProgress: store.downloadProgress,
    capability: store.capability,
    error: store.error,
    lastGenerationStats: store.lastGenerationStats,
    loadTimeMs: store.loadTimeMs,
    activeModelId: store.activeModelId,
    activeDevice: store.activeDevice,
    loadModel,
    unloadModel,
    isLoaded: store.status === 'ready' || store.status === 'generating',
  };
}
