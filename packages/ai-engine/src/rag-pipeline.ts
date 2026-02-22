import { parsePDF, isScannedPDF, ocrPDFPages, chunkText, estimateTokens } from '@docintel/document-parser';
import type { ProcessingStatus } from '@docintel/document-parser';
import { storeEmbedding, searchSimilar } from './vector-store';
import { buildRAGPrompt } from './prompt-templates';
import { DEFAULT_EMBEDDING_MODEL } from './constants';
import {
  DEFAULT_RAG_OPTIONS,
  type Domain,
  type StorageAdapter,
  type SearchResult,
  type RAGOptions,
  type RAGResult,
  type ChatMessage,
} from './types';
import type { EmbeddingWorkerOutMessage } from './workers/embedding.worker';

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
    const handler = (e: MessageEvent<EmbeddingWorkerOutMessage>) => {
      if (e.data.type === 'embeddings') {
        w.removeEventListener('message', handler);
        resolve(e.data.vectors);
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'embed-texts', texts });
  });
}

function embedQuery(query: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const w = getEmbeddingWorker();
    const handler = (e: MessageEvent<EmbeddingWorkerOutMessage>) => {
      if (e.data.type === 'query-embedding') {
        w.removeEventListener('message', handler);
        resolve(e.data.embedding);
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'embed-query', query });
  });
}

// --- Query embedding cache (LRU, max 32 entries) ---

const CACHE_MAX = 32;
const queryEmbeddingCache = new Map<string, number[]>();

async function getCachedQueryEmbedding(query: string): Promise<number[]> {
  const normalised = query.trim().toLowerCase();
  const cached = queryEmbeddingCache.get(normalised);
  if (cached) {
    // Move to end (most recent)
    queryEmbeddingCache.delete(normalised);
    queryEmbeddingCache.set(normalised, cached);
    return cached;
  }

  const vec = await embedQuery(query);
  queryEmbeddingCache.set(normalised, vec);

  // Evict oldest if over limit
  if (queryEmbeddingCache.size > CACHE_MAX) {
    const oldest = queryEmbeddingCache.keys().next().value;
    if (oldest != null) queryEmbeddingCache.delete(oldest);
  }

  return vec;
}

// --- Init ---

export async function initEmbeddingModel(modelId?: string, device?: string): Promise<void> {
  if (embeddingModelReady) return;
  return new Promise((resolve, reject) => {
    const w = getEmbeddingWorker();
    const handler = (e: MessageEvent<EmbeddingWorkerOutMessage>) => {
      if (e.data.type === 'model-ready') {
        w.removeEventListener('message', handler);
        embeddingModelReady = true;
        resolve();
      } else if (e.data.type === 'model-error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({
      type: 'load-model',
      modelId: modelId ?? DEFAULT_EMBEDDING_MODEL.id,
      device: device ?? 'webgpu',
      dtype: DEFAULT_EMBEDDING_MODEL.dtype,
    });
  });
}

// --- Document ingestion ---

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

// --- RAG query ---

/**
 * Determines whether RAG mode should be used based on document token count.
 * Short documents (< 3000 tokens) use simple context stuffing.
 */
export function shouldUseRAG(documentTokens: number): boolean {
  return documentTokens > 3000;
}

/**
 * Build multi-turn chat history string within a token budget.
 * Returns the serialized history and token count used.
 */
