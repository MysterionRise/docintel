# Plan: Embedding Engine & Vector Store

## Goal
Build a browser-based embedding pipeline and vector store using IndexedDB, enabling semantic search across document chunks. This is the foundation for RAG.

## Package
`packages/ai-engine` (embedding worker, vector store) + `packages/document-parser` (chunker) + `apps/web` (UI)

## Dependencies
- Plan 01 (Project Scaffolding) complete
- Plan 03 (PDF Parsing) complete

## Tasks

### 1. Build embedding Web Worker (`packages/ai-engine/src/workers/embedding.worker.ts`)
Dedicated worker for computing embeddings (separate from inference worker):

```typescript
import { pipeline } from '@huggingface/transformers';

let embedder: any = null;

export type EmbeddingWorkerInMessage =
  | { type: 'load-model'; modelId: string; device: string }
  | { type: 'embed-texts'; texts: string[]; metadata: Array<Record<string, any>> }
  | { type: 'embed-query'; query: string };

export type EmbeddingWorkerOutMessage =
  | { type: 'model-progress'; progress: number; status: string }
  | { type: 'model-ready' }
  | { type: 'embeddings-complete'; embeddings: number[][]; metadata: Array<Record<string, any>> }
  | { type: 'query-embedding'; embedding: number[] }
  | { type: 'error'; error: string };

self.onmessage = async (e: MessageEvent<EmbeddingWorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'load-model') {
    try {
      embedder = await pipeline('feature-extraction', msg.modelId, {
        device: msg.device,
        dtype: msg.device === 'webgpu' ? 'fp16' : 'q8',
        progress_callback: (p: any) => {
          self.postMessage({ type: 'model-progress', progress: p.progress ?? 0, status: p.status ?? '' });
        },
      });
      self.postMessage({ type: 'model-ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }

  if (msg.type === 'embed-texts' && embedder) {
    try {
      const BATCH_SIZE = 8;
      const allEmbeddings: number[][] = [];
      for (let i = 0; i < msg.texts.length; i += BATCH_SIZE) {
        const batch = msg.texts.slice(i, i + BATCH_SIZE);
        const output = await embedder(batch, { pooling: 'mean', normalize: true });
        allEmbeddings.push(...output.tolist());
      }
      self.postMessage({ type: 'embeddings-complete', embeddings: allEmbeddings, metadata: msg.metadata });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }

  if (msg.type === 'embed-query' && embedder) {
    try {
      const output = await embedder([msg.query], { pooling: 'mean', normalize: true });
      self.postMessage({ type: 'query-embedding', embedding: output.tolist()[0] });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
};
```

Embedding model configs in `packages/ai-engine/src/constants.ts`:
```typescript
export const EMBEDDING_MODELS = {
  JINA_V2_BASE: {
    id: 'Xenova/jina-embeddings-v2-base-en',
    dimensions: 768,
    sizeBytes: 135_000_000,
    maxTokens: 8192,
    label: 'Jina v2 Base (Recommended)',
  },
  GTE_SMALL: {
    id: 'Xenova/gte-small',
    dimensions: 384,
    sizeBytes: 67_000_000,
    maxTokens: 512,
    label: 'GTE Small (Faster, lower quality)',
  },
  MXBAI_EMBED_XSMALL: {
    id: 'mixedbread-ai/mxbai-embed-xsmall-v1',
    dimensions: 384,
    sizeBytes: 45_000_000,
    maxTokens: 512,
    label: 'MxBai XSmall (Smallest)',
  },
} as const;
```

### 2. Build smart text chunker (`packages/document-parser/src/chunker.ts`)
Intelligent text chunking with sentence awareness and metadata:

```typescript
export interface TextChunk {
  id: string;
  documentId: string;
  text: string;
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  metadata: {
    section?: string;
    pageRange: [number, number];
    tokenEstimate: number;
  };
}

export interface ChunkerOptions {
  targetSize: number;        // ~1800 chars ≈ 512 tokens
  overlap: number;           // 0.0 - 0.3
  respectSentences: boolean;
  respectPages: boolean;
}

export class SmartChunker {
  constructor(private options?: Partial<ChunkerOptions>);
  chunkDocument(pages: Array<{ pageNumber: number; text: string }>): TextChunk[];
}
```

