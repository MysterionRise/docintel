import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@docintel/ai-engine', () => ({
  queryRAG: vi.fn().mockResolvedValue({
    prompt: 'RAG prompt',
    sources: [{ chunk: { id: 1, documentId: 1, index: 0, text: 'chunk', startPage: 1, endPage: 1, tokenCount: 10 }, score: 0.9 }],
    retrievalTimeMs: 50,
    contextTokens: 200,
    mode: 'rag',
  }),
  shouldUseRAG: vi.fn().mockImplementation((tokens: number) => tokens > 3000),
  ContextManager: class MockContextManager {
    estimateTokens(text: string) { return Math.ceil(text.length / 3.5); }
    fitToContext() {
      return { context: 'fitted context', includedPages: [1], truncated: false, totalTokens: 100 };
    }
  },
}));

vi.mock('../../lib/dexie-storage', () => ({
  DexieStorageAdapter: class MockDexieStorageAdapter {},
}));

import { useRAG } from '../../hooks/useRAG';
import { shouldUseRAG } from '@docintel/ai-engine';

describe('useRAG', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with auto mode', () => {
    const { result } = renderHook(() => useRAG());
    expect(result.current.mode).toBe('auto');
    expect(result.current.lastRetrievalStats).toBeNull();
    expect(result.current.lastSources).toEqual([]);
  });

  it('setMode changes mode', () => {
    const { result } = renderHook(() => useRAG());

    act(() => {
      result.current.setMode('rag');
    });

    expect(result.current.mode).toBe('rag');
  });

  it('getEffectiveMode returns simple for small documents in auto mode', () => {
    vi.mocked(shouldUseRAG).mockReturnValue(false);

    const { result } = renderHook(() => useRAG());
    const mode = result.current.getEffectiveMode(500);

    expect(mode).toBe('simple');
    expect(shouldUseRAG).toHaveBeenCalledWith(500);
  });

  it('getEffectiveMode returns rag for large documents in auto mode', () => {
    vi.mocked(shouldUseRAG).mockReturnValue(true);

    const { result } = renderHook(() => useRAG());
    const mode = result.current.getEffectiveMode(10000);

    expect(mode).toBe('rag');
    expect(shouldUseRAG).toHaveBeenCalledWith(10000);
  });

  it('getEffectiveMode respects forced mode over auto', () => {
    const { result } = renderHook(() => useRAG());

    act(() => {
      result.current.setMode('simple');
    });

    const mode = result.current.getEffectiveMode(10000);
    expect(mode).toBe('simple');
    // shouldUseRAG should NOT be called since mode is forced
    expect(shouldUseRAG).not.toHaveBeenCalled();
  });

  it('executeQuery in simple mode returns context-stuffed result', async () => {
    vi.mocked(shouldUseRAG).mockReturnValue(false);

    const { result } = renderHook(() => useRAG());

    const doc = { id: 1, rawText: 'short doc', pageCount: 1, domain: 'contracts' as const };
    let ragResult: Awaited<ReturnType<typeof result.current.executeQuery>>;

    await act(async () => {
      ragResult = await result.current.executeQuery('question', doc, []);
    });

    expect(ragResult!.mode).toBe('simple');
    expect(ragResult!.prompt).toBe('fitted context');
    expect(result.current.lastRetrievalStats).toBeTruthy();
    expect(result.current.lastRetrievalStats!.mode).toBe('simple');
    expect(result.current.lastSources).toEqual([]);
  });

  it('executeQuery in rag mode calls queryRAG', async () => {
    vi.mocked(shouldUseRAG).mockReturnValue(true);

    const { result } = renderHook(() => useRAG());

    const doc = {
      id: 1,
      rawText: 'a'.repeat(20000),
      pageCount: 10,
      domain: 'medical' as const,
    };
    let ragResult: Awaited<ReturnType<typeof result.current.executeQuery>>;

    await act(async () => {
      ragResult = await result.current.executeQuery('what is the diagnosis?', doc, []);
    });

    expect(ragResult!.mode).toBe('rag');
    expect(result.current.lastRetrievalStats!.mode).toBe('rag');
    expect(result.current.lastSources).toHaveLength(1);
  });
});
