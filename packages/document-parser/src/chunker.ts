import type { PageContent } from './types';

interface ChunkResult {
  text: string;
  startPage: number;
  endPage: number;
  tokenCount: number;
}

const CHUNK_SIZE = 2048; // ~512 tokens
const OVERLAP = 256; // ~10-15% overlap

export function chunkText(pages: PageContent[]): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let buffer = '';
  let bufferStartPage = 1;

  for (const page of pages) {
    buffer += (buffer ? '\n\n' : '') + page.text;

    while (buffer.length >= CHUNK_SIZE) {
      const breakPoint = findSentenceBreak(buffer, CHUNK_SIZE);
      const chunkText = buffer.slice(0, breakPoint).trim();

      if (chunkText) {
        chunks.push({
          text: chunkText,
          startPage: bufferStartPage,
          endPage: page.pageNumber,
          tokenCount: estimateTokens(chunkText),
        });
      }

      // Advance the buffer by breakPoint, then prepend overlap from the end of the extracted chunk
      const overlapText = buffer.slice(Math.max(0, breakPoint - OVERLAP), breakPoint);
      buffer = overlapText + buffer.slice(breakPoint);
      bufferStartPage = page.pageNumber;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      text: buffer.trim(),
      startPage: bufferStartPage,
      endPage: pages[pages.length - 1]?.pageNumber ?? 1,
      tokenCount: estimateTokens(buffer.trim()),
    });
  }

  return chunks;
}

function findSentenceBreak(text: string, target: number): number {
  const sentenceEnders = /[.!?]\s/g;
  let lastBreak = target;
  let match;

  while ((match = sentenceEnders.exec(text)) !== null) {
    if (match.index > target) break;
    lastBreak = match.index + 2;
  }

  return lastBreak;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
