export interface ModelConfig {
  id: string;
  dtype: string;
  sizeBytes: number;
  contextLength: number;
  maxContextLength: number;
  label: string;
}

export const MODELS = {
  SMOLLM3_3B: {
    id: 'HuggingFaceTB/SmolLM3-3B-ONNX',
    dtype: 'q4f16',
    sizeBytes: 1_900_000_000,
    contextLength: 4096,
    maxContextLength: 65536,
    label: 'SmolLM3 3B (Recommended)',
  },
  QWEN_05B: {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q4',
    sizeBytes: 400_000_000,
    contextLength: 2048,
    maxContextLength: 4096,
    label: 'Qwen 0.5B (Lite)',
  },
} as const satisfies Record<string, ModelConfig>;

export interface EmbeddingModelConfig {
  id: string;
  dtype: string;
  sizeBytes: number;
  dimensions: number;
  maxTokens: number;
  label: string;
}

export const EMBEDDING_MODELS = {
  JINA_V2_BASE: {
    id: 'Xenova/jina-embeddings-v2-base-en',
    dtype: 'fp32',
    sizeBytes: 135_000_000,
    dimensions: 768,
    maxTokens: 8192,
    label: 'Jina v2 Base (Best quality)',
  },
  GTE_SMALL: {
    id: 'Xenova/gte-small',
    dtype: 'fp32',
    sizeBytes: 67_000_000,
    dimensions: 384,
    maxTokens: 512,
    label: 'GTE Small (Recommended)',
  },
  MXBAI_EMBED_XSMALL: {
    id: 'mixedbread-ai/mxbai-embed-xsmall-v1',
    dtype: 'fp32',
    sizeBytes: 45_000_000,
    dimensions: 384,
    maxTokens: 512,
    label: 'MxBai XSmall (Fastest)',
  },
} as const satisfies Record<string, EmbeddingModelConfig>;

export const DEFAULT_EMBEDDING_MODEL = EMBEDDING_MODELS.GTE_SMALL;

export const DEFAULT_GENERATION_CONFIG = {
  maxTokens: 1024,
  temperature: 0.6,
  topP: 0.9,
  doSample: true,
} as const;
