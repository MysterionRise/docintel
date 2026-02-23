import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedDocument, ParsedPDF } from '../types';

// Mock pdfjs-dist at module level to avoid DOMMatrix / browser-only issues
vi.mock('pdfjs-dist', () => {
  const makeTextItem = (str: string) => ({
    str,
    transform: [1, 0, 0, 1, 10, 20],
    width: 100,
    height: 12,
  });

  let mockPages: Array<{ items: Array<ReturnType<typeof makeTextItem>> }> = [];
  let mockNumPages = 1;
  let mockMetadata: Record<string, string> = {};
  let mockShouldFail = false;
  let mockFailMessage = '';

  return {
    __setMockPages: (pages: Array<{ items: Array<{ str: string; transform: number[]; width: number; height: number }> }>) => {
      mockPages = pages;
      mockNumPages = pages.length;
    },
    __setMockMetadata: (meta: Record<string, string>) => {
      mockMetadata = meta;
    },
    __setMockFailure: (shouldFail: boolean, message: string = 'Generic PDF error') => {
      mockShouldFail = shouldFail;
      mockFailMessage = message;
    },
    __reset: () => {
      mockPages = [{ items: [makeTextItem('Default page text content here')] }];
      mockNumPages = 1;
      mockMetadata = {};
      mockShouldFail = false;
      mockFailMessage = '';
    },
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: () => ({
      promise: mockShouldFail
        ? Promise.reject(new Error(mockFailMessage))
        : Promise.resolve({
            numPages: mockNumPages,
            getPage: async (num: number) => ({
              getTextContent: async () => ({
                items: mockPages[num - 1]?.items ?? [],
              }),
              getViewport: () => ({ width: 612, height: 792 }),
            }),
            getMetadata: async () => ({
              info: mockMetadata,
            }),
          }),
    }),
    default: {},
  };
});

// Also mock the worker URL import
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'mock-worker-url',
}));

// Now import the module under test (after mocks are set up)
const pdfjsMock = await import('pdfjs-dist') as unknown as {
  __setMockPages: (pages: Array<{ items: Array<{ str: string; transform: number[]; width: number; height: number }> }>) => void;
  __setMockMetadata: (meta: Record<string, string>) => void;
  __setMockFailure: (shouldFail: boolean, message?: string) => void;
  __reset: () => void;
};
const { parseDocument, parsePDF, isScannedPDF, getFullText, getPageRangeText } = await import('../pdf-parser');

function makeFile(name: string, size: number = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type: 'application/pdf' });
}

function makeTextItem(str: string) {
  return {
    str,
    transform: [1, 0, 0, 1, 10, 20],
    width: 100,
    height: 12,
  };
}

describe('parseDocument (enhanced API)', () => {
  beforeEach(() => {
    pdfjsMock.__reset();
  });

  it('parses a single-page PDF with text layer', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Hello world from PDF')] },
    ]);

    const file = makeFile('test.pdf');
    const doc = await parseDocument(file);

    expect(doc.fileName).toBe('test.pdf');
    expect(doc.totalPages).toBe(1);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].text).toBe('Hello world from PDF');
    expect(doc.pages[0].hasTextLayer).toBe(true);
    expect(doc.extractionMethod).toBe('text-layer');
  });

  it('parses multi-page PDFs', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Page one content that is long enough')] },
      { items: [makeTextItem('Page two content that is long enough')] },
      { items: [makeTextItem('Page three content that is long enough')] },
    ]);

    const file = makeFile('multi.pdf');
    const doc = await parseDocument(file);

    expect(doc.totalPages).toBe(3);
    expect(doc.pages).toHaveLength(3);
    expect(doc.pages[0].pageNumber).toBe(1);
    expect(doc.pages[1].pageNumber).toBe(2);
    expect(doc.pages[2].pageNumber).toBe(3);
  });

  it('calls progress callback for each page', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Page 1 with enough text here')] },
      { items: [makeTextItem('Page 2 with enough text here')] },
    ]);

    const progress = vi.fn();
    const file = makeFile('progress.pdf');
    await parseDocument(file, progress);

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(1, 2);
    expect(progress).toHaveBeenCalledWith(2, 2);
  });

  it('extracts metadata (title, author, creationDate)', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Content with enough characters for text layer')] },
    ]);
    pdfjsMock.__setMockMetadata({
      Title: 'My Document',
      Author: 'Jane Doe',
      CreationDate: '2024-01-15',
    });

    const file = makeFile('meta.pdf');
    const doc = await parseDocument(file);

    expect(doc.metadata.title).toBe('My Document');
    expect(doc.metadata.author).toBe('Jane Doe');
    expect(doc.metadata.creationDate).toBe('2024-01-15');
  });

  it('detects scanned pages (no text layer)', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('')] }, // empty = scanned
    ]);

    const file = makeFile('scanned.pdf');
    const doc = await parseDocument(file);

    expect(doc.pages[0].hasTextLayer).toBe(false);
    expect(doc.metadata.isScanned).toBe(true);
    expect(doc.extractionMethod).toBe('ocr');
  });

  it('detects mixed extraction method', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('This page has enough real text content')] },
      { items: [makeTextItem('')] }, // scanned
    ]);

    const file = makeFile('mixed.pdf');
    const doc = await parseDocument(file);

    expect(doc.extractionMethod).toBe('mixed');
  });

  it('throws user-friendly error for password-protected PDFs', async () => {
    pdfjsMock.__setMockFailure(true, 'No password given, the PDF is password-protected');

    const file = makeFile('locked.pdf');
    await expect(parseDocument(file)).rejects.toThrow(
      'This PDF is password-protected. Please unlock it before uploading.',
    );
  });

  it('throws wrapped error for corrupt PDFs', async () => {
    pdfjsMock.__setMockFailure(true, 'Invalid PDF structure');

    const file = makeFile('corrupt.pdf');
    await expect(parseDocument(file)).rejects.toThrow('Failed to parse PDF: Invalid PDF structure');
  });

  it('includes fileSize in metadata', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Some text content for size test here')] },
    ]);

    const file = makeFile('sized.pdf', 5000);
    const doc = await parseDocument(file);

    expect(doc.metadata.fileSize).toBe(5000);
  });

  it('generates a unique id', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Some text in this PDF document here')] },
    ]);

    const file = makeFile('unique.pdf');
    const doc1 = await parseDocument(file);
    const doc2 = await parseDocument(file);

    expect(doc1.id).toBeDefined();
    expect(doc2.id).toBeDefined();
    expect(doc1.id).not.toBe(doc2.id);
  });
});

