import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@docintel/ai-engine', () => ({
  EMBEDDING_MODELS: [{ id: 'test-embed', dimension: 384, dtype: 'fp32' }],
  DEFAULT_EMBEDDING_MODEL: { id: 'test-embed', dimension: 384, dtype: 'fp32' },
}));

import { useEmbeddingStore } from '../../hooks/useEmbedding';

describe('useEmbeddingStore', () => {
  beforeEach(() => {
    useEmbeddingStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useEmbeddingStore.getState();
    expect(state.status).toBe('idle');
    expect(state.progress).toBe(0);
    expect(state.loadProgress).toBeNull();
    expect(state.embedProgress).toBeNull();
    expect(state.error).toBeNull();
    expect(state.activeModelId).toBeNull();
    expect(state.loadTimeMs).toBeNull();
  });

  it('setStatus changes status', () => {
    useEmbeddingStore.getState().setStatus('loading');
    expect(useEmbeddingStore.getState().status).toBe('loading');
  });

  it('setLoadProgress updates load progress and percentage', () => {
    useEmbeddingStore.getState().setLoadProgress(50, 100);
    const state = useEmbeddingStore.getState();
    expect(state.loadProgress).toEqual({ loaded: 50, total: 100 });
    expect(state.progress).toBe(0.5);
  });

  it('setLoadProgress handles zero total', () => {
    useEmbeddingStore.getState().setLoadProgress(0, 0);
    expect(useEmbeddingStore.getState().progress).toBe(0);
  });

  it('setEmbedProgress updates embed progress', () => {
    useEmbeddingStore.getState().setEmbedProgress(3, 10);
    const state = useEmbeddingStore.getState();
    expect(state.embedProgress).toEqual({ completed: 3, total: 10 });
    expect(state.progress).toBe(0.3);
  });

  it('setError sets error and status', () => {
    useEmbeddingStore.getState().setError('OOM');
    const state = useEmbeddingStore.getState();
    expect(state.error).toBe('OOM');
    expect(state.status).toBe('error');
  });

  it('setError with null clears error and resets status', () => {
    useEmbeddingStore.setState({ error: 'prev', status: 'error' });
    useEmbeddingStore.getState().setError(null);
    const state = useEmbeddingStore.getState();
    expect(state.error).toBeNull();
    expect(state.status).toBe('idle');
  });

  it('setReady marks model as ready', () => {
    useEmbeddingStore.getState().setReady('embed-model-v1', 1200);
    const state = useEmbeddingStore.getState();
    expect(state.status).toBe('ready');
    expect(state.activeModelId).toBe('embed-model-v1');
    expect(state.loadTimeMs).toBe(1200);
    expect(state.error).toBeNull();
  });

  it('reset clears all state', () => {
    useEmbeddingStore.setState({
      status: 'ready',
      progress: 1,
      activeModelId: 'model',
      loadTimeMs: 500,
      error: null,
    });

    useEmbeddingStore.getState().reset();

    const state = useEmbeddingStore.getState();
    expect(state.status).toBe('idle');
    expect(state.progress).toBe(0);
    expect(state.activeModelId).toBeNull();
    expect(state.loadTimeMs).toBeNull();
  });
});