function buildHistoryContext(
  history: ChatMessage[],
  maxTokens: number,
  maxTurns: number,
): { historyText: string; historyTokens: number } {
  if (history.length === 0 || maxTokens <= 0 || maxTurns <= 0) {
    return { historyText: '', historyTokens: 0 };
  }

  // Take the most recent turns (pairs of user+assistant)
  const recentMessages: ChatMessage[] = [];
  let turns = 0;
  for (let i = history.length - 1; i >= 0 && turns < maxTurns; i--) {
    recentMessages.unshift(history[i]);
    if (history[i].role === 'user') turns++;
  }

  // Build text within budget
  const parts: string[] = [];
  let usedTokens = 0;
  for (const msg of recentMessages) {
    const line = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`;
    const tokens = estimateTokens(line);
    if (usedTokens + tokens > maxTokens) break;
    parts.push(line);
    usedTokens += tokens;
  }

  return {
    historyText: parts.length > 0 ? `Previous conversation:\n${parts.join('\n\n')}` : '',
    historyTokens: usedTokens,
  };
}

/**
 * Fit retrieved chunks into a context token budget, sorted by page order.
 */
function fitChunksToContext(
  sources: SearchResult[],
  maxTokens: number,
): { context: string; includedSources: SearchResult[]; contextTokens: number } {
  // Sort by page order for coherent reading
  const sorted = [...sources].sort((a, b) => {
    if (a.chunk.documentId !== b.chunk.documentId) return a.chunk.documentId - b.chunk.documentId;
    return a.chunk.startPage - b.chunk.startPage;
  });

  const included: SearchResult[] = [];
  const parts: string[] = [];
  let usedTokens = 0;

  for (const source of sorted) {
    const annotated = `[Source ${included.length + 1} | Pages ${source.chunk.startPage}-${source.chunk.endPage}]\n${source.chunk.text}`;
    const tokens = estimateTokens(annotated);
    if (usedTokens + tokens > maxTokens) break;
    parts.push(annotated);
    included.push(source);
    usedTokens += tokens;
  }

  return {
    context: parts.join('\n\n---\n\n'),
    includedSources: included,
    contextTokens: usedTokens,
  };
}

export async function queryRAG(
  question: string,
  domain: Domain,
  storage: StorageAdapter,
  documentId?: number,
  options?: Partial<RAGOptions>,
  chatHistory?: ChatMessage[],
): Promise<RAGResult> {
  const opts: RAGOptions = { ...DEFAULT_RAG_OPTIONS, ...options };
  if (documentId != null) opts.documentId = documentId;

  await initEmbeddingModel();

  const retrievalStart = performance.now();
  const queryVector = await getCachedQueryEmbedding(question);
  const allSources = await searchSimilar(storage, queryVector, {
    topK: opts.topK,
    documentId: opts.documentId,
    threshold: opts.similarityThreshold,
  });
  const retrievalTimeMs = Math.round(performance.now() - retrievalStart);

  // Determine context token budget
  let retrievalBudget = opts.maxContextTokens;
  let historyText = '';

  if (opts.includeHistory && chatHistory && chatHistory.length > 0) {
    const historyBudget = Math.floor(opts.maxContextTokens * 0.3);
    retrievalBudget = opts.maxContextTokens - historyBudget;
    const result = buildHistoryContext(chatHistory, historyBudget, opts.maxHistoryTurns);
    historyText = result.historyText;
    // Reclaim unused history budget for retrieval
    retrievalBudget += (historyBudget - result.historyTokens);
  }

  const { includedSources, contextTokens } = fitChunksToContext(allSources, retrievalBudget);

  // Build the final prompt
  let prompt: string;
  if (includedSources.length > 0) {
    const ragPrompt = buildRAGPrompt(
      question,
      includedSources.map((s, i) => ({
        text: s.chunk.text,
        score: s.score,
        startPage: s.chunk.startPage,
        endPage: s.chunk.endPage,
        sourceIndex: i + 1,
      })),
      domain,
    );
    prompt = historyText ? `${historyText}\n\n${ragPrompt}` : ragPrompt;
  } else {
    // No sources found — tell the model
    prompt = `You are DocIntel, a document analysis assistant. The user asked: "${question}"\n\nNo relevant document sections were found. Let the user know that you couldn't find matching content in the loaded documents.`;
    if (historyText) {
      prompt = `${historyText}\n\n${prompt}`;
    }
  }

  return {
    prompt,
    sources: includedSources,
    retrievalTimeMs,
    contextTokens,
    mode: 'rag',
  };
}
