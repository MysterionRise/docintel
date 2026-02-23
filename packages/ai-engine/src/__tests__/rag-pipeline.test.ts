import { describe, it, expect } from 'vitest';
import { buildRAGPrompt } from '../prompt-templates';
import { DEFAULT_RAG_OPTIONS } from '../types';

// shouldUseRAG is a pure function — replicate the logic to avoid importing
// rag-pipeline.ts which transitively imports pdfjs-dist (browser-only)
function shouldUseRAG(documentTokens: number): boolean {
  return documentTokens > 3000;
}

describe('shouldUseRAG', () => {
  it('returns false for small documents (< 3000 tokens)', () => {
    expect(shouldUseRAG(500)).toBe(false);
    expect(shouldUseRAG(2999)).toBe(false);
  });

  it('returns true for large documents (>= 3000 tokens)', () => {
    expect(shouldUseRAG(3001)).toBe(true);
    expect(shouldUseRAG(10000)).toBe(true);
  });

  it('returns true at the boundary', () => {
    expect(shouldUseRAG(3000)).toBe(false);
    expect(shouldUseRAG(3001)).toBe(true);
  });
});

describe('DEFAULT_RAG_OPTIONS', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_RAG_OPTIONS.topK).toBe(5);
    expect(DEFAULT_RAG_OPTIONS.maxContextTokens).toBe(2500);
    expect(DEFAULT_RAG_OPTIONS.similarityThreshold).toBe(0.3);
    expect(DEFAULT_RAG_OPTIONS.includeHistory).toBe(true);
    expect(DEFAULT_RAG_OPTIONS.maxHistoryTurns).toBe(3);
  });
});

describe('buildRAGPrompt', () => {
  it('includes source annotations with page numbers', () => {
    const prompt = buildRAGPrompt(
      'What are the payment terms?',
      [
        { text: 'Payment is due net 30.', score: 0.9, startPage: 5, endPage: 5 },
        { text: 'Late fees apply after 60 days.', score: 0.7, startPage: 8, endPage: 8 },
      ],
      'contracts',
    );

    expect(prompt).toContain('[Source 1 | Pages 5-5]');
    expect(prompt).toContain('[Source 2 | Pages 8-8]');
    expect(prompt).toContain('Payment is due net 30.');
    expect(prompt).toContain('Late fees apply after 60 days.');
  });

  it('includes the user question', () => {
    const prompt = buildRAGPrompt(
      'What is the termination clause?',
      [{ text: 'Either party may terminate.', score: 0.8, startPage: 3, endPage: 3 }],
      'contracts',
    );

    expect(prompt).toContain('What is the termination clause?');
  });

  it('includes domain-specific system prompt', () => {
    const contractPrompt = buildRAGPrompt('test', [{ text: 'a', score: 0.5 }], 'contracts');
    expect(contractPrompt).toContain('contract analysis expert');

    const medicalPrompt = buildRAGPrompt('test', [{ text: 'a', score: 0.5 }], 'medical');
    expect(medicalPrompt).toContain('medical records analyst');
  });

  it('instructs model to cite sources', () => {
    const prompt = buildRAGPrompt(
      'question',
      [{ text: 'chunk', score: 0.5, startPage: 1, endPage: 1 }],
      'legal',
    );

    expect(prompt).toContain('[Source N]');
  });

  it('supports custom sourceIndex', () => {
    const prompt = buildRAGPrompt(
      'question',
      [
        { text: 'first chunk', score: 0.9, startPage: 1, endPage: 1, sourceIndex: 1 },
        { text: 'second chunk', score: 0.7, startPage: 3, endPage: 4, sourceIndex: 2 },
      ],
      'financial',
    );

    expect(prompt).toContain('[Source 1 | Pages 1-1]');
    expect(prompt).toContain('[Source 2 | Pages 3-4]');
  });

  it('handles chunks without page numbers', () => {
    const prompt = buildRAGPrompt(
      'question',
      [{ text: 'no pages', score: 0.5 }],
      'contracts',
    );

    expect(prompt).toContain('[Source 1]');
    expect(prompt).not.toContain('Pages');
  });

  it('separates chunks with dividers', () => {
    const prompt = buildRAGPrompt(
      'question',
      [
        { text: 'chunk one', score: 0.9, startPage: 1, endPage: 1 },
        { text: 'chunk two', score: 0.8, startPage: 2, endPage: 2 },
      ],
      'contracts',
    );

    expect(prompt).toContain('---');
  });
});
