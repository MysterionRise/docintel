# Plan: PDF Parsing & Document Intake Pipeline

## Goal
Build a drag-and-drop document upload system that extracts text from PDFs (including scanned/image PDFs via OCR), preserves page structure, and stores parsed documents in IndexedDB.

## Package
`packages/document-parser` (core logic) + `apps/web` (UI components)

## Dependencies
- Plan 01 (Project Scaffolding) must be complete

## Tasks

### 1. Build PDF parsing Web Worker (`packages/document-parser/src/workers/pdf.worker.ts`)
Run PDF.js in a dedicated worker to avoid blocking the UI:

```typescript
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// Message protocol (export types from packages/document-parser/src/types.ts)
export type PDFWorkerInMessage =
  | { type: 'parse-pdf'; fileBuffer: ArrayBuffer; fileName: string }
  | { type: 'parse-image'; imageBuffer: ArrayBuffer; fileName: string };

export type PDFWorkerOutMessage =
  | { type: 'parse-progress'; page: number; totalPages: number }
  | { type: 'parse-complete'; document: ParsedDocument }
  | { type: 'parse-error'; error: string }
  | { type: 'ocr-needed'; pageNumber: number };
```

Key implementation details:
- For each page, extract text content via `page.getTextContent()`
- Detect scanned pages: if a page has zero text items but has images, flag for OCR
- Preserve text item positions (x, y, width, height) for future highlighting
- Report progress per page

### 2. Define shared types (`packages/document-parser/src/types.ts`)
```typescript
export interface ParsedDocument {
  id: string;
  fileName: string;
  totalPages: number;
  pages: ParsedPage[];
  metadata: PDFMetadata;
  extractionMethod: 'text-layer' | 'ocr' | 'mixed';
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  hasTextLayer: boolean;
  textItems: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  creationDate?: string;
  pageCount: number;
  isScanned: boolean;
  fileSize: number;
}
```

### 3. Integrate Tesseract.js for OCR (`packages/document-parser/src/ocr-engine.ts`)
For scanned PDFs where `page.getTextContent()` returns empty:

```typescript
import { createWorker } from 'tesseract.js';

export class OCREngine {
  private worker: Tesseract.Worker | null = null;

  async initialize(onProgress?: (p: number) => void): Promise<void> {
    this.worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(m.progress);
        }
      },
    });
  }

  async recognizePage(imageData: ImageData | Blob): Promise<string> {
    if (!this.worker) throw new Error('OCR not initialized');
    const { data } = await this.worker.recognize(imageData);
    return data.text;
  }

  async terminate(): Promise<void> {
    await this.worker?.terminate();
  }
}
```

Integration with PDF worker:
- Render scanned PDF pages to canvas (via `page.render()`)
- Convert canvas to ImageData
- Pass to Tesseract.js for OCR
- Merge OCR text back into ParsedPage

### 4. Build document parser orchestrator (`packages/document-parser/src/document-parser.ts`)
High-level class that coordinates PDF worker and OCR:

```typescript
export class DocumentParser {
  async parseFile(file: File): Promise<ParsedDocument>;
  getFullText(doc: ParsedDocument): string;
  getPageRangeText(doc: ParsedDocument, start: number, end: number): string;
}
```

Supports:
- PDF: via PDF.js + optional OCR
- Images (PNG, JPG, TIFF): Direct OCR via Tesseract.js
- Plain text (.txt, .md): Direct ingestion

### 5. Export public API (`packages/document-parser/src/index.ts`)
```typescript
export { DocumentParser } from './document-parser';
export { OCREngine } from './ocr-engine';
export { SmartChunker } from './chunker';
export type { ParsedDocument, ParsedPage, PDFMetadata, TextChunk } from './types';
export type { PDFWorkerInMessage, PDFWorkerOutMessage } from './types';
```

### 6. Build document storage in IndexedDB (`packages/document-parser/src/document-store-db.ts`)
Using Dexie.js for persistent document storage:

```typescript
import Dexie from 'dexie';

export interface StoredDocument {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: Date;
  totalPages: number;
  extractionMethod: string;
  domain?: string;
  metadata: Record<string, any>;
}

export interface StoredPage {
  id?: number;
  documentId: string;
  pageNumber: number;
  text: string;
  hasTextLayer: boolean;
}

class DocIntelDB extends Dexie {
  documents!: Dexie.Table<StoredDocument, string>;
  pages!: Dexie.Table<StoredPage, number>;

  constructor() {
    super('DocIntelDB');
    this.version(1).stores({
      documents: 'id, fileName, uploadedAt, domain',
      pages: '++id, documentId, pageNumber',
    });
  }
}

export const db = new DocIntelDB();
```

### 7. Build DocumentUploader component (`apps/web/src/components/document/DocumentUploader.tsx`)
Drag-and-drop zone with:
- File type validation (PDF, PNG, JPG, TIFF, TXT)
- File size display
- Multiple file support (drag in a folder of invoices)
- Upload progress per file
- "Processing..." state with page-by-page progress
- Error handling (corrupt PDF, unsupported format)

Visual states:
1. Empty: dashed border, drag icon, "Drop PDFs or images here"
2. Dragging over: highlighted border, "Release to upload"
3. Processing: file list with progress bars per file
4. Complete: file list with checkmarks, ready for analysis

### 8. Build DocumentViewer component (`apps/web/src/components/document/DocumentViewer.tsx`)
Display the parsed document:
- Page thumbnails sidebar (scrollable, clickable)
- Main content area showing text per page
- Page navigation (prev/next, jump to page)
- Text search within document
- Highlight capability (for future risk clause highlighting)
- Metadata panel (title, pages, file size, extraction method)

### 9. Build document list/library (`apps/web/src/components/document/DocumentLibrary.tsx`)
Shows all uploaded documents:
- List or grid view
- Sort by name, date, domain
- Search/filter
- Delete document (removes from IndexedDB)
- Domain tag per document

### 10. Error handling
Build robust error handling for common issues:
- Encrypted/password-protected PDFs → show message, suggest unlocking first
- Corrupt PDFs → graceful failure with specific error
- Very large PDFs (>500 pages) → warn user, offer to process first N pages
- Memory pressure during OCR → process one page at a time

### 11. Write unit tests (`packages/document-parser/src/__tests__/`)
- `chunker.test.ts`: Chunk sizes, overlap, sentence boundaries
- `document-parser.test.ts`: File type detection, error handling
- `pdf-parser.test.ts`: Text extraction (mock PDF.js)

## Acceptance Criteria
- [ ] Drag-and-drop PDF upload works
- [ ] Text extraction from text-layer PDFs works correctly
- [ ] OCR works for scanned/image PDFs
- [ ] Multi-page PDFs show page-by-page progress
- [ ] Documents persist in IndexedDB across page refreshes
- [ ] Document library shows all uploaded documents
- [ ] Document viewer displays text per page with navigation
- [ ] `packages/document-parser` exports clean API consumed by `apps/web`
- [ ] Large PDFs (50+ pages) don't crash the browser
- [ ] Error states are user-friendly
- [ ] Unit tests pass
