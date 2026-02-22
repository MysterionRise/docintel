import Dexie, { type EntityTable } from 'dexie';
import type { DocDocument, DocChunk, DocEmbedding, StoredPage } from '../types/document';
import type { ChatMessage } from '@docintel/ai-engine';

export interface StoredChatMessage extends ChatMessage {
  dbId?: number;
  documentId: number | null;
}

const db = new Dexie('DocIntelDB') as Dexie & {
  documents: EntityTable<DocDocument, 'id'>;
  chunks: EntityTable<DocChunk, 'id'>;
  embeddings: EntityTable<DocEmbedding, 'id'>;
  pages: EntityTable<StoredPage, 'id'>;
  chatMessages: EntityTable<StoredChatMessage, 'dbId'>;
};

db.version(1).stores({
  documents: '++id, domain, uploadedAt',
  chunks: '++id, documentId, index',
  embeddings: '++id, chunkId, documentId',
});

db.version(2).stores({
  documents: '++id, domain, uploadedAt',
  chunks: '++id, documentId, index',
  embeddings: '++id, chunkId, documentId',
  pages: '++id, documentId, pageNumber',
});

db.version(3).stores({
  documents: '++id, domain, uploadedAt',
  chunks: '++id, documentId, index',
  embeddings: '++id, chunkId, documentId',
  pages: '++id, documentId, pageNumber',
  chatMessages: '++dbId, documentId, timestamp',
});

export { db };
