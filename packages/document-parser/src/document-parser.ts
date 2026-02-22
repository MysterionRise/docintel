import type { ParsedDocument, ParsedPage, PDFMetadata } from './types';
import { parseDocument, getFullText } from './pdf-parser';
import { ocrImage, initOCR } from './ocr-engine';

const SUPPORTED_PDF = ['application/pdf'];
const SUPPORTED_IMAGE = ['image/png', 'image/jpeg', 'image/tiff'];
const SUPPORTED_TEXT = ['text/plain', 'text/markdown'];

export class DocumentParser {
  async parseFile(
    file: File,
    onProgress?: (status: string, page: number, total: number) => void,
  ): Promise<ParsedDocument> {
    const type = file.type || this.inferType(file.name);

    if (SUPPORTED_PDF.includes(type)) {
      return this.parsePDFFile(file, onProgress);
    }

    if (SUPPORTED_IMAGE.includes(type)) {
      return this.parseImageFile(file, onProgress);
    }

    if (SUPPORTED_TEXT.includes(type) || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      return this.parseTextFile(file);
    }

    throw new Error(`Unsupported file type: ${type || file.name.split('.').pop()}`);
  }

  private async parsePDFFile(
    file: File,
    onProgress?: (status: string, page: number, total: number) => void,
  ): Promise<ParsedDocument> {
    const doc = await parseDocument(file, (page, total) => {
      onProgress?.('parsing', page, total);
    });

    // If scanned, run OCR on pages without text
    const needsOCR = doc.pages.some((p) => !p.hasTextLayer);
    if (needsOCR) {
      await initOCR();
      const { parsePDFToImages } = await import('./pdf-to-images');
      const images = await parsePDFToImages(file);

      for (let i = 0; i < doc.pages.length; i++) {
        if (!doc.pages[i].hasTextLayer && images[i]) {
          onProgress?.('ocr', i + 1, doc.pages.length);
          const ocrText = await ocrImage(images[i]);
          doc.pages[i] = {
            ...doc.pages[i],
            text: ocrText,
            hasTextLayer: false, // Still marked as OCR'd
          };
        }
      }

      // Update extraction method
      const allOCR = doc.pages.every((p) => !p.hasTextLayer);
      doc.extractionMethod = allOCR ? 'ocr' : 'mixed';
    }

    return doc;
  }

  private async parseImageFile(
    file: File,
    onProgress?: (status: string, page: number, total: number) => void,
  ): Promise<ParsedDocument> {
    onProgress?.('ocr', 1, 1);
    await initOCR();
    const text = await ocrImage(file);

    const page: ParsedPage = {
      pageNumber: 1,
      text,
      width: 0,
      height: 0,
      hasTextLayer: false,
      textItems: [],
    };

    const metadata: PDFMetadata = {
      pageCount: 1,
      isScanned: true,
      fileSize: file.size,
    };

    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      totalPages: 1,
      pages: [page],
      metadata,
      extractionMethod: 'ocr',
    };
  }

  private async parseTextFile(file: File): Promise<ParsedDocument> {
    const text = await file.text();

    const page: ParsedPage = {
      pageNumber: 1,
      text,
      width: 0,
      height: 0,
      hasTextLayer: true,
      textItems: [],
    };

    const metadata: PDFMetadata = {
      pageCount: 1,
      isScanned: false,
      fileSize: file.size,
    };

    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      totalPages: 1,
      pages: [page],
      metadata,
      extractionMethod: 'text-layer',
    };
  }

  getFullText(doc: ParsedDocument): string {
    return getFullText(doc);
  }

  getPageRangeText(doc: ParsedDocument, start: number, end: number): string {
    return doc.pages
      .filter((p) => p.pageNumber >= start && p.pageNumber <= end)
      .map((p) => p.text)
      .join('\n\n');
  }

  private inferType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      txt: 'text/plain',
      md: 'text/markdown',
    };
    return map[ext ?? ''] ?? '';
  }
}
