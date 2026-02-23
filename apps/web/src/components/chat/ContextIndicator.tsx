import { FileText, AlertTriangle } from 'lucide-react';

interface ContextIndicatorProps {
  includedPages: number[];
  totalPages: number;
  truncated: boolean;
  documentName: string;
}

export function ContextIndicator({ includedPages, totalPages, truncated, documentName }: ContextIndicatorProps) {
  const pageRange = includedPages.length > 0
    ? includedPages.length === totalPages
      ? `All ${totalPages} pages`
      : `Pages ${includedPages[0]}–${includedPages[includedPages.length - 1]} of ${totalPages}`
    : 'No pages loaded';

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
      <FileText size={12} className="shrink-0" />
      <span className="truncate">{documentName}</span>
      <span className="text-[var(--color-text-muted)]/50">|</span>
      <span>{pageRange}</span>
      {truncated && (
        <span className="flex items-center gap-0.5 text-yellow-400" title="Document exceeds context window. Some pages are excluded.">
          <AlertTriangle size={10} />
          Truncated
        </span>
      )}
    </div>
  );
}
