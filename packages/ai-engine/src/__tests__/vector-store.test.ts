import { describe, it, expect, beforeEach } from 'vitest';
import { cosineSimilarity, searchSimilar, storeEmbedding } from '../vector-store';
import type { StorageAdapter } from '../types';

// In-memory storage adapter for testing
function createMockStorage(): StorageAdapter & { _embeddings: Array<{ chunkId: number; documentId: number; vector: Float32Array }> } {
  const documents: Array<{ id: number; name: string; domain: any; rawText: string; pageCount: number; fileSize: number; uploadedAt: number }> = [];
  const chunks: Array<{ id: number; documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number }> = [];
  const embeddings: Array<{ chunkId: number; documentId: number; vector: Float32Array }> = [];
  let docId = 0;
  let chunkId = 0;

  return {
    _embeddings: embeddings,
    async addDocument(doc) {
      const id = ++docId;
      documents.push({ id, ...doc });
      return id;
    },
    async getDocument(id) {
      return documents.find((d) => d.id === id);
    },
    async addChunk(chunk) {
      const id = ++chunkId;
      chunks.push({ id, ...chunk });
      return id;
    },
    async getChunk(id) {
      return chunks.find((c) => c.id === id);
    },
    async getChunks(query) {
      if (query.documentId != null) {
        return chunks.filter((c) => c.documentId === query.documentId);
      }
      return chunks;
    },
    async addEmbedding(cId, dId, vector) {
      embeddings.push({ chunkId: cId, documentId: dId, vector });
    },
    async getEmbeddings(documentId) {
      if (documentId != null) {
        return embeddings.filter((e) => e.documentId === documentId);
      }
      return embeddings;
    },
  };
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('handles normalized vectors correctly', () => {
    const a = [0.6, 0.8];
    const b = [0.8, 0.6];
    const expected = 0.6 * 0.8 + 0.8 * 0.6; // 0.96
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });

  it('works with Float32Array', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 4);
  });
});

describe('searchSimilar', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    storage = createMockStorage();

    // Add a document with 4 chunks
    const docId = await storage.addDocument({
      name: 'test.pdf',
      domain: 'contracts',
      rawText: 'test',
      pageCount: 1,
      fileSize: 100,
      uploadedAt: Date.now(),
    });

    // Chunk 1: vector close to [1, 0, 0]
    const c1 = await storage.addChunk({ documentId: docId, index: 0, text: 'Payment terms are net 30', startPage: 1, endPage: 1, tokenCount: 6 });
    await storeEmbedding(storage, c1, docId, [0.95, 0.05, 0.05]);

    // Chunk 2: vector close to [0, 1, 0]
    const c2 = await storage.addChunk({ documentId: docId, index: 1, text: 'Termination clause', startPage: 2, endPage: 2, tokenCount: 3 });
    await storeEmbedding(storage, c2, docId, [0.05, 0.95, 0.05]);

    // Chunk 3: vector close to [0, 0, 1]
    const c3 = await storage.addChunk({ documentId: docId, index: 2, text: 'Liability limitation', startPage: 3, endPage: 3, tokenCount: 3 });
    await storeEmbedding(storage, c3, docId, [0.05, 0.05, 0.95]);

    // Chunk 4: mixed vector
    const c4 = await storage.addChunk({ documentId: docId, index: 3, text: 'General provisions', startPage: 4, endPage: 4, tokenCount: 3 });
    await storeEmbedding(storage, c4, docId, [0.5, 0.5, 0.5]);
  });

  it('returns results ordered by descending similarity', async () => {
    const queryVec = [1, 0, 0]; // Should match chunk 1 best
    const results = await searchSimilar(storage, queryVec, { topK: 10, threshold: 0 });

    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('most similar chunk has highest score', async () => {
    const queryVec = [1, 0, 0];
    const results = await searchSimilar(storage, queryVec, { topK: 10, threshold: 0 });

    expect(results[0].chunk.text).toBe('Payment terms are net 30');
  });

  it('respects topK limit', async () => {
    const queryVec = [0.5, 0.5, 0.5];
    const results = await searchSimilar(storage, queryVec, { topK: 2, threshold: 0 });

    expect(results).toHaveLength(2);
  });

  it('respects threshold filter', async () => {
    const queryVec = [1, 0, 0];
    const results = await searchSimilar(storage, queryVec, { topK: 10, threshold: 0.9 });

    // Only chunk 1 (0.95, 0.05, 0.05) should be close enough
    expect(results.length).toBeLessThanOrEqual(2);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('filters by documentId', async () => {
    // Add a second document
    const doc2 = await storage.addDocument({
      name: 'other.pdf',
      domain: 'legal',
      rawText: 'other',
      pageCount: 1,
      fileSize: 50,
      uploadedAt: Date.now(),
    });
    const c5 = await storage.addChunk({ documentId: doc2, index: 0, text: 'Other doc chunk', startPage: 1, endPage: 1, tokenCount: 4 });
    await storeEmbedding(storage, c5, doc2, [0.99, 0.01, 0.01]);

    // Query only doc2
    const results = await searchSimilar(storage, [1, 0, 0], { topK: 10, documentId: doc2, threshold: 0 });

    expect(results).toHaveLength(1);
    expect(results[0].chunk.text).toBe('Other doc chunk');
  });

  it('returns empty array when no embeddings exist', async () => {
    const emptyStorage = createMockStorage();
    const results = await searchSimilar(emptyStorage, [1, 0, 0]);

    expect(results).toHaveLength(0);
  });
});
