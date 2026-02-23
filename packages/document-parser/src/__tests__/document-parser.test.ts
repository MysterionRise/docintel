import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedDocument, ParsedPage, PDFMetadata } from '../types';

// Mock pdfjs-dist to prevent DOMMatrix browser-only error
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: Promise.resolve({}) }),
  default: {},
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'mock-worker-url',
}));

// Mock pdf-parser to control parseDocument and getFullText behavior
const mockParseDocument = vi.fn<(file: File, onProgress?: (page: number, total: number) => void) => Promise<ParsedDocument>>();
const mockGetFullText = vi.fn<(doc: ParsedDocument) => string>();

vi.mock('../pdf-parser', () => ({
  parseDocument: (...args: unknown[]) => mockParseDocument(...args as [File, ((page: number, total: number) => void)?]),
  getFullText: (...args: unknown[]) => mockGetFullText(...args as [ParsedDocument]),
}));

// Mock ocr-engine
const mockInitOCR = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockOcrImage = vi.fn<(data: File | Blob | string) => Promise<string>>().mockResolvedValue('OCR extracted text');

vi.mock('../ocr-engine', () => ({
  initOCR: (...args: unknown[]) => mockInitOCR(...(args as [])),
  ocrImage: (...args: unknown[]) => mockOcrImage(...(args as [File | Blob | string])),
}));

// Mock pdf-to-images
vi.mock('../pdf-to-images', () => ({
  parsePDFToImages: () => Promise.resolve([new Blob(['fake-image'])]),
}));

const { DocumentParser } = await import('../document-parser');

function makeParsedDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  const page: ParsedPage = {
    pageNumber: 1,
    text: 'Default text content',
    width: 612,
    height: 792,
    hasTextLayer: true,
    textItems: [],
  };
  const metadata: PDFMetadata = {
    pageCount: 1,
    isScanned: false,
    fileSize: 1024,
  };
  return {
    id: 'test-id',
    fileName: 'test.pdf',
    totalPages: 1,
    pages: [page],
    metadata,
    extractionMethod: 'text-layer',
    ...overrides,
  };
}

