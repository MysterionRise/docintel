import { useEffect, useState } from 'react';
import { HardDrive, Download, Trash2 } from 'lucide-react';
import { useModel } from '../hooks/useModel';
import { ModelLoader } from '../components/model/ModelLoader';
import { ProgressBar } from '../components/shared/ProgressBar';

export function SettingsPage() {
  const { lastGenerationStats } = useModel();
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    navigator.storage.estimate().then((est) => {
      setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    });
    estimateCacheSize();
  }, []);

  async function estimateCacheSize() {
    try {
      const cacheNames = await caches.keys();
      let total = 0;
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes('onnx')) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          // Approximate: count entries (we can't get exact sizes without fetching)
          total += keys.length;
        }
      }
      // Show rough estimate based on number of cached files
      setCacheSize(total);
    } catch {
      setCacheSize(null);
    }
  }

  async function clearModelCache() {
    setClearingCache(true);
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes('onnx')) {
          await caches.delete(name);
        }
      }
      setCacheSize(0);
      // Update storage estimate
      const est = await navigator.storage.estimate();
      setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
    } catch {
      // Ignore cache clearing errors
    }
    setClearingCache(false);
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Model Management */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Download size={18} /> AI Model
        </h3>
        <ModelLoader />
        {lastGenerationStats && lastGenerationStats.tokensPerSecond > 0 && (
          <div className="mt-3 text-xs text-[var(--color-text-muted)]">
            Last generation: {lastGenerationStats.tokensPerSecond.toFixed(1)} tokens/sec
            ({lastGenerationStats.tokensGenerated} tokens in {(lastGenerationStats.totalTimeMs / 1000).toFixed(1)}s)
          </div>
        )}
      </section>

      {/* Model Cache */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <HardDrive size={18} /> Model Cache
        </h3>
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Model files are cached in your browser for instant loading after the first download.
            {cacheSize != null && cacheSize > 0 && ` (${cacheSize} cached files)`}
          </p>
          <button
            onClick={clearModelCache}
            disabled={clearingCache}
            className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400 transition-colors hover:bg-yellow-500/20 disabled:opacity-50"
          >
            {clearingCache ? 'Clearing...' : 'Clear Model Cache'}
          </button>
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
