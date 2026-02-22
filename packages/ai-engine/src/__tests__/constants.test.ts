import { describe, it, expect } from 'vitest';
import {
  MODELS,
  EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_GENERATION_CONFIG,
} from '../constants';
import type { ModelConfig, EmbeddingModelConfig } from '../constants';

describe('MODELS', () => {
  it('has SMOLLM3_3B and QWEN_05B entries', () => {
    expect(MODELS.SMOLLM3_3B).toBeDefined();
    expect(MODELS.QWEN_05B).toBeDefined();
  });

  it.each(Object.entries(MODELS))('%s has all required ModelConfig fields', (_key, model) => {
    const m = model as ModelConfig;
    expect(typeof m.id).toBe('string');
    expect(m.id.length).toBeGreaterThan(0);
    expect(typeof m.dtype).toBe('string');
    expect(m.dtype.length).toBeGreaterThan(0);
    expect(typeof m.sizeBytes).toBe('number');
    expect(m.sizeBytes).toBeGreaterThan(0);
    expect(typeof m.contextLength).toBe('number');
    expect(m.contextLength).toBeGreaterThan(0);
    expect(typeof m.maxContextLength).toBe('number');
    expect(m.maxContextLength).toBeGreaterThanOrEqual(m.contextLength);
    expect(typeof m.label).toBe('string');
    expect(m.label.length).toBeGreaterThan(0);
  });

  it('SmolLM3 has larger context than Qwen', () => {
    expect(MODELS.SMOLLM3_3B.contextLength).toBeGreaterThan(MODELS.QWEN_05B.contextLength);
  });

  it('SmolLM3 model is larger than Qwen', () => {
    expect(MODELS.SMOLLM3_3B.sizeBytes).toBeGreaterThan(MODELS.QWEN_05B.sizeBytes);
  });
});

describe('EMBEDDING_MODELS', () => {
  it('has JINA_V2_BASE, GTE_SMALL, and MXBAI_EMBED_XSMALL entries', () => {
    expect(EMBEDDING_MODELS.JINA_V2_BASE).toBeDefined();
    expect(EMBEDDING_MODELS.GTE_SMALL).toBeDefined();
    expect(EMBEDDING_MODELS.MXBAI_EMBED_XSMALL).toBeDefined();
  });

  it.each(Object.entries(EMBEDDING_MODELS))('%s has all required EmbeddingModelConfig fields', (_key, model) => {
    const m = model as EmbeddingModelConfig;
    expect(typeof m.id).toBe('string');
    expect(m.id.length).toBeGreaterThan(0);
    expect(typeof m.dtype).toBe('string');
    expect(typeof m.sizeBytes).toBe('number');
    expect(m.sizeBytes).toBeGreaterThan(0);
    expect(typeof m.dimensions).toBe('number');
    expect(m.dimensions).toBeGreaterThan(0);
    expect(typeof m.maxTokens).toBe('number');
    expect(m.maxTokens).toBeGreaterThan(0);
    expect(typeof m.label).toBe('string');
    expect(m.label.length).toBeGreaterThan(0);
  });

  it('Jina v2 has the highest dimensions', () => {
    expect(EMBEDDING_MODELS.JINA_V2_BASE.dimensions).toBeGreaterThan(
      EMBEDDING_MODELS.GTE_SMALL.dimensions,
    );
  });

  it('MxBai XSmall is the smallest model', () => {
    expect(EMBEDDING_MODELS.MXBAI_EMBED_XSMALL.sizeBytes).toBeLessThan(
      EMBEDDING_MODELS.GTE_SMALL.sizeBytes,
    );
    expect(EMBEDDING_MODELS.MXBAI_EMBED_XSMALL.sizeBytes).toBeLessThan(
      EMBEDDING_MODELS.JINA_V2_BASE.sizeBytes,
    );
  });
});

describe('DEFAULT_EMBEDDING_MODEL', () => {
  it('points to GTE_SMALL', () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe(EMBEDDING_MODELS.GTE_SMALL);
  });
});

describe('DEFAULT_GENERATION_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_GENERATION_CONFIG.maxTokens).toBe(1024);
    expect(DEFAULT_GENERATION_CONFIG.temperature).toBe(0.6);
    expect(DEFAULT_GENERATION_CONFIG.topP).toBe(0.9);
    expect(DEFAULT_GENERATION_CONFIG.doSample).toBe(true);
  });

  it('temperature is between 0 and 2', () => {
    expect(DEFAULT_GENERATION_CONFIG.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GENERATION_CONFIG.temperature).toBeLessThanOrEqual(2);
  });

  it('topP is between 0 and 1', () => {
    expect(DEFAULT_GENERATION_CONFIG.topP).toBeGreaterThan(0);
    expect(DEFAULT_GENERATION_CONFIG.topP).toBeLessThanOrEqual(1);
  });
});
