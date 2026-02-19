import { FileText, Trash2 } from 'lucide-react';
import { useDocumentStore } from '../../stores/useDocumentStore';
import type { DocDocument } from '../../types/document';

interface DocumentListProps {
  documents: DocDocument[];
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

export function DocumentList({ documents, onSelect, onDelete }: DocumentListProps) {
  const selectedId = useDocumentStore((s) => s.selectedDocumentId);

  if (!documents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
        <FileText size={40} className="mb-2 opacity-40" />
        <p className="text-sm">No documents yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {documents.map((doc) => (
        <div
          key={doc.id}
          onClick={() => doc.id != null && onSelect(doc.id)}
          className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
            selectedId === doc.id
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'hover:bg-white/5'
          }`}
        >
          <FileText size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.name}</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {doc.pageCount} pages &middot; {formatSize(doc.fileSize)}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (doc.id != null) onDelete(doc.id);
            }}
            className="rounded p-1 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
