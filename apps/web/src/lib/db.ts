import Dexie, { type EntityTable } from 'dexie';
import type { DocDocument, DocChunk, DocEmbedding } from '../types/document';

const db = new Dexie('DocIntelDB') as Dexie & {
  documents: EntityTable<DocDocument, 'id'>;
  chunks: EntityTable<DocChunk, 'id'>;
  embeddings: EntityTable<DocEmbedding, 'id'>;
};

db.version(1).stores({
  documents: '++id, domain, uploadedAt',
  chunks: '++id, documentId, index',
  embeddings: '++id, chunkId, documentId',
});

export { db };
