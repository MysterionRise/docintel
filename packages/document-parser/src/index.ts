// Original API (PLAN-01)
export { parsePDF, isScannedPDF } from './pdf-parser';
export { parsePDFToImages } from './pdf-to-images';
export { ocrPDFPages, ocrImage, initOCR, terminateOCR } from './ocr-engine';
export { chunkText, SmartChunker, estimateTokens } from './chunker';
export type { SmartChunkResult, ChunkerOptions } from './chunker';

// Enhanced API (PLAN-03)
export { parseDocument, getFullText, getPageRangeText } from './pdf-parser';
export { DocumentParser } from './document-parser';

// Types
export type {
  ParsedPDF,
  PageContent,
  ProcessingStatus,
  ParsedDocument,
  ParsedPage,
  PDFMetadata,
  TextItem,
  TextChunk,
  PDFWorkerInMessage,
  PDFWorkerOutMessage,
} from './types';