describe('DocumentParser', () => {
  let parser: InstanceType<typeof DocumentParser>;

  beforeEach(() => {
    parser = new DocumentParser();
    vi.clearAllMocks();
    mockParseDocument.mockResolvedValue(makeParsedDoc());
    mockGetFullText.mockReturnValue('Full document text');
  });

  describe('parseFile — file type routing', () => {
    it('routes PDF files to PDF parser', async () => {
      const file = new File(['data'], 'contract.pdf', { type: 'application/pdf' });
      await parser.parseFile(file);

      expect(mockParseDocument).toHaveBeenCalledWith(file, expect.any(Function));
    });

    it('routes PNG images to OCR', async () => {
      const file = new File(['data'], 'scan.png', { type: 'image/png' });
      const result = await parser.parseFile(file);

      expect(mockInitOCR).toHaveBeenCalled();
      expect(mockOcrImage).toHaveBeenCalledWith(file);
      expect(result.extractionMethod).toBe('ocr');
    });

    it('routes JPEG images to OCR', async () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const result = await parser.parseFile(file);

      expect(mockInitOCR).toHaveBeenCalled();
      expect(mockOcrImage).toHaveBeenCalledWith(file);
      expect(result.extractionMethod).toBe('ocr');
    });

    it('routes plain text files to text parser', async () => {
      const file = new File(['Hello plain text'], 'notes.txt', { type: 'text/plain' });
      const result = await parser.parseFile(file);

      expect(result.extractionMethod).toBe('text-layer');
      expect(result.pages[0].text).toBe('Hello plain text');
      expect(result.pages[0].hasTextLayer).toBe(true);
    });

    it('routes markdown files to text parser', async () => {
      const file = new File(['# Heading'], 'readme.md', { type: 'text/markdown' });
      const result = await parser.parseFile(file);

      expect(result.pages[0].text).toBe('# Heading');
    });

    it('infers type from .txt extension when MIME is empty', async () => {
      const file = new File(['Inferred text'], 'notes.txt', { type: '' });
      const result = await parser.parseFile(file);

      expect(result.extractionMethod).toBe('text-layer');
      expect(result.pages[0].text).toBe('Inferred text');
    });

    it('infers type from .md extension when MIME is empty', async () => {
      const file = new File(['# Title'], 'doc.md', { type: '' });
      const result = await parser.parseFile(file);

      expect(result.pages[0].text).toBe('# Title');
    });

    it('throws for unsupported file types', async () => {
      const file = new File(['data'], 'archive.zip', { type: 'application/zip' });
      await expect(parser.parseFile(file)).rejects.toThrow('Unsupported file type');
    });

    it('includes extension in error for unknown files with no MIME', async () => {
      const file = new File(['data'], 'data.xyz', { type: '' });
      await expect(parser.parseFile(file)).rejects.toThrow('xyz');
    });
  });

  describe('parseFile — progress callbacks', () => {
    it('forwards progress callback for PDF parsing', async () => {
      // Make parseDocument invoke the callback
      mockParseDocument.mockImplementation(async (_file, onProgress) => {
        onProgress?.(1, 3);
        onProgress?.(2, 3);
        onProgress?.(3, 3);
        return makeParsedDoc();
      });

      const progress = vi.fn();
      const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
      await parser.parseFile(file, progress);

      expect(progress).toHaveBeenCalledWith('parsing', 1, 3);
      expect(progress).toHaveBeenCalledWith('parsing', 2, 3);
      expect(progress).toHaveBeenCalledWith('parsing', 3, 3);
    });

    it('sends OCR progress for image files', async () => {
      const progress = vi.fn();
      const file = new File(['data'], 'scan.png', { type: 'image/png' });
      await parser.parseFile(file, progress);

      expect(progress).toHaveBeenCalledWith('ocr', 1, 1);
    });
  });

  describe('parseFile — OCR fallback for scanned PDFs', () => {
    it('runs OCR on pages without text layer', async () => {
      mockParseDocument.mockResolvedValue(
        makeParsedDoc({
          pages: [
            {
              pageNumber: 1,
              text: '',
              width: 612,
              height: 792,
              hasTextLayer: false,
              textItems: [],
            },
          ],
        }),
      );

      const file = new File(['data'], 'scanned.pdf', { type: 'application/pdf' });
      const result = await parser.parseFile(file);

      expect(mockInitOCR).toHaveBeenCalled();
      expect(mockOcrImage).toHaveBeenCalled();
      expect(result.extractionMethod).toBe('ocr');
    });
  });

  describe('parseFile — text file handling', () => {
    it('returns correct metadata for text files', async () => {
      const content = 'Simple text content';
      const file = new File([content], 'doc.txt', { type: 'text/plain' });
      const result = await parser.parseFile(file);

      expect(result.metadata.pageCount).toBe(1);
      expect(result.metadata.isScanned).toBe(false);
      expect(result.totalPages).toBe(1);
      expect(result.fileName).toBe('doc.txt');
    });
  });

  describe('getFullText', () => {
    it('delegates to pdf-parser getFullText', () => {
      const doc = makeParsedDoc();
      parser.getFullText(doc);
      expect(mockGetFullText).toHaveBeenCalledWith(doc);
    });
  });

  describe('getPageRangeText', () => {
    it('returns text for specified page range', () => {
      const doc = makeParsedDoc({
        totalPages: 3,
        pages: [
          { pageNumber: 1, text: 'Page1', width: 612, height: 792, hasTextLayer: true, textItems: [] },
          { pageNumber: 2, text: 'Page2', width: 612, height: 792, hasTextLayer: true, textItems: [] },
          { pageNumber: 3, text: 'Page3', width: 612, height: 792, hasTextLayer: true, textItems: [] },
        ],
      });

      const result = parser.getPageRangeText(doc, 2, 3);
      expect(result).toBe('Page2\n\nPage3');
    });

    it('returns empty string when range matches no pages', () => {
      const doc = makeParsedDoc();
      const result = parser.getPageRangeText(doc, 10, 20);
      expect(result).toBe('');
    });
  });
});
