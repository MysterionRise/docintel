import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedPDF, PageContent } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
