import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectCapabilities } from '../gpu-monitor';
import { MODELS } from '../constants';

describe('detectCapabilities', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    // Start each test with a clean navigator (no gpu property)
    // @ts-expect-error - overriding navigator for test
    globalThis.navigator = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.navigator = originalNavigator;
  });

  function mockGPU(options: {
    adapterNull?: boolean;
    hasFp16?: boolean;
    maxBufferSize?: number;
    throwError?: boolean;
  }) {
    const { adapterNull = false, hasFp16 = false, maxBufferSize = 2 * 1024 * 1024 * 1024, throwError = false } = options;

    const adapter = adapterNull
      ? null
      : {
          features: new Set(hasFp16 ? ['shader-f16'] : []),
          info: { vendor: 'test', architecture: 'test-arch' },
          limits: { maxBufferSize },
        };

    const gpu = {
      requestAdapter: throwError
        ? vi.fn().mockRejectedValue(new Error('GPU error'))
        : vi.fn().mockResolvedValue(adapter),
    };

    Object.defineProperty(globalThis.navigator, 'gpu', { value: gpu, configurable: true });
  }

  it('returns WASM fallback when navigator is undefined', async () => {
    globalThis.navigator = undefined as unknown as Navigator;

    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(false);
    expect(caps.recommendedDevice).toBe('wasm');
    expect(caps.recommendedDtype).toBe('q4');
    expect(caps.adapterInfo).toBeNull();
  });

  it('returns WASM fallback when navigator.gpu is absent', async () => {
    // navigator exists but no gpu property (default from beforeEach)
    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(false);
    expect(caps.recommendedDevice).toBe('wasm');
  });

  it('returns WASM fallback when adapter is null', async () => {
    mockGPU({ adapterNull: true });

    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(false);
    expect(caps.recommendedDevice).toBe('wasm');
  });

  it('returns WASM fallback when requestAdapter throws', async () => {
    mockGPU({ throwError: true });

    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(false);
    expect(caps.recommendedDevice).toBe('wasm');
  });

  it('detects high VRAM when maxBufferSize >= 4GB', async () => {
    mockGPU({ maxBufferSize: 5 * 1024 * 1024 * 1024 });

    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(true);
    expect(caps.estimatedVRAM).toBe('high');
    expect(caps.recommendedDevice).toBe('webgpu');
    expect(caps.recommendedModel).toBe(MODELS.SMOLLM3_3B.id);
  });

  it('detects medium VRAM when maxBufferSize >= 1GB but < 4GB', async () => {
    mockGPU({ maxBufferSize: 2 * 1024 * 1024 * 1024 });

    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(true);
    expect(caps.estimatedVRAM).toBe('medium');
    expect(caps.recommendedDevice).toBe('webgpu');
    expect(caps.recommendedModel).toBe(MODELS.SMOLLM3_3B.id);
  });

  it('detects low VRAM when maxBufferSize < 1GB', async () => {
    mockGPU({ maxBufferSize: 500 * 1024 * 1024 });

    const caps = await detectCapabilities();

    expect(caps.hasWebGPU).toBe(true);
    expect(caps.estimatedVRAM).toBe('low');
    expect(caps.recommendedModel).toBe(MODELS.QWEN_05B.id);
    expect(caps.recommendedDevice).toBe('webgpu');
  });

  it('uses fp16 dtype when shader-f16 is supported and VRAM is high', async () => {
    mockGPU({ hasFp16: true, maxBufferSize: 5 * 1024 * 1024 * 1024 });

    const caps = await detectCapabilities();

    expect(caps.hasFp16).toBe(true);
    expect(caps.recommendedDtype).toBe(MODELS.SMOLLM3_3B.dtype); // 'q4f16'
  });

  it('falls back to q4 dtype when shader-f16 is not supported', async () => {
    mockGPU({ hasFp16: false, maxBufferSize: 5 * 1024 * 1024 * 1024 });

    const caps = await detectCapabilities();

    expect(caps.hasFp16).toBe(false);
    expect(caps.recommendedDtype).toBe('q4');
  });

  it('returns adapter info when adapter is available', async () => {
    mockGPU({ maxBufferSize: 2 * 1024 * 1024 * 1024 });

    const caps = await detectCapabilities();

    expect(caps.adapterInfo).toEqual({ vendor: 'test', architecture: 'test-arch' });
  });
});
