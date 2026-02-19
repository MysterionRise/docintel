import type { StorageAdapter, SearchResult } from './types';

export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function storeEmbedding(
  storage: StorageAdapter,
  chunkId: number,
  documentId: number,
  vector: number[],
): Promise<void> {
  await storage.addEmbedding(chunkId, documentId, new Float32Array(vector));
}

export async function searchSimilar(
  storage: StorageAdapter,
  queryVector: number[],
  options: {
    topK?: number;
    documentId?: number;
    threshold?: number;
  } = {},
): Promise<SearchResult[]> {
  const { topK = 5, documentId, threshold = 0.3 } = options;

  const embeddings = await storage.getEmbeddings(documentId);
  const results: SearchResult[] = [];

  for (const emb of embeddings) {
    const score = cosineSimilarity(queryVector, emb.vector);
    if (score >= threshold) {
      const chunk = await storage.getChunk(emb.chunkId);
      if (chunk) {
        results.push({ chunk, score });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
