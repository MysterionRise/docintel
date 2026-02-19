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

export interface StorageAdapter {
  addDocument(doc: { name: string; domain: Domain; rawText: string; pageCount: number; fileSize: number; uploadedAt: number }): Promise<number>;
  getDocument(id: number): Promise<{ id?: number; name: string; domain: Domain; rawText: string; pageCount: number; fileSize: number; uploadedAt: number } | undefined>;
  addChunk(chunk: { documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number }): Promise<number>;
  getChunk(id: number): Promise<{ id?: number; documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number } | undefined>;
  getChunks(query: { documentId?: number }): Promise<Array<{ id?: number; documentId: number; index: number; text: string; startPage: number; endPage: number; tokenCount: number }>>;
  addEmbedding(chunkId: number, documentId: number, vector: Float32Array): Promise<void>;
  getEmbeddings(documentId?: number): Promise<Array<{ chunkId: number; documentId: number; vector: Float32Array }>>;
}
