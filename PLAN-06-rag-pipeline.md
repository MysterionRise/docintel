# Plan: RAG Pipeline Integration

## Goal
Connect the vector store to the inference engine for full Retrieval-Augmented Generation. User asks a question → relevant chunks are retrieved → context constructed → model generates answer with citations.

## Package
`packages/ai-engine` (RAG pipeline) + `apps/web` (citation UI, multi-doc)

## Dependencies
- Plan 02 (Inference), Plan 04 (Chat), Plan 05 (Embedding + Vector Store) complete

## Tasks

### 1. Build RAG pipeline orchestrator (`packages/ai-engine/src/rag-pipeline.ts`)

```typescript
export interface RAGOptions {
  topK: number;               // Default: 5
  maxContextTokens: number;   // Default: 2500
  similarityThreshold: number; // Default: 0.3
  documentIds?: string[];     // Filter to specific documents
  rerank: boolean;            // Default: false
}

export interface RAGResult {
  answer: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    pageNumber: number;
    text: string;
    score: number;
  }>;
  tokensUsed: number;
  retrievalTimeMs: number;
  generationTimeMs: number;
}

export class RAGPipeline {
  constructor(private vectorStore: VectorStore);

  async query(
    question: string,
    options?: Partial<RAGOptions>,
    onToken?: (token: string) => void
  ): Promise<RAGResult>;

  // Fit retrieved chunks into context budget, sorted by page order
  private fitChunksToContext(
    chunks: Array<VectorRecord & { score: number }>,
    maxTokens: number
  ): Array<VectorRecord & { score: number }>;
}
```

RAG prompt construction:
```typescript
const context = selectedChunks.map((chunk, i) =>
  `[Source ${i + 1}, Page ${chunk.pageNumber}]\n${chunk.chunkText}`
).join('\n\n---\n\n');

const messages = [
  {
    role: 'system',
    content: `You are DocIntel, an AI document analysis assistant running on-device. Answer questions using ONLY the provided source material. For each claim, cite the source number [Source N]. If the sources don't contain the answer, say "I couldn't find this information in the loaded documents."`,
  },
  {
    role: 'user',
    content: `Sources:\n${context}\n\nQuestion: ${question}\n\nAnswer with citations:`,
  },
];
```

### 2. Update ai-engine exports
```typescript
export { RAGPipeline, type RAGOptions, type RAGResult } from './rag-pipeline';
```

### 3. Update chat interface for RAG mode (`apps/web/src/hooks/useRAG.ts`)
```typescript
import { RAGPipeline, type RAGOptions } from '@docintel/ai-engine';

interface UseRAGReturn {
  query: (question: string, options?: Partial<RAGOptions>) => Promise<void>;
  streamingAnswer: string;
  citations: Citation[];
  isQuerying: boolean;
  abort: () => void;
  retrievalStats: { timeMs: number; chunksFound: number };
  mode: 'simple' | 'rag';
  setMode: (mode: 'simple' | 'rag') => void;
}
```

Auto-select mode:
- Document < 3000 tokens → simple mode
- Document > 3000 tokens OR multiple documents → RAG mode
- User can manually toggle

### 4. Build CitationPanel component (`apps/web/src/components/chat/CitationPanel.tsx`)
When answer contains [Source 1], [Source 2]:
- Parse citation references from generated text
- Clickable inline citation badges
- Side panel showing source chunk on click
- Source chunk highlighted in document viewer
- Each citation: document name, page number, relevance score, chunk text

### 5. Build RetrievedContext component (`apps/web/src/components/chat/RetrievedContext.tsx`)
Collapsible section showing:
- "Based on N sources from M documents"
- Expandable list of retrieved chunks with relevance scores
- Page numbers as clickable links
- Visual relevance bar (green/yellow/red)

### 6. Build multi-document query support
- Vector store already supports cross-document search
- Citations include document name
- User can filter: "Search only in Contract-A.pdf" vs "Search all"
- Document filter chips in chat input area

### 7. Implement multi-turn RAG
For follow-up questions:
- Include previous Q&A pairs in prompt (up to token budget)
- Re-retrieve for each new question
- Allocate: 70% context to retrieved chunks, 30% to chat history

### 8. Add "process all documents" pipeline (`apps/web/src/hooks/useDocumentProcessor.ts`)
```typescript
import { DocumentProcessor } from '@docintel/ai-engine';

// Orchestrates processing multiple documents
// Shows: "Document 1/5, Chunk 23/180"
// Returns: { processAll, processDocument, progress, isProcessing }
```

### 9. Performance optimization
- Cache query embeddings for repeated/similar questions
- Profile cosine similarity for large vector stores (>10K vectors)
- Consider WebGPU-accelerated similarity if vectors > 50K

### 10. Write tests (`packages/ai-engine/src/__tests__/rag-pipeline.test.ts`)
- Retrieval returns correct chunks (mock vector store)
- Context construction respects token budget
- Chunks sorted by page number in final prompt
- Multi-document citations include document ID
- Empty retrieval returns "not found" message

## Acceptance Criteria
- [ ] RAG query returns relevant chunks with correct page citations
- [ ] Citations in answers are clickable and link to source text
- [ ] Multi-document search works correctly
- [ ] Mode auto-selects between simple and RAG based on document size
- [ ] Multi-turn conversation maintains context
- [ ] Full RAG cycle completes in < 10s
- [ ] Retrieved chunks displayed with relevance scores
- [ ] Document filter works
- [ ] No hallucinated citations
- [ ] Tests pass
