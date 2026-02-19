export { ingestDocument, queryRAG, initEmbeddingModel, setEmbeddingWorkerFactory } from './rag-pipeline';
export { cosineSimilarity, storeEmbedding, searchSimilar } from './vector-store';
export { getSystemPrompt, buildRAGPrompt } from './prompt-templates';
export type {
  Domain,
  InferenceStatus,
  ChatMessage,
  ChunkCitation,
  ModelDownloadProgress,
  SearchResult,
  StorageAdapter,
} from './types';
