import { useEffect, useState } from 'react';
import { HardDrive, Download, Trash2 } from 'lucide-react';
import { useInferenceStore } from '../stores/useInferenceStore';
import { ProgressBar } from '../components/shared/ProgressBar';

export function SettingsPage() {
  const { status, downloadProgress, loadModel } = useInferenceStore();
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    navigator.storage.estimate().then((est) => {
      setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    });
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const isModelLoaded = status === 'ready' || status === 'generating';
  const isLoading = ['loading_tokenizer', 'loading_model', 'downloading'].includes(status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Model Management */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Download size={18} /> AI Model
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">SmolLM3-3B (ONNX, q4f16)</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                ~1.8 GB — runs entirely on-device via WebGPU
              </p>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                isModelLoaded
                  ? 'bg-green-500/20 text-green-400'
                  : isLoading
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {isModelLoaded ? 'Loaded' : isLoading ? 'Loading...' : 'Not loaded'}
            </span>
          </div>

          {isLoading && downloadProgress && (
            <ProgressBar
              progress={downloadProgress.total > 0 ? downloadProgress.loaded / downloadProgress.total : 0}
              label={`Downloading ${downloadProgress.name}`}
            />
          )}

          {!isModelLoaded && !isLoading && (
            <button
              onClick={loadModel}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              Download & Load Model
            </button>
          )}
        </div>
      </section>

      {/* Storage */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <HardDrive size={18} /> Storage
        </h3>
        {storage && (
          <div className="space-y-3">
            <ProgressBar
              progress={storage.quota > 0 ? storage.used / storage.quota : 0}
              label={`${formatBytes(storage.used)} used of ${formatBytes(storage.quota)}`}
            />
            <p className="text-xs text-[var(--color-text-muted)]">
              Includes documents, embeddings, and cached model files
            </p>
          </div>
        )}
      </section>

      {/* Data */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Trash2 size={18} /> Data Management
        </h3>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          All data is stored locally in your browser. Nothing is sent to any server.
        </p>
        <button
          onClick={async () => {
            if (confirm('This will delete all documents and chat history. Continue?')) {
              const { db } = await import('../lib/db');
              await db.delete();
              window.location.reload();
            }
          }}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
        >
          Clear All Data
        </button>
      </section>
    </div>
  );
}