describe('parsePDF (legacy API)', () => {
  beforeEach(() => {
    pdfjsMock.__reset();
  });

  it('returns text, pageCount, and pages', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('First page')] },
      { items: [makeTextItem('Second page')] },
    ]);

    const file = makeFile('legacy.pdf');
    const result = await parsePDF(file);

    expect(result.pageCount).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.text).toContain('First page');
    expect(result.text).toContain('Second page');
  });

  it('joins page texts with double newlines', async () => {
    pdfjsMock.__setMockPages([
      { items: [makeTextItem('Page A')] },
      { items: [makeTextItem('Page B')] },
    ]);

    const file = makeFile('join.pdf');
    const result = await parsePDF(file);

    expect(result.text).toBe('Page A\n\nPage B');
  });
});

describe('isScannedPDF', () => {
  it('returns true when text is very sparse', () => {
    const parsed: ParsedPDF = {
      text: '',
      pageCount: 5,
      pages: [
        { pageNumber: 1, text: '' },
        { pageNumber: 2, text: '' },
        { pageNumber: 3, text: 'hi' },
        { pageNumber: 4, text: '' },
        { pageNumber: 5, text: '' },
      ],
    };

    expect(isScannedPDF(parsed)).toBe(true);
  });

  it('returns false when pages have meaningful text', () => {
    const parsed: ParsedPDF = {
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        },
      ],
    };

    expect(isScannedPDF(parsed)).toBe(false);
  });
});

describe('getFullText', () => {
  it('joins all page texts', () => {
    const doc: ParsedDocument = {
      id: 'test-id',
      fileName: 'test.pdf',
      totalPages: 2,
      pages: [
        { pageNumber: 1, text: 'First', width: 612, height: 792, hasTextLayer: true, textItems: [] },
        { pageNumber: 2, text: 'Second', width: 612, height: 792, hasTextLayer: true, textItems: [] },
      ],
      metadata: { pageCount: 2, isScanned: false, fileSize: 100 },
      extractionMethod: 'text-layer',
    };

    expect(getFullText(doc)).toBe('First\n\nSecond');
  });
});

describe('getPageRangeText', () => {
  const doc: ParsedDocument = {
    id: 'test-id',
    fileName: 'test.pdf',
    totalPages: 4,
    pages: [
      { pageNumber: 1, text: 'Page1', width: 612, height: 792, hasTextLayer: true, textItems: [] },
      { pageNumber: 2, text: 'Page2', width: 612, height: 792, hasTextLayer: true, textItems: [] },
      { pageNumber: 3, text: 'Page3', width: 612, height: 792, hasTextLayer: true, textItems: [] },
      { pageNumber: 4, text: 'Page4', width: 612, height: 792, hasTextLayer: true, textItems: [] },
    ],
    metadata: { pageCount: 4, isScanned: false, fileSize: 100 },
    extractionMethod: 'text-layer',
  };

  it('returns text for a specific range', () => {
    expect(getPageRangeText(doc, 2, 3)).toBe('Page2\n\nPage3');
  });

  it('returns single page text', () => {
    expect(getPageRangeText(doc, 1, 1)).toBe('Page1');
  });

  it('returns all pages when range covers everything', () => {
    expect(getPageRangeText(doc, 1, 4)).toBe('Page1\n\nPage2\n\nPage3\n\nPage4');
  });
});
