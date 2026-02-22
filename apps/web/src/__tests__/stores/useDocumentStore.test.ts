import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock db
vi.mock('../../lib/db', () => ({
  db: {
    documents: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([]),
        }),
      }),
      orderBy: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    chunks: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          delete: vi.fn().mockResolvedValue(0),
        }),
      }),
    },
    embeddings: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          delete: vi.fn().mockResolvedValue(0),
        }),
      }),
    },
  },
}));

vi.mock('../../lib/dexie-storage', () => ({
  DexieStorageAdapter: class MockDexieStorageAdapter {},
}));

vi.mock('@docintel/ai-engine', () => ({
  ingestDocument: vi.fn(),
  setEmbeddingWorkerFactory: vi.fn(),
}));

import { useDocumentStore } from '../../stores/useDocumentStore';
import { db } from '../../lib/db';
import type { DocDocument } from '../../types/document';

describe('useDocumentStore', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      documents: [],
      selectedDocumentId: null,
      processingStatus: 'idle',
      processingProgress: 0,
      processingStatusText: '',
    });
    vi.clearAllMocks();
  });

  it('has correct initial state', () => {
    const state = useDocumentStore.getState();
    expect(state.documents).toEqual([]);
    expect(state.selectedDocumentId).toBeNull();
    expect(state.processingStatus).toBe('idle');
    expect(state.processingProgress).toBe(0);
  });

  it('selectDocument sets selectedDocumentId', () => {
    useDocumentStore.getState().selectDocument(42);
    expect(useDocumentStore.getState().selectedDocumentId).toBe(42);
  });

  it('selectDocument with null deselects', () => {
    useDocumentStore.getState().selectDocument(42);
    useDocumentStore.getState().selectDocument(null);
    expect(useDocumentStore.getState().selectedDocumentId).toBeNull();
  });

  it('loadDocuments fetches all documents when no domain', async () => {
    const docs: DocDocument[] = [
      { id: 1, name: 'doc1.pdf', domain: 'contracts', rawText: 'text', pageCount: 1, fileSize: 100, uploadedAt: 1000 },
      { id: 2, name: 'doc2.pdf', domain: 'medical', rawText: 'text2', pageCount: 2, fileSize: 200, uploadedAt: 2000 },
    ];

    vi.mocked(db.documents.orderBy).mockReturnValue({
      toArray: vi.fn().mockResolvedValue([...docs]),
    } as never);

    await useDocumentStore.getState().loadDocuments();

    const state = useDocumentStore.getState();
    // Documents should be reversed (newest first)
    expect(state.documents).toHaveLength(2);
    expect(state.documents[0].id).toBe(2);
    expect(state.documents[1].id).toBe(1);
  });

  it('loadDocuments filters by domain', async () => {
    const medDocs: DocDocument[] = [
      { id: 3, name: 'med.pdf', domain: 'medical', rawText: 'med text', pageCount: 3, fileSize: 300, uploadedAt: 3000 },
    ];

    vi.mocked(db.documents.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        sortBy: vi.fn().mockResolvedValue([...medDocs]),
      }),
    } as never);

    await useDocumentStore.getState().loadDocuments('medical');

    const state = useDocumentStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].domain).toBe('medical');
  });

  it('loadDocuments resets selectedDocumentId', async () => {
    useDocumentStore.setState({ selectedDocumentId: 99 });

    vi.mocked(db.documents.orderBy).mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    } as never);

    await useDocumentStore.getState().loadDocuments();

    expect(useDocumentStore.getState().selectedDocumentId).toBeNull();
  });

  it('deleteDocument removes from db and state', async () => {
    const docs: DocDocument[] = [
      { id: 1, name: 'a.pdf', domain: 'contracts', rawText: 'a', pageCount: 1, fileSize: 10, uploadedAt: 100 },
      { id: 2, name: 'b.pdf', domain: 'legal', rawText: 'b', pageCount: 1, fileSize: 20, uploadedAt: 200 },
    ];
    useDocumentStore.setState({ documents: docs, selectedDocumentId: 1 });

    await useDocumentStore.getState().deleteDocument(1);

    const state = useDocumentStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].id).toBe(2);
    // selectedDocumentId should reset since the selected doc was deleted
    expect(state.selectedDocumentId).toBeNull();
  });

  it('deleteDocument preserves selectedDocumentId if different doc deleted', async () => {
    const docs: DocDocument[] = [
      { id: 1, name: 'a.pdf', domain: 'contracts', rawText: 'a', pageCount: 1, fileSize: 10, uploadedAt: 100 },
      { id: 2, name: 'b.pdf', domain: 'legal', rawText: 'b', pageCount: 1, fileSize: 20, uploadedAt: 200 },
    ];
    useDocumentStore.setState({ documents: docs, selectedDocumentId: 2 });

    await useDocumentStore.getState().deleteDocument(1);

    expect(useDocumentStore.getState().selectedDocumentId).toBe(2);
    expect(useDocumentStore.getState().documents).toHaveLength(1);
  });

  it('deleteDocument cleans up embeddings, chunks, and document from db', async () => {
    useDocumentStore.setState({
      documents: [{ id: 5, name: 'x.pdf', domain: 'financial', rawText: 'x', pageCount: 1, fileSize: 10, uploadedAt: 100 }],
    });

    await useDocumentStore.getState().deleteDocument(5);

    expect(db.embeddings.where).toHaveBeenCalledWith('documentId');
    expect(db.chunks.where).toHaveBeenCalledWith('documentId');
    expect(db.documents.delete).toHaveBeenCalledWith(5);
  });
});
