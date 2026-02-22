import type { PageContent } from './types';

// --- Types ---

interface ChunkResult {
  text: string;
  startPage: number;
  endPage: number;
  tokenCount: number;
}

export interface SmartChunkResult {
  id: string;
  text: string;
  startPage: number;
  endPage: number;
  tokenCount: number;
  index: number;
  metadata: {
    pageRange: [number, number];
    charCount: number;
    overlapWithPrevious: boolean;
  };
}

export interface ChunkerOptions {
  /** Target chunk size in characters (~4 chars per token). Default: 1800 */
  targetSize: number;
  /** Overlap ratio (0.0–0.3). Default: 0.15 */
  overlap: number;
  /** Whether to break at sentence boundaries. Default: true */
  respectSentences: boolean;
  /** Whether to avoid crossing page boundaries when possible. Default: true */
  respectPages: boolean;
}

const DEFAULT_OPTIONS: ChunkerOptions = {
  targetSize: 1800,
  overlap: 0.15,
  respectSentences: true,
  respectPages: true,
};

// --- Original chunkText function (preserved for backward compatibility) ---

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
      const chunkTextStr = buffer.slice(0, breakPoint).trim();

      if (chunkTextStr) {
        chunks.push({
          text: chunkTextStr,
          startPage: bufferStartPage,
          endPage: page.pageNumber,
          tokenCount: estimateTokens(chunkTextStr),
        });
      }

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

// --- SmartChunker class ---

export class SmartChunker {
  private options: ChunkerOptions;

  constructor(options?: Partial<ChunkerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  chunkDocument(pages: Array<{ pageNumber: number; text: string }>): SmartChunkResult[] {
    if (pages.length === 0) return [];

    const { targetSize, overlap, respectSentences, respectPages } = this.options;
    const overlapSize = Math.floor(targetSize * overlap);
    const chunks: SmartChunkResult[] = [];
    let index = 0;

    if (respectPages) {
      // Process pages individually, then merge small ones
      const pageChunks = this.chunkWithPageRespect(pages, targetSize, overlapSize, respectSentences);
      for (const pc of pageChunks) {
        chunks.push({
          id: generateChunkId(),
          text: pc.text,
          startPage: pc.startPage,
          endPage: pc.endPage,
          tokenCount: estimateTokens(pc.text),
          index,
          metadata: {
            pageRange: [pc.startPage, pc.endPage],
            charCount: pc.text.length,
            overlapWithPrevious: index > 0,
          },
        });
        index++;
      }
    } else {
      // Concatenate all text and chunk by size
      const allText = pages.map((p) => p.text).join('\n\n');
      const textChunks = this.splitBySize(allText, targetSize, overlapSize, respectSentences);

      for (const text of textChunks) {
        const startPage = this.findPageForOffset(pages, allText.indexOf(text.slice(0, 50)));
        chunks.push({
          id: generateChunkId(),
          text,
          startPage,
          endPage: startPage,
          tokenCount: estimateTokens(text),
          index,
          metadata: {
            pageRange: [startPage, startPage],
            charCount: text.length,
            overlapWithPrevious: index > 0,
          },
        });
        index++;
      }
    }

    return chunks;
  }

  private chunkWithPageRespect(
    pages: Array<{ pageNumber: number; text: string }>,
    targetSize: number,
    overlapSize: number,
    respectSentences: boolean,
  ): Array<{ text: string; startPage: number; endPage: number }> {
    const results: Array<{ text: string; startPage: number; endPage: number }> = [];
    let buffer = '';
    let bufferStartPage = pages[0]?.pageNumber ?? 1;
    let currentEndPage = bufferStartPage;

    for (const page of pages) {
      const pageText = page.text.trim();
      if (!pageText) continue;

      buffer += (buffer ? '\n\n' : '') + pageText;
      currentEndPage = page.pageNumber;

      while (buffer.length >= targetSize) {
        const breakPoint = respectSentences
          ? findSentenceBreak(buffer, targetSize)
          : targetSize;

        const chunkTextStr = buffer.slice(0, breakPoint).trim();
        if (chunkTextStr) {
          results.push({
            text: chunkTextStr,
            startPage: bufferStartPage,
            endPage: currentEndPage,
          });
        }

        // Keep overlap from end of emitted chunk
        const overlapText = buffer.slice(Math.max(0, breakPoint - overlapSize), breakPoint);
        buffer = overlapText + buffer.slice(breakPoint);
        bufferStartPage = currentEndPage;
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      results.push({
        text: buffer.trim(),
        startPage: bufferStartPage,
        endPage: currentEndPage,
      });
    }

    return results;
  }

  private splitBySize(
    text: string,
    targetSize: number,
    overlapSize: number,
    respectSentences: boolean,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + targetSize, text.length);

      if (end < text.length && respectSentences) {
        const segment = text.slice(start, end + 100);
        const breakAt = findSentenceBreak(segment, targetSize);
        end = start + breakAt;
      }

      const chunk = text.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      start = end - overlapSize;
      if (start >= text.length) break;
    }

    return chunks;
  }

  private findPageForOffset(
    pages: Array<{ pageNumber: number; text: string }>,
    offset: number,
  ): number {
    let pos = 0;
    for (const page of pages) {
      pos += page.text.length + 2; // +2 for \n\n separator
      if (pos > offset) return page.pageNumber;
    }
    return pages[pages.length - 1]?.pageNumber ?? 1;
  }
}

// --- Shared utility functions ---

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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

let chunkCounter = 0;
function generateChunkId(): string {
  chunkCounter++;
  return `chunk-${Date.now()}-${chunkCounter}-${Math.random().toString(36).slice(2, 8)}`;
}
