import type { SearchResult } from '@docintel/ai-engine';

interface ChunkInspectorProps {
  results: SearchResult[];
}

export function ChunkInspector({ results }: ChunkInspectorProps) {
  if (!results.length) {
    return (
      <div className="py-4 text-center text-sm text-[var(--color-text-muted)]">
        No matching chunks found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[var(--color-text-muted)]">
        Retrieved Chunks ({results.length})
      </h4>
      {results.map(({ chunk, score }) => (
        <div
          key={chunk.id}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dim)] p-3"
        >
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              Pages {chunk.startPage}–{chunk.endPage}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono ${
                score > 0.7
                  ? 'bg-green-500/20 text-green-400'
                  : score > 0.5
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
              }`}
            >
              {score.toFixed(3)}
            </span>
          </div>
          <p className="line-clamp-4 text-xs leading-relaxed">{chunk.text}</p>
        </div>
      ))}
    </div>
  );
}
