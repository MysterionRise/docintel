import { parsePDF, isScannedPDF, ocrPDFPages, chunkText } from '@docintel/document-parser';
import type { ProcessingStatus } from '@docintel/document-parser';
import { storeEmbedding, searchSimilar } from './vector-store';
import { buildRAGPrompt } from './prompt-templates';
import type { Domain, StorageAdapter, SearchResult } from './types';

let embeddingWorker: Worker | null = null;
let embeddingModelReady = false;
let createEmbeddingWorker: (() => Worker) | null = null;

export function setEmbeddingWorkerFactory(factory: () => Worker): void {
  createEmbeddingWorker = factory;
}

function getEmbeddingWorker(): Worker {
  if (!embeddingWorker) {
    if (!createEmbeddingWorker) {
      throw new Error('Embedding worker factory not set. Call setEmbeddingWorkerFactory first.');
    }
    embeddingWorker = createEmbeddingWorker();
  }
  return embeddingWorker;
}

function embedTexts(texts: string[]): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const w = getEmbeddingWorker();
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'embeddings') {
        w.removeEventListener('message', handler);
        resolve(e.data.vectors);
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'embed', texts });
  });
}

export async function initEmbeddingModel(): Promise<void> {
  if (embeddingModelReady) return;
  return new Promise((resolve, reject) => {
    const w = getEmbeddingWorker();
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'status' && e.data.status === 'ready') {
        w.removeEventListener('message', handler);
        embeddingModelReady = true;
        resolve();
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'load' });
  });
}

export async function ingestDocument(
  file: File,
  domain: Domain,
  storage: StorageAdapter,
  onProgress?: (status: ProcessingStatus, progress: number) => void,
): Promise<{ id?: number; name: string; domain: Domain; rawText: string; pageCount: number; fileSize: number; uploadedAt: number }> {
  onProgress?.('parsing', 0);
  const parsed = await parsePDF(file);

  let text = parsed.text;
  let pages = parsed.pages;
  if (isScannedPDF(parsed)) {
    onProgress?.('ocr', 0);
    text = await ocrPDFPages(file, (page, total) => {
      onProgress?.('ocr', page / total);
    });
    // Replace pages with OCR text so chunker uses the OCR output
    pages = [{ pageNumber: 1, text }];
  }

  onProgress?.('chunking', 0);
  const chunks = chunkText(pages);

  const docId = await storage.addDocument({
    name: file.name,
    domain,
    rawText: text,
    pageCount: parsed.pageCount,
    fileSize: file.size,
    uploadedAt: Date.now(),
  });

  const chunkIds: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = await storage.addChunk({
      documentId: docId,
      index: i,
      text: chunks[i].text,
      startPage: chunks[i].startPage,
      endPage: chunks[i].endPage,
      tokenCount: chunks[i].tokenCount,
    });
    chunkIds.push(chunkId);
  }

  // Ensure embedding model is loaded before embedding
  await initEmbeddingModel();

  onProgress?.('embedding', 0);
  const batchSize = 8;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchChunkIds = chunkIds.slice(i, i + batchSize);
    const vectors = await embedTexts(batch.map((c) => c.text));

    for (let j = 0; j < vectors.length; j++) {
      await storeEmbedding(storage, batchChunkIds[j], docId, vectors[j]);
    }
    onProgress?.('embedding', Math.min(1, (i + batchSize) / chunks.length));
  }

  onProgress?.('done', 1);

  const doc = await storage.getDocument(docId);
  return doc!;
}

export async function queryRAG(
  question: string,
  domain: Domain,
  storage: StorageAdapter,
  documentId?: number,
): Promise<{ prompt: string; sources: SearchResult[] }> {
  // Ensure embedding model is loaded before querying
  await initEmbeddingModel();

  const queryVector = (await embedTexts([question]))[0];
  const sources = await searchSimilar(storage, queryVector, { topK: 5, documentId });

  const prompt = buildRAGPrompt(
    question,
    sources.map((s) => ({
      text: s.chunk.text,
      score: s.score,
      startPage: s.chunk.startPage,
      endPage: s.chunk.endPage,
    })),
    domain,
  );

  return { prompt, sources };
}
