import { X, FileText } from 'lucide-react';
import type { SearchResult } from '@docintel/ai-engine';

interface CitationPanelProps {
  sources: SearchResult[];
  onPageClick?: (page: number) => void;
  onClose: () => void;
  selectedSourceIndex: number | null;
}

export function CitationPanel({ sources, onPageClick, onClose, selectedSourceIndex }: CitationPanelProps) {
  const source = selectedSourceIndex != null ? sources[selectedSourceIndex] : null;

  if (!source) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-72 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <FileText size={12} className="text-[var(--color-primary)]" />
          Source {(selectedSourceIndex ?? 0) + 1}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Source info */}
      <div className="flex-1 overflow-auto p-3">
        <div className="mb-3 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <button
            onClick={() => onPageClick?.(source.chunk.startPage)}
            className="hover:text-[var(--color-primary)]"
          >
            Pages {source.chunk.startPage}–{source.chunk.endPage}
          </button>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
              source.score > 0.7
                ? 'bg-green-500/20 text-green-400'
                : source.score > 0.5
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            {source.score.toFixed(3)}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          {source.chunk.text}
        </p>
      </div>
    </div>
  );
}
