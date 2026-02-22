// --- Existing types (preserved for backward compatibility) ---

export interface ParsedPDF {
  text: string;
  pageCount: number;
  pages: PageContent[];
}

export interface PageContent {
  pageNumber: number;
  text: string;
}

export type ProcessingStatus = 'idle' | 'parsing' | 'ocr' | 'chunking' | 'embedding' | 'done' | 'error';

// --- Enhanced types for PLAN-03 ---

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  hasTextLayer: boolean;
  textItems: TextItem[];
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  creationDate?: string;
  pageCount: number;
  isScanned: boolean;
  fileSize: number;
}

export interface ParsedDocument {
  id: string;
  fileName: string;
  totalPages: number;
  pages: ParsedPage[];
  metadata: PDFMetadata;
  extractionMethod: 'text-layer' | 'ocr' | 'mixed';
}

export interface TextChunk {
  text: string;
  startPage: number;
  endPage: number;
  tokenCount: number;
}

// Worker message types
export type PDFWorkerInMessage =
  | { type: 'parse-pdf'; fileBuffer: ArrayBuffer; fileName: string }
  | { type: 'parse-image'; imageBuffer: ArrayBuffer; fileName: string };

export type PDFWorkerOutMessage =
  | { type: 'parse-progress'; page: number; totalPages: number }
  | { type: 'parse-complete'; document: ParsedDocument }
  | { type: 'parse-error'; error: string }
  | { type: 'ocr-needed'; pageNumber: number };
