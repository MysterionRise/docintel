import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../hooks/useModel', () => ({
  getModelManager: vi.fn().mockReturnValue({
    setCallbacks: vi.fn(),
    generate: vi.fn(),
    abort: vi.fn(),
  }),
  useModelStore: {
    getState: vi.fn().mockReturnValue({
      setStatus: vi.fn(),
      setDownloadProgress: vi.fn(),
      setGenerationStats: vi.fn(),
      setError: vi.fn(),
    }),
  },
}));

import { useInferenceState } from '../../hooks/useInference';

describe('useInferenceState (Zustand store)', () => {
  beforeEach(() => {
    useInferenceState.setState({
      streamingText: '',
      isGenerating: false,
      stats: null,
    });
  });

  it('has correct initial state', () => {
    const state = useInferenceState.getState();
    expect(state.streamingText).toBe('');
    expect(state.isGenerating).toBe(false);
    expect(state.stats).toBeNull();
  });

  it('appendToken accumulates streaming text', () => {
    useInferenceState.getState().appendToken('Hello');
    useInferenceState.getState().appendToken(' world');
    expect(useInferenceState.getState().streamingText).toBe('Hello world');
  });

  it('setGenerating updates generating flag', () => {
    useInferenceState.getState().setGenerating(true);
    expect(useInferenceState.getState().isGenerating).toBe(true);

    useInferenceState.getState().setGenerating(false);
    expect(useInferenceState.getState().isGenerating).toBe(false);
  });

  it('setStats stores generation stats', () => {
    const stats = { tokensGenerated: 50, tokensPerSecond: 12, totalTimeMs: 4000 };
    useInferenceState.getState().setStats(stats);
    expect(useInferenceState.getState().stats).toEqual(stats);
  });

  it('reset clears all state', () => {
    useInferenceState.setState({
      streamingText: 'some text',
      isGenerating: true,
      stats: { tokensGenerated: 10, tokensPerSecond: 5, totalTimeMs: 2000 },
    });

    useInferenceState.getState().reset();

    const state = useInferenceState.getState();
    expect(state.streamingText).toBe('');
    expect(state.isGenerating).toBe(false);
    expect(state.stats).toBeNull();
  });
});
