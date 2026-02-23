import { Cpu, Zap, AlertTriangle, Download, Loader2, CheckCircle } from 'lucide-react';
import { useModel } from '../../hooks/useModel';
import { MODELS, type ModelConfig } from '@docintel/ai-engine';
import { ProgressBar } from '../shared/ProgressBar';

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function getModelConfig(modelId: string): ModelConfig | undefined {
  return Object.values(MODELS).find((m) => m.id === modelId);
}

export function ModelLoader() {
  const { status, downloadProgress, capability, error, loadModel, activeModelId, activeDevice, loadTimeMs } = useModel();

  const isLoading = ['loading_tokenizer', 'loading_model', 'downloading'].includes(status);
  const isReady = status === 'ready' || status === 'generating';
  const isError = status === 'error';

  const recommendedConfig = capability?.recommendedModel
    ? getModelConfig(capability.recommendedModel)
    : undefined;

  return (
    <div className="space-y-4">
      {/* Device capability info */}
      {capability && (
        <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-3 text-sm">
          {capability.hasWebGPU ? (
            <Zap size={18} className="shrink-0 text-green-400" />
          ) : (
            <Cpu size={18} className="shrink-0 text-yellow-400" />
          )}
          <div>
            <p className="font-medium">
              {capability.hasWebGPU
                ? `WebGPU available${capability.hasFp16 ? ' (FP16 supported)' : ''}`
                : 'WebGPU not available — using CPU (WASM)'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {capability.hasWebGPU
                ? `VRAM: ${capability.estimatedVRAM}${capability.adapterInfo?.description ? ` — ${capability.adapterInfo.description}` : ''}`
                : 'Inference will be slower but still functional'}
            </p>
          </div>
        </div>
      )}

      {/* Model ready state */}
      {isReady && activeModelId && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-sm">
          <CheckCircle size={18} className="shrink-0 text-green-400" />
          <div>
            <p className="font-medium text-green-400">Model loaded</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {getModelConfig(activeModelId)?.label ?? activeModelId}
              {' — '}
              {activeDevice === 'webgpu' ? 'WebGPU' : 'CPU (WASM)'}
              {loadTimeMs != null && ` — loaded in ${(loadTimeMs / 1000).toFixed(1)}s`}
            </p>
          </div>
        </div>
      )}

      {/* Download progress */}
      {isLoading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span>
              {status === 'downloading'
                ? 'Downloading model files...'
                : status === 'loading_tokenizer'
                  ? 'Loading tokenizer...'
                  : 'Loading model weights...'}
            </span>
          </div>
          {downloadProgress && downloadProgress.total > 0 && (
            <ProgressBar
              progress={downloadProgress.loaded / downloadProgress.total}
              label={`${downloadProgress.name} — ${formatBytes(downloadProgress.loaded)} / ${formatBytes(downloadProgress.total)}`}
            />
          )}
        </div>
      )}

      {/* Error state */}
      {isError && error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={16} />
            <span className="font-medium">Model failed to load</span>
          </div>
          <p className="mt-1 text-xs text-red-300/80">{error}</p>
          <div className="mt-2 text-xs text-[var(--color-text-muted)]">
            <p>Troubleshooting tips:</p>
            <ul className="ml-4 mt-1 list-disc space-y-0.5">
              <li>Close other GPU-intensive tabs</li>
              <li>Try a smaller model</li>
              <li>Refresh the page and try again</li>
              {capability?.hasWebGPU && <li>Update your GPU drivers</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Load buttons */}
      {!isReady && !isLoading && (
        <div className="space-y-2">
          {/* Recommended model button */}
          {recommendedConfig && (
            <button
              onClick={() => loadModel()}
              className="flex w-full items-center gap-3 rounded-lg bg-[var(--color-primary)] px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              <Download size={18} />
              <div>
                <p>Download & Load {recommendedConfig.label}</p>
                <p className="text-xs font-normal opacity-80">
                  {formatBytes(recommendedConfig.sizeBytes)} — {capability?.recommendedDevice === 'webgpu' ? 'WebGPU' : 'CPU (WASM)'}
                </p>
              </div>
            </button>
          )}

          {/* Alternate model option */}
          {capability?.hasWebGPU && capability.estimatedVRAM !== 'low' && (
            <button
              onClick={() =>
                loadModel(MODELS.QWEN_05B.id, MODELS.QWEN_05B.dtype, 'webgpu')
              }
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Download size={14} className="text-[var(--color-text-muted)]" />
              <div>
                <p className="font-medium">{MODELS.QWEN_05B.label}</p>
                <p className="text-[var(--color-text-muted)]">{formatBytes(MODELS.QWEN_05B.sizeBytes)} — faster download, lower quality</p>
              </div>
            </button>
          )}

          {/* WASM fallback option when WebGPU is available but user might want it */}
          {capability?.hasWebGPU && (
            <button
              onClick={() =>
                loadModel(MODELS.SMOLLM3_3B.id, 'q4', 'wasm')
              }
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Cpu size={14} className="text-[var(--color-text-muted)]" />
              <div>
                <p className="font-medium">SmolLM3 3B (CPU fallback)</p>
                <p className="text-[var(--color-text-muted)]">{formatBytes(MODELS.SMOLLM3_3B.sizeBytes)} — WASM, slower but compatible</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
