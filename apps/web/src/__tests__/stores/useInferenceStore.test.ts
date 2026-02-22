import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGenerate, mockAbort, mockSetCallbacks, mockGetState } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockAbort: vi.fn(),
  mockSetCallbacks: vi.fn(),
  mockGetState: vi.fn().mockReturnValue({
    status: 'ready',
    setStatus: vi.fn(),
    setDownloadProgress: vi.fn(),
    setGenerationStats: vi.fn(),
    setError: vi.fn(),
  }),
}));

// Mock db before importing the store
vi.mock('../../lib/db', () => ({
  db: {
    chatMessages: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue(0),
        }),
      }),
      add: vi.fn().mockResolvedValue(1),
    },
  },
}));

vi.mock('../../lib/dexie-storage', () => ({
  DexieStorageAdapter: class MockDexieStorageAdapter {},
}));

vi.mock('../../hooks/useModel', () => ({
  getModelManager: vi.fn().mockReturnValue({
    setCallbacks: mockSetCallbacks,
    generate: mockGenerate,
    abort: mockAbort,
  }),
  useModelStore: {
    getState: mockGetState,
  },
}));

import { useInferenceStore } from '../../stores/useInferenceStore';
import { db } from '../../lib/db';

describe('useInferenceStore', () => {
  beforeEach(() => {
    useInferenceStore.setState({
      messages: [],
      currentStreamText: '',
      currentDocumentId: null,
    });
    vi.clearAllMocks();
    // Reset default mock return
    mockGetState.mockReturnValue({
      status: 'ready',
      setStatus: vi.fn(),
      setDownloadProgress: vi.fn(),
      setGenerationStats: vi.fn(),
      setError: vi.fn(),
    });
  });

  it('has correct initial state', () => {
    const state = useInferenceStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.currentStreamText).toBe('');
    expect(state.currentDocumentId).toBeNull();
  });

  it('clearMessages resets messages and stream text', async () => {
    useInferenceStore.setState({
      messages: [{ id: '1', role: 'user', content: 'hello', timestamp: 1 }],
      currentStreamText: 'partial',
      currentDocumentId: 42,
    });

    await useInferenceStore.getState().clearMessages();

    const state = useInferenceStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.currentStreamText).toBe('');
  });

  it('clearMessages deletes from db when documentId is set', async () => {
    useInferenceStore.setState({ currentDocumentId: 42 });

    await useInferenceStore.getState().clearMessages();

    expect(db.chatMessages.where).toHaveBeenCalledWith('documentId');
  });

  it('clearMessages does not delete from db when documentId is null', async () => {
    useInferenceStore.setState({ currentDocumentId: null });

    await useInferenceStore.getState().clearMessages();

    expect(db.chatMessages.where).not.toHaveBeenCalled();
  });

  it('loadMessages sets empty messages for null documentId', async () => {
    useInferenceStore.setState({ currentDocumentId: 5, messages: [{ id: '1', role: 'user', content: 'x', timestamp: 1 }] });

    await useInferenceStore.getState().loadMessages(null);

    const state = useInferenceStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.currentDocumentId).toBeNull();
    expect(state.currentStreamText).toBe('');
  });

  it('loadMessages fetches messages from db for a documentId', async () => {
    const storedMessages = [
      { dbId: 1, documentId: 10, id: 'a', role: 'user' as const, content: 'hi', timestamp: 100 },
      { dbId: 2, documentId: 10, id: 'b', role: 'assistant' as const, content: 'hello', timestamp: 200 },
    ];

    vi.mocked(db.chatMessages.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        sortBy: vi.fn().mockResolvedValue(storedMessages),
        delete: vi.fn(),
      }),
    } as never);

    await useInferenceStore.getState().loadMessages(10);

    const state = useInferenceStore.getState();
    expect(state.currentDocumentId).toBe(10);
    expect(state.messages).toHaveLength(2);
    // Verify dbId and documentId are stripped
    expect(state.messages[0]).not.toHaveProperty('dbId');
    expect(state.messages[0]).not.toHaveProperty('documentId');
    expect(state.messages[0].id).toBe('a');
    expect(state.messages[0].content).toBe('hi');
  });

  it('loadMessages skips fetch if same documentId and messages exist', async () => {
    useInferenceStore.setState({
      currentDocumentId: 10,
      messages: [{ id: '1', role: 'user', content: 'cached', timestamp: 1 }],
    });

    await useInferenceStore.getState().loadMessages(10);

    // Should not have called db since messages are already loaded
    expect(db.chatMessages.where).not.toHaveBeenCalled();
  });

  it('sendMessage does nothing if model is not ready', () => {
    mockGetState.mockReturnValue({
      status: 'idle',
      setStatus: vi.fn(),
      setDownloadProgress: vi.fn(),
      setGenerationStats: vi.fn(),
      setError: vi.fn(),
    });

    useInferenceStore.getState().sendMessage('hello');

    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('sendMessage adds user message and calls generate when ready', async () => {
    mockGetState.mockReturnValue({
      status: 'ready',
      setStatus: vi.fn(),
      setDownloadProgress: vi.fn(),
      setGenerationStats: vi.fn(),
      setError: vi.fn(),
    });

    useInferenceStore.getState().sendMessage('hello world');

    // Wait for async operations
    await vi.waitFor(() => {
      const state = useInferenceStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('hello world');
    });
  });
});
