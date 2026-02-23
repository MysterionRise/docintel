import { useEffect, useState, useMemo } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Search, FileText, Info } from 'lucide-react';
import { db } from '../../lib/db';
import type { DocDocument, DocChunk } from '../../types/document';

interface DocumentViewerProps {
  documentId: number;
}

export function DocumentViewer({ documentId }: DocumentViewerProps) {
  const [document, setDocument] = useState<DocDocument | null>(null);
  const [chunks, setChunks] = useState<DocChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCurrentPage(1);
    setSearchQuery('');

    (async () => {
      try {
        const doc = await db.documents.get(documentId);
        const c = await db.chunks.where('documentId').equals(documentId).sortBy('index');
        if (!cancelled) {
          setDocument(doc ?? null);
          setChunks(c);
        }
      } catch (err) {
        console.error('Failed to load document:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Split raw text into pages (by double newline sections approximation)
  const pages = useMemo(() => {
    if (!document?.rawText) return [];
    // Split by page-like boundaries — double newlines are page separators in our data
    const sections = document.rawText.split(/\n\n+/);
    if (sections.length <= 1) return [document.rawText];

    // Group into pages based on document page count
    const targetPageCount = document.pageCount || 1;
    const sectionsPerPage = Math.ceil(sections.length / targetPageCount);
    const result: string[] = [];
    for (let i = 0; i < sections.length; i += sectionsPerPage) {
      result.push(sections.slice(i, i + sectionsPerPage).join('\n\n'));
    }
    return result;
  }, [document]);

  const totalPages = pages.length || 1;

  const searchResultCount = useMemo(() => {
    if (!searchQuery.trim() || !document?.rawText) return 0;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = document.rawText.match(new RegExp(escaped, 'gi'));
    return matches?.length ?? 0;
  }, [searchQuery, document]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[var(--color-text-muted)]">
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading document...
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[var(--color-text-muted)]">
        Document not found
      </div>
    );
  }

  const currentPageText = pages[currentPage - 1] ?? '';

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <FileText size={16} className="shrink-0 text-[var(--color-text-muted)]" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{document.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            {document.pageCount} pages &middot; {chunks.length} chunks &middot;{' '}
            {formatSize(document.fileSize)}
          </p>
        </div>
        <button
          onClick={() => setShowMeta(!showMeta)}
          className={`rounded p-1 transition-colors ${showMeta ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
        >
          <Info size={16} />
        </button>
      </div>

      {/* Metadata panel */}
      {showMeta && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">File size:</span> {formatSize(document.fileSize)}
            </div>
            <div>
              <span className="font-medium">Pages:</span> {document.pageCount}
            </div>
            <div>
              <span className="font-medium">Chunks:</span> {chunks.length}
            </div>
            <div>
              <span className="font-medium">Uploaded:</span>{' '}
              {new Date(document.uploadedAt).toLocaleDateString()}
            </div>
            <div>
              <span className="font-medium">Domain:</span> {document.domain}
            </div>
            <div>
              <span className="font-medium">Characters:</span>{' '}
              {document.rawText.length.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <Search size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search in document..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
        />
        {searchQuery && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {searchResultCount} match{searchResultCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Page content */}
      <div className="max-h-96 overflow-auto p-4">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-muted)]">
          {searchQuery.trim()
            ? currentPageText.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                part.toLowerCase() === searchQuery.toLowerCase() ? (
                  <mark key={i} className="rounded bg-yellow-500/30 px-0.5 text-yellow-200">
                    {part}
                  </mark>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )
            : currentPageText || '(No text on this page)'}
        </pre>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-[var(--color-border)] px-4 py-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
