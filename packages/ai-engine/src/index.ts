export { ingestDocument, queryRAG, initEmbeddingModel, setEmbeddingWorkerFactory, shouldUseRAG } from './rag-pipeline';
export { cosineSimilarity, storeEmbedding, searchSimilar } from './vector-store';
export { getSystemPrompt, buildRAGPrompt, DOCUMENT_QA, DOCUMENT_SUMMARIZE, DOCUMENT_EXTRACT, DOCUMENT_RISKS } from './prompt-templates';
export type { PromptTemplate } from './prompt-templates';
export { detectCapabilities } from './gpu-monitor';
export { ModelManager } from './model-manager';
export { ContextManager } from './context-manager';
export { MODELS, EMBEDDING_MODELS, DEFAULT_EMBEDDING_MODEL, DEFAULT_GENERATION_CONFIG } from './constants';
export type { ModelConfig, EmbeddingModelConfig } from './constants';
export type { EmbeddingWorkerInMessage, EmbeddingWorkerOutMessage } from './workers/embedding.worker';
export { DEFAULT_RAG_OPTIONS } from './types';
export type {
  Domain,
  InferenceStatus,
  ChatMessage,
  ChunkCitation,
  ModelDownloadProgress,
  SearchResult,
  StorageAdapter,
  DeviceCapability,
  ModelStatus,
  GenerateOptions,
  GenerationStats,
  RAGOptions,
  RAGResult,
  InferenceWorkerInMessage,
  InferenceWorkerOutMessage,
} from './types';
