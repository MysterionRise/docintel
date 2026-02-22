import { describe, it, expect } from 'vitest';
import { ContextManager } from '../context-manager';

describe('ContextManager', () => {
  describe('estimateTokens', () => {
    it('estimates tokens as ceil(length / 3.5)', () => {
      const cm = new ContextManager();
      // 7 chars → ceil(7/3.5) = 2
      expect(cm.estimateTokens('abcdefg')).toBe(2);
    });

    it('returns 0 for empty string', () => {
      const cm = new ContextManager();
      expect(cm.estimateTokens('')).toBe(0);
    });

    it('rounds up for non-integer results', () => {
      const cm = new ContextManager();
      // 1 char → ceil(1/3.5) = ceil(0.2857) = 1
      expect(cm.estimateTokens('a')).toBe(1);
    });

    it('handles long text', () => {
      const cm = new ContextManager();
      const text = 'x'.repeat(3500);
      expect(cm.estimateTokens(text)).toBe(1000);
    });
  });

  describe('fitToContext', () => {
    it('includes full text when it fits within budget', () => {
      const cm = new ContextManager(1000);
      const fullText = 'Short document.';
      const pages = ['Short document.'];

      const result = cm.fitToContext(fullText, pages);

      expect(result.context).toBe(fullText);
      expect(result.includedPages).toEqual([1]);
      expect(result.truncated).toBe(false);
    });

    it('returns all page numbers (1-indexed) when full text fits', () => {
      const cm = new ContextManager(10000);
      const pages = ['Page one.', 'Page two.', 'Page three.'];
      const fullText = pages.join('\n\n');

      const result = cm.fitToContext(fullText, pages);

      expect(result.includedPages).toEqual([1, 2, 3]);
      expect(result.truncated).toBe(false);
    });

    it('truncates and includes pages sequentially until budget exhausted', () => {
      // Each page ~100 chars → ~29 tokens. Budget = 50 tokens → fits ~1-2 pages
      const cm = new ContextManager(50);
      const pages = [
        'a'.repeat(100), // ~29 tokens
        'b'.repeat(100), // ~29 tokens
        'c'.repeat(100), // ~29 tokens
      ];
      const fullText = pages.join('\n\n');

      const result = cm.fitToContext(fullText, pages);

      expect(result.truncated).toBe(true);
      expect(result.includedPages.length).toBeLessThan(3);
      expect(result.includedPages[0]).toBe(1);
    });

    it('includes partial page when remaining budget > 100 tokens', () => {
      // Page 1: 100 chars → ceil(100/3.5) = 29 tokens
      // Budget: 200. After page 1: 200-29 = 171 remaining (> 100), so partial page 2 included.
      const cm = new ContextManager(200);
      const pages = [
        'a'.repeat(100), // ~29 tokens
        'b'.repeat(5000), // ~1429 tokens — won't fit fully
      ];
      const fullText = pages.join('\n\n');

      const result = cm.fitToContext(fullText, pages);

      expect(result.truncated).toBe(true);
      // Second page should be partially included (remaining > 100 tokens)
      expect(result.includedPages).toContain(2);
      expect(result.context).toContain('...');
    });

    it('skips partial page when remaining budget <= 100 tokens', () => {
      // Budget: 35 tokens. First page: ~29 tokens. Remaining: ~6 tokens (< 100)
      const cm = new ContextManager(35);
      const pages = [
        'a'.repeat(100), // ~29 tokens
        'b'.repeat(500), // won't fit
      ];
      const fullText = pages.join('\n\n');

      const result = cm.fitToContext(fullText, pages);

      expect(result.truncated).toBe(true);
      expect(result.includedPages).toEqual([1]);
    });

    it('joins included pages with double newline', () => {
      const cm = new ContextManager(10000);
      const pages = ['Page one content', 'Page two content'];
      const fullText = pages.join('\n\n');

      const result = cm.fitToContext(fullText, pages);

      // When full text fits, it returns fullText directly
      expect(result.context).toBe(fullText);
    });

    it('uses default maxContextTokens of 3000', () => {
      const cm = new ContextManager();
      // 3000 tokens * 3.5 chars = 10500 chars
      const shortText = 'a'.repeat(5000); // well under budget
      const result = cm.fitToContext(shortText, [shortText]);

      expect(result.truncated).toBe(false);
    });
  });

  describe('fitChunksToContext', () => {
    it('includes chunks that fit within budget', () => {
      const cm = new ContextManager(500);
      const chunks = [
        { text: 'Short chunk one.', startPage: 1, endPage: 1 },
        { text: 'Short chunk two.', startPage: 2, endPage: 3 },
      ];

      const result = cm.fitChunksToContext(chunks);

      expect(result.includedChunks).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it('annotates chunks with page ranges', () => {
      const cm = new ContextManager(500);
      const chunks = [
        { text: 'Chunk content here.', startPage: 5, endPage: 7 },
      ];

      const result = cm.fitChunksToContext(chunks);

      expect(result.context).toContain('[Pages 5-7]');
      expect(result.context).toContain('Chunk content here.');
    });

    it('separates chunks with divider', () => {
      const cm = new ContextManager(5000);
      const chunks = [
        { text: 'First chunk.', startPage: 1, endPage: 1 },
        { text: 'Second chunk.', startPage: 2, endPage: 2 },
      ];

      const result = cm.fitChunksToContext(chunks);

      expect(result.context).toContain('\n\n---\n\n');
    });

    it('stops including chunks when budget is exceeded', () => {
      const cm = new ContextManager(20); // very small budget
      const chunks = [
        { text: 'a'.repeat(50), startPage: 1, endPage: 1 }, // ~22 tokens with annotation
        { text: 'b'.repeat(50), startPage: 2, endPage: 2 },
      ];

      const result = cm.fitChunksToContext(chunks);

      expect(result.includedChunks).toBeLessThan(2);
      expect(result.truncated).toBe(true);
    });

    it('returns empty context when no chunks fit', () => {
      const cm = new ContextManager(1); // 1 token budget
      const chunks = [
        { text: 'This chunk is too large to fit.', startPage: 1, endPage: 1 },
      ];

      const result = cm.fitChunksToContext(chunks);

      expect(result.includedChunks).toBe(0);
      expect(result.truncated).toBe(true);
      expect(result.context).toBe('');
    });

    it('returns truncated=false when all chunks are included', () => {
      const cm = new ContextManager(10000);
      const chunks = [
        { text: 'Only chunk.', startPage: 1, endPage: 1 },
      ];

      const result = cm.fitChunksToContext(chunks);

      expect(result.truncated).toBe(false);
      expect(result.includedChunks).toBe(1);
    });
  });
});
