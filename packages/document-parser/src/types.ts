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
