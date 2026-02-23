import { Cpu, Zap } from 'lucide-react';
import { useModelStore } from '../../hooks/useModel';
import { MODELS, type InferenceStatus } from '@docintel/ai-engine';

const statusConfig: Record<InferenceStatus, { color: string; label: string }> = {
  idle: { color: 'bg-gray-500', label: 'Model not loaded' },
  loading_tokenizer: { color: 'bg-yellow-500', label: 'Loading tokenizer...' },
  loading_model: { color: 'bg-yellow-500', label: 'Loading model...' },
  downloading: { color: 'bg-blue-500', label: 'Downloading...' },
  ready: { color: 'bg-green-500', label: 'Model ready' },
  generating: { color: 'bg-purple-500 animate-pulse', label: 'Generating...' },
  error: { color: 'bg-red-500', label: 'Error' },
};

function getModelLabel(modelId: string | null): string {
  if (!modelId) return '';
  const config = Object.values(MODELS).find((m) => m.id === modelId);
  return config?.label ?? modelId.split('/').pop() ?? '';
}

export function ModelBadge() {
  const status = useModelStore((s) => s.status);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeDevice = useModelStore((s) => s.activeDevice);
  const lastGenerationStats = useModelStore((s) => s.lastGenerationStats);
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      {/* Status dot */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${config.color}`} />

      {/* Status text */}
      <span>
        {status === 'downloading' && downloadProgress
          ? `Downloading ${downloadProgress.name} (${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%)`
          : config.label}
      </span>

      {/* Model info when loaded */}
      {(status === 'ready' || status === 'generating') && activeModelId && (
        <>
          <span className="text-[var(--color-text-muted)]/50">|</span>
          <span className="truncate">{getModelLabel(activeModelId)}</span>
          {activeDevice && (
            <span className="flex items-center gap-0.5">
              {activeDevice === 'webgpu' ? <Zap size={10} /> : <Cpu size={10} />}
              {activeDevice === 'webgpu' ? 'GPU' : 'CPU'}
            </span>
          )}
          {lastGenerationStats && lastGenerationStats.tokensPerSecond > 0 && (
            <>
              <span className="text-[var(--color-text-muted)]/50">|</span>
              <span>{lastGenerationStats.tokensPerSecond.toFixed(1)} tok/s</span>
            </>
          )}
        </>
      )}
    </div>
  );
}
