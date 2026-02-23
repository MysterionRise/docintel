export type Domain = 'contracts' | 'medical' | 'financial' | 'legal';

export type InferenceStatus =
  | 'idle'
  | 'loading_tokenizer'
  | 'loading_model'
  | 'downloading'
  | 'ready'
  | 'generating'
  | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  citations?: ChunkCitation[];
}

export interface ChunkCitation {
  chunkId: number;
  text: string;
  score: number;
  startPage?: number;
  endPage?: number;
}

export interface ModelDownloadProgress {
  loaded: number;
  total: number;
  name: string;
}

export interface SearchResult {
  chunk: {
    id?: number;
    documentId: number;
    index: number;
    text: string;
    startPage: number;
    endPage: number;
    tokenCount: number;
  };
  score: number;
}

// GPU capability detection
export interface DeviceCapability {
  hasWebGPU: boolean;
  hasFp16: boolean;
  adapterInfo: GPUAdapterInfo | null;
  estimatedVRAM: 'high' | 'medium' | 'low' | 'unknown';
  recommendedModel: string;
  recommendedDtype: string;
  recommendedDevice: 'webgpu' | 'wasm';
}

// Model status
export interface ModelStatus {
  loaded: boolean;
  modelId: string | null;
  device: 'webgpu' | 'wasm' | null;
  loadTimeMs: number | null;
}

// Generation options
export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  doSample?: boolean;
}

// Generation stats
export interface GenerationStats {
  tokensGenerated: number;
  tokensPerSecond: number;
  totalTimeMs: number;
}

// Worker message protocol (main thread → worker)
export type InferenceWorkerInMessage =
  | { type: 'load-model'; modelId: string; dtype: string; device: string }
  | { type: 'generate'; messages: Array<{ role: string; content: string }>; maxTokens: number; temperature?: number; topP?: number }
  | { type: 'abort' }
  | { type: 'unload' };

// Worker message protocol (worker → main thread)
export type InferenceWorkerOutMessage =
  | { type: 'model-progress'; progress: number; status: string; loaded: number; total: number; file: string }
  | { type: 'model-ready'; modelId: string; loadTimeMs: number }
  | { type: 'model-error'; error: string }
  | { type: 'token'; text: string }
  | { type: 'generation-done'; fullText: string; tokensGenerated: number; tokensPerSecond: number }
  | { type: 'status'; status: InferenceStatus };

// RAG pipeline options
export interface RAGOptions {
  topK: number;
  maxContextTokens: number;
  similarityThreshold: number;
  documentId?: number;
  includeHistory: boolean;
  maxHistoryTurns: number;
}

export const DEFAULT_RAG_OPTIONS: RAGOptions = {
  topK: 5,
  maxContextTokens: 2500,
  similarityThreshold: 0.3,
  includeHistory: true,
  maxHistoryTurns: 3,
};

// RAG pipeline result
export interface RAGResult {
  prompt: string;
  sources: SearchResult[];
  retrievalTimeMs: number;
  contextTokens: number;
  mode: 'simple' | 'rag';
}

export interface StorageAdapter {
  addDocument(doc: { name: string; domain: Domain; rawText: string; pageCount: number; fileSize: number; uploadedAt: number }): Promise<number>;
  getDocument(id: number): Promise<{ id?: number; name: string; domain: Domain; rawText: string; pageCount: number; fileSize: number; uploadedAt: number } | undefined>;
  addChunk(chunk: { documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number }): Promise<number>;
  getChunk(id: number): Promise<{ id?: number; documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number } | undefined>;
  getChunks(query: { documentId?: number }): Promise<Array<{ id?: number; documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number }>>;
  addEmbedding(chunkId: number, documentId: number, vector: Float32Array): Promise<void>;
  getEmbeddings(documentId?: number): Promise<Array<{ chunkId: number; documentId: number; vector: Float32Array }>>;
}