Key logic:
- Split on sentence boundaries (regex: `/[^.!?]*[.!?]+\s*|[^.!?]+$/g`)
- Accumulate sentences until target size
- When chunk is full, emit and start new with overlap
- Preserve page number metadata per chunk
- Generate UUID for each chunk

### 3. Build vector store (`packages/ai-engine/src/vector-store.ts`)
IndexedDB-backed vector storage with cosine similarity search:

```typescript
import Dexie from 'dexie';

export interface VectorRecord {
  id: string;
  documentId: string;
  chunkText: string;
  embedding: number[];
  pageNumber: number;
  metadata: Record<string, any>;
}

export class VectorStore {
  async addVectors(records: VectorRecord[]): Promise<void>;
  async removeDocument(documentId: string): Promise<void>;
  async search(queryEmbedding: number[], options?: {
    topK?: number;
    documentId?: string;
    threshold?: number;
  }): Promise<Array<VectorRecord & { score: number }>>;
  async getCount(documentId?: string): Promise<number>;
  async getDocumentIds(): Promise<string[]>;
}
```

Cosine similarity computed in pure JS:
```typescript
private cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### 4. Build document processor (`packages/ai-engine/src/document-processor.ts`)
Orchestrates: parse → chunk → embed → store

```typescript
import { SmartChunker, type ParsedDocument } from '@docintel/document-parser';

export class DocumentProcessor {
  async processDocument(
    document: ParsedDocument,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<{ chunkCount: number; processingTimeMs: number }>;
}
```

Steps:
1. Chunk via SmartChunker (from document-parser package)
2. Embed via embedding worker (batched)
3. Store in VectorStore (IndexedDB)

### 5. Update package exports
`packages/ai-engine/src/index.ts` — add:
```typescript
export { VectorStore, type VectorRecord } from './vector-store';
export { DocumentProcessor } from './document-processor';
```

`packages/document-parser/src/index.ts` — add:
```typescript
export { SmartChunker, type TextChunk, type ChunkerOptions } from './chunker';
```

### 6. Build processing progress UI (`apps/web/src/components/document/ProcessingProgress.tsx`)
Shows multi-stage processing progress:
- Stage indicators: Parsing ✓ → Chunking ✓ → Embedding (3/47) → Ready
- Per-stage progress bars
- Estimated time remaining
- Chunk count after completion

### 7. Build useEmbedding hook (`apps/web/src/hooks/useEmbedding.ts`)
```typescript
// Returns: { loadModel, embedTexts, embedQuery, isReady, progress }
```

### 8. Auto-process on upload
When a user uploads a document, auto-trigger chunking + embedding in background.

### 9. Write tests
`packages/ai-engine/src/__tests__/vector-store.test.ts`:
- Insert and retrieve vectors
- Cosine similarity ordering
- Top-K, threshold, document filter
- Deletion

`packages/document-parser/src/__tests__/chunker.test.ts`:
- Chunks don't exceed target size
- Overlap exists between consecutive chunks
- Sentences are not split mid-word
- Page boundaries respected
- Edge cases: empty pages, single-page docs

## Acceptance Criteria
- [ ] Embedding model loads in worker with progress
- [ ] Smart chunking produces ~512-token chunks with sentence awareness
- [ ] Embeddings computed for all chunks (batched, no OOM)
- [ ] Vector store persists in IndexedDB across refreshes
- [ ] Cosine similarity search returns relevant results
- [ ] Full pipeline works for a 50-page PDF in < 120s
- [ ] Both embedding model and LLM can coexist without crashing
- [ ] Cross-package imports work (`@docintel/document-parser` chunker used by `@docintel/ai-engine`)
- [ ] Tests pass in both packages
