import type { Domain } from './index';

export type { ParsedPDF, PageContent, ProcessingStatus } from '@docintel/document-parser';

export interface DocDocument {
  id?: number;
  name: string;
  domain: Domain;
  rawText: string;
  pageCount: number;
  fileSize: number;
  uploadedAt: number;
}

export interface DocChunk {
  id?: number;
  documentId: number;
  index: number;
  text: string;
  startPage: number;
  endPage: number;
  tokenCount: number;
}

export interface DocEmbedding {
  id?: number;
  chunkId: number;
  documentId: number;
  vector: Float32Array;
}
