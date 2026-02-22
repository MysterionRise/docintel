import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from '../../hooks/useModel';

describe('useModelStore', () => {
  beforeEach(() => {
    useModelStore.setState({
      status: 'idle',
      downloadProgress: null,
      capability: null,
      error: null,
      lastGenerationStats: null,
      loadTimeMs: null,
      activeModelId: null,
      activeDevice: null,
    });
  });

  it('has correct initial state', () => {
    const state = useModelStore.getState();
    expect(state.status).toBe('idle');
    expect(state.downloadProgress).toBeNull();
    expect(state.capability).toBeNull();
    expect(state.error).toBeNull();
    expect(state.lastGenerationStats).toBeNull();
    expect(state.activeModelId).toBeNull();
    expect(state.activeDevice).toBeNull();
  });

  it('setStatus updates status and clears error', () => {
    useModelStore.getState().setStatus('ready');
    expect(useModelStore.getState().status).toBe('ready');
    expect(useModelStore.getState().error).toBeNull();
  });

  it('setStatus preserves error field when status is "error"', () => {
    useModelStore.getState().setError('something broke');
    expect(useModelStore.getState().status).toBe('error');
    expect(useModelStore.getState().error).toBe('something broke');
  });

  it('setDownloadProgress updates progress', () => {
    const progress = { loaded: 50, total: 100, name: 'model.bin' };
    useModelStore.getState().setDownloadProgress(progress);
    expect(useModelStore.getState().downloadProgress).toEqual(progress);
  });

  it('setCapability stores device capability', () => {
    const cap = {
      hasWebGPU: true,
      hasFp16: true,
      adapterInfo: null,
      estimatedVRAM: 'high' as const,
      recommendedModel: 'test-model',
      recommendedDtype: 'fp16',
      recommendedDevice: 'webgpu' as const,
    };
    useModelStore.getState().setCapability(cap);
    expect(useModelStore.getState().capability).toEqual(cap);
  });

  it('setError sets error and status to "error"', () => {
    useModelStore.getState().setError('GPU init failed');
    expect(useModelStore.getState().error).toBe('GPU init failed');
    expect(useModelStore.getState().status).toBe('error');
  });

  it('setError with null clears error and sets status to "error"', () => {
    useModelStore.getState().setError(null);
    expect(useModelStore.getState().error).toBeNull();
    expect(useModelStore.getState().status).toBe('error');
  });

  it('setGenerationStats stores generation stats', () => {
    const stats = { tokensGenerated: 100, tokensPerSecond: 25, totalTimeMs: 4000 };
    useModelStore.getState().setGenerationStats(stats);
    expect(useModelStore.getState().lastGenerationStats).toEqual(stats);
  });

  it('setLoadTimeMs stores load time', () => {
    useModelStore.getState().setLoadTimeMs(3500);
    expect(useModelStore.getState().loadTimeMs).toBe(3500);
  });

  it('setActiveModel updates model id and device', () => {
    useModelStore.getState().setActiveModel('smollm-360m', 'webgpu');
    expect(useModelStore.getState().activeModelId).toBe('smollm-360m');
    expect(useModelStore.getState().activeDevice).toBe('webgpu');
  });

  it('setActiveModel can reset to null', () => {
    useModelStore.getState().setActiveModel('model-id', 'wasm');
    useModelStore.getState().setActiveModel(null, null);
    expect(useModelStore.getState().activeModelId).toBeNull();
    expect(useModelStore.getState().activeDevice).toBeNull();
  });
});
