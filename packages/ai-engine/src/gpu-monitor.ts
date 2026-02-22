import type { DeviceCapability } from './types';
import { MODELS } from './constants';

export async function detectCapabilities(): Promise<DeviceCapability> {
  // No WebGPU support at all
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      hasWebGPU: false,
      hasFp16: false,
      adapterInfo: null,
      estimatedVRAM: 'unknown',
      recommendedModel: MODELS.SMOLLM3_3B.id,
      recommendedDtype: 'q4',
      recommendedDevice: 'wasm',
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return {
        hasWebGPU: false,
        hasFp16: false,
        adapterInfo: null,
        estimatedVRAM: 'unknown',
        recommendedModel: MODELS.SMOLLM3_3B.id,
        recommendedDtype: 'q4',
        recommendedDevice: 'wasm',
      };
    }

    const hasFp16 = adapter.features.has('shader-f16');
    const adapterInfo = adapter.info;
    const maxBufferSize = adapter.limits.maxBufferSize;

    // Estimate VRAM tier based on maxBufferSize
    // > 4GB buffer → high VRAM (likely 8GB+ GPU)
    // > 1GB buffer → medium VRAM (likely 4-8GB GPU)
    // otherwise → low VRAM
    let estimatedVRAM: DeviceCapability['estimatedVRAM'];
    if (maxBufferSize >= 4 * 1024 * 1024 * 1024) {
      estimatedVRAM = 'high';
    } else if (maxBufferSize >= 1 * 1024 * 1024 * 1024) {
      estimatedVRAM = 'medium';
    } else {
      estimatedVRAM = 'low';
    }

    // Map to model recommendation
    let recommendedModel: string;
    let recommendedDtype: string;
    let recommendedDevice: DeviceCapability['recommendedDevice'];

    if (estimatedVRAM === 'high' || estimatedVRAM === 'medium') {
      // High/medium VRAM: SmolLM3-3B on WebGPU
      recommendedModel = MODELS.SMOLLM3_3B.id;
      recommendedDtype = hasFp16 ? MODELS.SMOLLM3_3B.dtype : 'q4';
      recommendedDevice = 'webgpu';
    } else {
      // Low VRAM: Qwen 0.5B on WebGPU
      recommendedModel = MODELS.QWEN_05B.id;
      recommendedDtype = MODELS.QWEN_05B.dtype;
      recommendedDevice = 'webgpu';
    }

    return {
      hasWebGPU: true,
      hasFp16,
      adapterInfo,
      estimatedVRAM,
      recommendedModel,
      recommendedDtype,
      recommendedDevice,
    };
  } catch {
    // Adapter request failed — fall back to WASM
    return {
      hasWebGPU: false,
      hasFp16: false,
      adapterInfo: null,
      estimatedVRAM: 'unknown',
      recommendedModel: MODELS.SMOLLM3_3B.id,
      recommendedDtype: 'q4',
      recommendedDevice: 'wasm',
    };
  }
}
