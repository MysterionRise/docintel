import { db } from './db';
import type { StorageAdapter } from '@docintel/ai-engine';
import type { DocDocument, DocChunk } from '../types/document';

export class DexieStorageAdapter implements StorageAdapter {
  async addDocument(doc: Omit<DocDocument, 'id'>): Promise<number> {
    return (await db.documents.add(doc)) as number;
  }

  async getDocument(id: number): Promise<DocDocument | undefined> {
    return db.documents.get(id);
  }

  async addChunk(chunk: Omit<DocChunk, 'id'>): Promise<number> {
    return (await db.chunks.add(chunk)) as number;
  }

  async getChunk(id: number): Promise<DocChunk | undefined> {
    return db.chunks.get(id);
  }

  async getChunks(query: { documentId?: number }): Promise<DocChunk[]> {
    if (query.documentId != null) {
      return db.chunks.where('documentId').equals(query.documentId).toArray();
    }
    return db.chunks.toArray();
  }

  async addEmbedding(chunkId: number, documentId: number, vector: Float32Array): Promise<void> {
    await db.embeddings.add({ chunkId, documentId, vector });
  }

  async getEmbeddings(documentId?: number): Promise<Array<{ chunkId: number; documentId: number; vector: Float32Array }>> {
    if (documentId != null) {
      return db.embeddings.where('documentId').equals(documentId).toArray();
    }
    return db.embeddings.toCollection().toArray();
  }
}
