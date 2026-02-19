import { create } from 'zustand';
import type { DocDocument } from '../types/document';
import type { ProcessingStatus } from '@docintel/document-parser';
import type { Domain } from '@docintel/ai-engine';
import { ingestDocument, setEmbeddingWorkerFactory } from '@docintel/ai-engine';
import { db } from '../lib/db';
import { DexieStorageAdapter } from '../lib/dexie-storage';

const storage = new DexieStorageAdapter();

// Initialize the embedding worker factory so ai-engine can create embedding workers
setEmbeddingWorkerFactory(() =>
  new Worker(new URL('@docintel/ai-engine/workers/embedding', import.meta.url), { type: 'module' }),
);

interface DocumentState {
  documents: DocDocument[];
  selectedDocumentId: number | null;
  processingStatus: ProcessingStatus;
  processingProgress: number;
  processingStatusText: string;
  loadDocuments: (domain?: Domain) => Promise<void>;
  selectDocument: (id: number | null) => void;
  uploadAndIngest: (file: File, domain: Domain) => Promise<void>;
  deleteDocument: (id: number) => Promise<void>;
}

export const useDocumentStore = create<DocumentState>()((set) => ({
  documents: [],
  selectedDocumentId: null,
  processingStatus: 'idle',
  processingProgress: 0,
  processingStatusText: '',

  loadDocuments: async (domain) => {
    set({ documents: [], selectedDocumentId: null });
    let docs: DocDocument[];
    if (domain) {
      docs = await db.documents.where('domain').equals(domain).sortBy('uploadedAt');
    } else {
      docs = await db.documents.orderBy('uploadedAt').toArray();
    }
    docs.reverse();
    set({ documents: docs });
  },

  selectDocument: (id) => set({ selectedDocumentId: id }),

  uploadAndIngest: async (file, domain) => {
    set({ processingStatus: 'parsing', processingProgress: 0, processingStatusText: 'Parsing...' });
    try {
      const doc = await ingestDocument(file, domain, storage, (status: ProcessingStatus, progress: number) => {
        const labels: Record<string, string> = {
          parsing: 'Parsing PDF...',
          ocr: 'Running OCR...',
          chunking: 'Chunking text...',
          embedding: 'Computing embeddings...',
          done: 'Done!',
        };
        set({
          processingStatus: status,
          processingProgress: progress,
          processingStatusText: labels[status] ?? status,
        });
      });
      set((s) => ({
        documents: [doc as DocDocument, ...s.documents],
        processingStatus: 'done',
        processingProgress: 1,
      }));
    } catch {
      set({ processingStatus: 'error', processingStatusText: 'Processing failed' });
    }
  },

  deleteDocument: async (id) => {
    await db.embeddings.where('documentId').equals(id).delete();
    await db.chunks.where('documentId').equals(id).delete();
    await db.documents.delete(id);
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      selectedDocumentId: s.selectedDocumentId === id ? null : s.selectedDocumentId,
    }));
  },
}));
