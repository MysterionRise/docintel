import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { db } from '../../lib/db';
import type { DocDocument, DocChunk } from '../../types/document';

interface DocumentViewerProps {
  documentId: number;
}

export function DocumentViewer({ documentId }: DocumentViewerProps) {
  const [document, setDocument] = useState<DocDocument | null>(null);
  const [chunks, setChunks] = useState<DocChunk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

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

    return () => { cancelled = true; };
  }, [documentId]);

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

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="font-semibold">{document.name}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {document.pageCount} pages &middot; {chunks.length} chunks
        </p>
      </div>
      <div className="max-h-96 overflow-auto p-4">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-muted)]">
          {document.rawText}
        </pre>
      </div>
    </div>
  );
}
