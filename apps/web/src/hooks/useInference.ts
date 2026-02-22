import { useCallback, useRef } from 'react';
import { create } from 'zustand';
import { getModelManager, useModelStore } from './useModel';
import type { GenerationStats } from '@docintel/ai-engine';

interface InferenceState {
  streamingText: string;
  isGenerating: boolean;
  stats: GenerationStats | null;
  appendToken: (text: string) => void;
  setGenerating: (generating: boolean) => void;
  setStats: (stats: GenerationStats | null) => void;
  reset: () => void;
}

export const useInferenceState = create<InferenceState>()((set) => ({
  streamingText: '',
  isGenerating: false,
  stats: null,
  appendToken: (text) => set((s) => ({ streamingText: s.streamingText + text })),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setStats: (stats) => set({ stats }),
  reset: () => set({ streamingText: '', isGenerating: false, stats: null }),
}));

export function useInference() {
  const state = useInferenceState();
  const callbacksInstalledRef = useRef(false);

  // Install token/generation-done callbacks on the shared ModelManager
  if (!callbacksInstalledRef.current) {
    const manager = getModelManager();
    manager.setCallbacks({
      onStatusChange: (status) => {
        useModelStore.getState().setStatus(status);
        if (status === 'generating') {
          useInferenceState.getState().setGenerating(true);
        }
      },
      onDownloadProgress: (progress) => {
        useModelStore.getState().setDownloadProgress(progress);
      },
      onToken: (text) => {
        useInferenceState.getState().appendToken(text);
      },
      onGenerationDone: (stats) => {
        useModelStore.getState().setGenerationStats(stats);
        useInferenceState.getState().setStats(stats);
        useInferenceState.getState().setGenerating(false);
      },
      onError: (error) => {
        useModelStore.getState().setError(error);
        useInferenceState.getState().setGenerating(false);
      },
    });
    callbacksInstalledRef.current = true;
  }

  const generate = useCallback(
    (messages: Array<{ role: string; content: string }>, options?: { maxTokens?: number; temperature?: number; topP?: number }) => {
      useInferenceState.getState().reset();
      useInferenceState.getState().setGenerating(true);
      getModelManager().generate(messages, options);
    },
    [],
  );

  const abort = useCallback(() => {
    getModelManager().abort();
    useInferenceState.getState().setGenerating(false);
  }, []);

  return {
    streamingText: state.streamingText,
    isGenerating: state.isGenerating,
    stats: state.stats,
    generate,
    abort,
    resetStream: state.reset,
  };
}
