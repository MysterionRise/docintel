import type { SearchResult } from '@docintel/ai-engine';

/**
 * Parse [Source N] references from generated text and render as interactive elements.
 */
export function renderContentWithCitations(
  content: string,
  sources: SearchResult[],
  onSourceClick: (index: number) => void,
): React.ReactNode[] {
  // Match [Source N] patterns
  const parts = content.split(/(\[Source \d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[Source (\d+)\]$/);
    if (match) {
      const sourceIndex = parseInt(match[1], 10) - 1;
      const source = sources[sourceIndex];
      if (source) {
        return (
          <button
            key={i}
            onClick={() => onSourceClick(sourceIndex)}
            className="mx-0.5 inline-flex items-center rounded bg-[var(--color-primary)]/20 px-1 py-0.5 text-[10px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/30"
            title={`Pages ${source.chunk.startPage}–${source.chunk.endPage} (${source.score.toFixed(2)})`}
          >
            {part}
          </button>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}
