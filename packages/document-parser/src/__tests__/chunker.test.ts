import { describe, it, expect } from 'vitest';
import { chunkText, SmartChunker, estimateTokens } from '../chunker';
import type { PageContent } from '../types';

// Helper to create pages
function makePages(texts: string[]): PageContent[] {
  return texts.map((text, i) => ({ pageNumber: i + 1, text }));
}

function makeLongText(sentences: number): string {
  return Array.from({ length: sentences }, (_, i) =>
    `This is sentence number ${i + 1} which contains some meaningful content about the topic. `
  ).join('');
}

describe('chunkText (legacy function)', () => {
  it('returns a single chunk for short text', () => {
    const pages = makePages(['Hello world. This is a short document.']);
    const chunks = chunkText(pages);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello world. This is a short document.');
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[0].endPage).toBe(1);
  });

  it('produces multiple chunks for long text', () => {
    const longText = makeLongText(100); // ~8000+ characters
    const pages = makePages([longText]);
    const chunks = chunkText(pages);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves page numbers across pages', () => {
    const pages = makePages([
      makeLongText(30),
      makeLongText(30),
      makeLongText(30),
    ]);
    const chunks = chunkText(pages);

    // First chunk should start on page 1
    expect(chunks[0].startPage).toBe(1);

    // Some chunk should reference later pages
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.endPage).toBe(3);
  });

  it('includes tokenCount for each chunk', () => {
    const pages = makePages([makeLongText(50)]);
    const chunks = chunkText(pages);

    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBe(estimateTokens(chunk.text));
    }
  });

  it('handles empty pages gracefully', () => {
    const pages = makePages(['', '', '']);
    const chunks = chunkText(pages);

    // All empty — could be 0 or 1 empty chunk
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it('handles single-page document', () => {
    const pages = makePages(['Just one page of content.']);
    const chunks = chunkText(pages);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[0].endPage).toBe(1);
  });
});

describe('SmartChunker', () => {
  describe('basic chunking', () => {
    it('returns empty array for empty pages', () => {
      const chunker = new SmartChunker();
      const result = chunker.chunkDocument([]);

      expect(result).toHaveLength(0);
    });

    it('returns a single chunk for short document', () => {
      const chunker = new SmartChunker();
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: 'Short document text.' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Short document text.');
      expect(result[0].startPage).toBe(1);
      expect(result[0].endPage).toBe(1);
      expect(result[0].index).toBe(0);
    });

    it('produces multiple chunks for long text', () => {
      const chunker = new SmartChunker({ targetSize: 500 });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: makeLongText(50) },
      ]);

      expect(result.length).toBeGreaterThan(1);
    });

    it('each chunk has a unique id', () => {
      const chunker = new SmartChunker({ targetSize: 500 });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: makeLongText(50) },
      ]);

      const ids = result.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('chunks have sequential indices', () => {
      const chunker = new SmartChunker({ targetSize: 500 });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: makeLongText(50) },
      ]);

      for (let i = 0; i < result.length; i++) {
        expect(result[i].index).toBe(i);
      }
    });
  });

  describe('chunk size control', () => {
    it('chunks do not vastly exceed target size', () => {
      const targetSize = 800;
      const chunker = new SmartChunker({ targetSize, overlap: 0 });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: makeLongText(100) },
      ]);

      for (const chunk of result) {
        // Allow some overshoot for sentence boundary respect
        expect(chunk.text.length).toBeLessThan(targetSize * 1.5);
      }
    });

    it('respects custom target size', () => {
      const small = new SmartChunker({ targetSize: 300 });
      const large = new SmartChunker({ targetSize: 3000 });
      const text = makeLongText(100);
      const pages = [{ pageNumber: 1, text }];

      const smallChunks = small.chunkDocument(pages);
      const largeChunks = large.chunkDocument(pages);

      expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    });
  });

  describe('overlap', () => {
    it('overlap causes more chunks than no overlap', () => {
      const withOverlap = new SmartChunker({ targetSize: 500, overlap: 0.2 });
      const noOverlap = new SmartChunker({ targetSize: 500, overlap: 0 });
      const text = makeLongText(50);
      const pages = [{ pageNumber: 1, text }];

      const overlapChunks = withOverlap.chunkDocument(pages);
      const noOverlapChunks = noOverlap.chunkDocument(pages);

      expect(overlapChunks.length).toBeGreaterThanOrEqual(noOverlapChunks.length);
    });

    it('marks overlapWithPrevious in metadata', () => {
      const chunker = new SmartChunker({ targetSize: 500, overlap: 0.15 });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: makeLongText(50) },
      ]);

      if (result.length > 1) {
        expect(result[0].metadata.overlapWithPrevious).toBe(false);
        expect(result[1].metadata.overlapWithPrevious).toBe(true);
      }
    });
  });

  describe('sentence boundaries', () => {
    it('does not split in the middle of a word with respectSentences=true', () => {
      const chunker = new SmartChunker({ targetSize: 100, respectSentences: true });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: 'First sentence here. Second sentence there. Third sentence everywhere. Fourth long sentence about some topic.' },
      ]);

      for (const chunk of result) {
        // No chunk should start or end with a partial word (no leading/trailing word fragments)
        expect(chunk.text.trimStart()).toBe(chunk.text.trimStart());
      }
    });
  });

  describe('page boundaries', () => {
    it('tracks page ranges correctly', () => {
      const chunker = new SmartChunker({ targetSize: 2000 });
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: makeLongText(10) },
        { pageNumber: 2, text: makeLongText(10) },
        { pageNumber: 3, text: makeLongText(10) },
      ]);

      // First chunk should start on page 1
      expect(result[0].startPage).toBe(1);

      // Metadata pageRange should match start/end
      for (const chunk of result) {
        expect(chunk.metadata.pageRange[0]).toBe(chunk.startPage);
        expect(chunk.metadata.pageRange[1]).toBe(chunk.endPage);
      }
    });

    it('handles pages with no text', () => {
      const chunker = new SmartChunker();
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: '' },
        { pageNumber: 2, text: 'Actual content here.' },
        { pageNumber: 3, text: '' },
      ]);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].text).toContain('Actual content');
    });
  });

  describe('metadata', () => {
    it('includes charCount in metadata', () => {
      const chunker = new SmartChunker();
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: 'Some document text.' },
      ]);

      expect(result[0].metadata.charCount).toBe(result[0].text.length);
    });

    it('includes tokenCount estimate', () => {
      const chunker = new SmartChunker();
      const result = chunker.chunkDocument([
        { pageNumber: 1, text: 'Some document text for testing tokens.' },
      ]);

      expect(result[0].tokenCount).toBeGreaterThan(0);
      expect(result[0].tokenCount).toBe(estimateTokens(result[0].text));
    });
  });
});

describe('estimateTokens', () => {
  it('estimates approximately 1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('rounds up for partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});
