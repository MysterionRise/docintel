import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedPDF, PageContent, ParsedDocument, ParsedPage, PDFMetadata, TextItem } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// --- Original API (preserved) ---

export async function parsePDF(file: File): Promise<ParsedPDF> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: PageContent[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push({ pageNumber: i, text });
  }

  const fullText = pages.map((p) => p.text).join('\n\n');

  return {
    text: fullText,
    pageCount: pdf.numPages,
    pages,
  };
}

export function isScannedPDF(parsed: ParsedPDF): boolean {
  const totalChars = parsed.pages.reduce((sum, p) => sum + p.text.trim().length, 0);
  return totalChars < parsed.pageCount * 50;
}

// --- Enhanced API (PLAN-03) ---

const MAX_PAGES_WARNING = 500;

export async function parseDocument(
  file: File,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new Error('This PDF is password-protected. Please unlock it before uploading.');
    }
    throw new Error(`Failed to parse PDF: ${msg}`);
  }

  if (pdf.numPages > MAX_PAGES_WARNING) {
    console.warn(`Large PDF detected: ${pdf.numPages} pages. Processing may be slow.`);
  }

  // Extract metadata
  let metaInfo: Record<string, string> = {};
  try {
    const meta = await pdf.getMetadata();
    metaInfo = (meta?.info as Record<string, string>) ?? {};
  } catch {
    // Metadata extraction is optional
  }

  const pages: ParsedPage[] = [];
  let hasAnyTextLayer = false;
  let hasAnyScannedPage = false;

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(i, pdf.numPages);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const textItems: TextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const tx = item.transform;
      textItems.push({
        text: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width,
        height: item.height,
      });
    }

    const text = textItems.map((t) => t.text).join(' ');
    const hasTextLayer = text.trim().length > 10;

    if (hasTextLayer) hasAnyTextLayer = true;
    else hasAnyScannedPage = true;

    pages.push({
      pageNumber: i,
      text,
      width: viewport.width,
      height: viewport.height,
      hasTextLayer,
      textItems,
    });
  }

  const isScanned = !hasAnyTextLayer;
  let extractionMethod: ParsedDocument['extractionMethod'];
  if (isScanned) extractionMethod = 'ocr';
  else if (hasAnyScannedPage) extractionMethod = 'mixed';
  else extractionMethod = 'text-layer';

  const metadata: PDFMetadata = {
    title: metaInfo['Title'] || undefined,
    author: metaInfo['Author'] || undefined,
    creationDate: metaInfo['CreationDate'] || undefined,
    pageCount: pdf.numPages,
    isScanned,
    fileSize: file.size,
  };

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    totalPages: pdf.numPages,
    pages,
    metadata,
    extractionMethod,
  };
}

export function getFullText(doc: ParsedDocument): string {
  return doc.pages.map((p) => p.text).join('\n\n');
}

export function getPageRangeText(doc: ParsedDocument, start: number, end: number): string {
  return doc.pages
    .filter((p) => p.pageNumber >= start && p.pageNumber <= end)
    .map((p) => p.text)
    .join('\n\n');
}
