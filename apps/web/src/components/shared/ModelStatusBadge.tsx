import { useInferenceStore } from '../../stores/useInferenceStore';
import type { InferenceStatus } from '@docintel/ai-engine';

const statusConfig: Record<InferenceStatus, { color: string; label: string }> = {
  idle: { color: 'bg-gray-500', label: 'Model not loaded' },
  loading_tokenizer: { color: 'bg-yellow-500', label: 'Loading tokenizer...' },
  loading_model: { color: 'bg-yellow-500', label: 'Loading model...' },
  downloading: { color: 'bg-blue-500', label: 'Downloading...' },
  ready: { color: 'bg-green-500', label: 'Model ready' },
  generating: { color: 'bg-purple-500 animate-pulse', label: 'Generating...' },
  error: { color: 'bg-red-500', label: 'Error' },
};

export function ModelStatusBadge() {
  const { status, downloadProgress } = useInferenceStore();
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <span className={`h-2 w-2 rounded-full ${config.color}`} />
      <span>
        {status === 'downloading' && downloadProgress
          ? `Downloading ${downloadProgress.name} (${Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%)`
          : config.label}
      </span>
    </div>
  );
}
