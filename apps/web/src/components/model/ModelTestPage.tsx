import { useState } from 'react';
import { Send, Square, RotateCcw } from 'lucide-react';
import { useModel } from '../../hooks/useModel';
import { useInference } from '../../hooks/useInference';
import { ModelLoader } from './ModelLoader';

export function ModelTestPage() {
  const { status, capability, lastGenerationStats, activeModelId, activeDevice, loadTimeMs } = useModel();
  const { streamingText, isGenerating, stats, generate, abort, resetStream } = useInference();
  const [prompt, setPrompt] = useState('');

  const isReady = status === 'ready' || status === 'generating';

  const handleGenerate = () => {
    if (!prompt.trim() || !isReady) return;
    generate([
      { role: 'system', content: 'You are a helpful assistant. Be concise.' },
      { role: 'user', content: prompt.trim() },
    ]);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-bold">Model Test Page</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        End-to-end inference pipeline test. This page is for development only.
      </p>

      {/* GPU Detection Results */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 font-semibold">GPU Detection</h3>
        {capability ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--color-text-muted)]">WebGPU:</span>{' '}
              {capability.hasWebGPU ? 'Available' : 'Not available'}
            </p>
            <p>
              <span className="text-[var(--color-text-muted)]">FP16:</span>{' '}
              {capability.hasFp16 ? 'Supported' : 'Not supported'}
            </p>
            <p>
              <span className="text-[var(--color-text-muted)]">VRAM:</span> {capability.estimatedVRAM}
            </p>
            {capability.adapterInfo && (
              <>
                <p>
                  <span className="text-[var(--color-text-muted)]">GPU:</span>{' '}
                  {capability.adapterInfo.description || capability.adapterInfo.vendor || 'Unknown'}
                </p>
                <p>
                  <span className="text-[var(--color-text-muted)]">Architecture:</span>{' '}
                  {capability.adapterInfo.architecture || 'Unknown'}
                </p>
              </>
            )}
            <p>
              <span className="text-[var(--color-text-muted)]">Recommended:</span>{' '}
              {capability.recommendedModel.split('/').pop()} ({capability.recommendedDtype}) on {capability.recommendedDevice}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Detecting...</p>
        )}
      </section>

      {/* Model Loader */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 font-semibold">Model</h3>
        <ModelLoader />
      </section>

      {/* Inference Test */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 font-semibold">Inference Test</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isReady ? 'Enter a prompt...' : 'Load a model first...'}
              disabled={!isReady}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
              className="flex-1 rounded-lg bg-[var(--color-bg)] px-4 py-2 text-sm outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
            />
            {isGenerating ? (
              <button
                onClick={abort}
                className="rounded-lg bg-red-500/20 p-2 text-red-400 hover:bg-red-500/30"
              >
                <Square size={18} />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || !isReady}
                className="rounded-lg bg-[var(--color-primary)] p-2 text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-30"
              >
                <Send size={18} />
              </button>
            )}
            <button
              onClick={resetStream}
              className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          {/* Output */}
          {streamingText && (
            <div className="min-h-[100px] whitespace-pre-wrap rounded-lg bg-[var(--color-bg)] p-4 text-sm">
              {streamingText}
              {isGenerating && <span className="animate-pulse">|</span>}
            </div>
          )}

          {/* Stats */}
          {(stats || lastGenerationStats) && (
            <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
              {(stats ?? lastGenerationStats)!.tokensGenerated > 0 && (
                <>
                  <span>Tokens: {(stats ?? lastGenerationStats)!.tokensGenerated}</span>
                  <span>Speed: {(stats ?? lastGenerationStats)!.tokensPerSecond.toFixed(1)} tok/s</span>
                  <span>Time: {((stats ?? lastGenerationStats)!.totalTimeMs / 1000).toFixed(1)}s</span>
                </>
              )}
              {activeModelId && <span>Model: {activeModelId.split('/').pop()}</span>}
              {activeDevice && <span>Device: {activeDevice}</span>}
              {loadTimeMs != null && <span>Load: {(loadTimeMs / 1000).toFixed(1)}s</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
