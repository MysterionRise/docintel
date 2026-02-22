import { useState } from 'react';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import type { SearchResult } from '@docintel/ai-engine';

interface RetrievedContextProps {
  sources: SearchResult[];
  retrievalTimeMs: number;
  onPageClick?: (page: number) => void;
}

function RelevanceBar({ score }: { score: number }) {
  const percent = Math.round(score * 100);
  const color =
    score > 0.7 ? 'bg-green-500' : score > 0.5 ? 'bg-yellow-500' : 'bg-orange-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
        {score.toFixed(2)}
      </span>
    </div>
  );
}

export function RetrievedContext({ sources, retrievalTimeMs, onPageClick }: RetrievedContextProps) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  const documentIds = new Set(sources.map((s) => s.chunk.documentId));
  const summary = `Based on ${sources.length} source${sources.length !== 1 ? 's' : ''} from ${documentIds.size} document${documentIds.size !== 1 ? 's' : ''}`;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        <Database size={12} className="shrink-0 text-[var(--color-primary)]" />
        <span className="flex-1">{summary}</span>
        <span className="text-[10px] opacity-50">{retrievalTimeMs}ms</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          {sources.map((source, i) => (
            <div
              key={`${source.chunk.documentId}-${source.chunk.index}`}
              className="rounded-lg bg-[var(--color-surface)] p-2"
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[var(--color-primary)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
                    Source {i + 1}
                  </span>
                  <button
                    onClick={() => onPageClick?.(source.chunk.startPage)}
                    className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                  >
                    Pages {source.chunk.startPage}–{source.chunk.endPage}
                  </button>
                </div>
                <RelevanceBar score={source.score} />
              </div>
              <p className="line-clamp-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                {source.chunk.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
