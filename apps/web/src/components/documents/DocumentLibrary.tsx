import { useState, useMemo } from 'react';
import {
  FileText,
  Trash2,
  Search,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  Calendar,
  HardDrive,
} from 'lucide-react';
import type { DocDocument } from '../../types/document';
import type { Domain } from '@docintel/ai-engine';

interface DocumentLibraryProps {
  documents: DocDocument[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

type SortKey = 'name' | 'date' | 'size' | 'pages';
type ViewMode = 'list' | 'grid';

const DOMAIN_COLORS: Record<Domain, string> = {
  contracts: 'bg-blue-500/20 text-blue-400',
  medical: 'bg-green-500/20 text-green-400',
  financial: 'bg-yellow-500/20 text-yellow-400',
  legal: 'bg-purple-500/20 text-purple-400',
};

export function DocumentLibrary({ documents, selectedId, onSelect, onDelete }: DocumentLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all');

  const filteredDocs = useMemo(() => {
    let result = [...documents];

    // Domain filter
    if (domainFilter !== 'all') {
      result = result.filter((d) => d.domain === domainFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q));
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'date':
          cmp = a.uploadedAt - b.uploadedAt;
          break;
        case 'size':
          cmp = a.fileSize - b.fileSize;
          break;
        case 'pages':
          cmp = a.pageCount - b.pageCount;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [documents, searchQuery, sortKey, sortAsc, domainFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  if (!documents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
        <FileText size={40} className="mb-2 opacity-40" />
        <p className="text-sm">No documents yet</p>
        <p className="text-xs">Upload a PDF or image to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5">
          <Search size={14} className="text-[var(--color-text-muted)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        {/* Domain filter */}
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value as Domain | 'all')}
          className="rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none"
        >
          <option value="all">All domains</option>
          <option value="contracts">Contracts</option>
          <option value="medical">Medical</option>
          <option value="financial">Financial</option>
          <option value="legal">Legal</option>
        </select>

        {/* Sort */}
        <button
          onClick={() => toggleSort(sortKey === 'date' ? 'name' : sortKey === 'name' ? 'size' : 'date')}
          className="rounded-lg bg-[var(--color-surface)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title={`Sort by ${sortKey} (${sortAsc ? 'asc' : 'desc'})`}
        >
          <ArrowUpDown size={14} />
        </button>

        {/* View toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          className="rounded-lg bg-[var(--color-surface)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {viewMode === 'list' ? <LayoutGrid size={14} /> : <LayoutList size={14} />}
        </button>
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--color-text-muted)]">
        {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
      </p>

      {/* Document list/grid */}
      {viewMode === 'list' ? (
        <div className="flex flex-col gap-1">
          {filteredDocs.map((doc) => (
            <DocumentListItem
              key={doc.id}
              doc={doc}
              isSelected={selectedId === doc.id}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredDocs.map((doc) => (
            <DocumentGridItem
              key={doc.id}
              doc={doc}
              isSelected={selectedId === doc.id}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentListItem({
  doc,
  isSelected,
  onSelect,
  onDelete,
}: {
  doc: DocDocument;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      onClick={() => doc.id != null && onSelect(doc.id)}
      className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isSelected
          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'hover:bg-white/5'
      }`}
    >
      <FileText size={16} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.name}</p>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span>{doc.pageCount} pg</span>
          <span>&middot;</span>
          <span>{formatSize(doc.fileSize)}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${DOMAIN_COLORS[doc.domain as Domain] ?? 'bg-gray-500/20 text-gray-400'}`}
          >
            {doc.domain}
          </span>
        </div>
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
  );
}

function DocumentGridItem({
  doc,
  isSelected,
  onSelect,
  onDelete,
}: {
  doc: DocDocument;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      onClick={() => doc.id != null && onSelect(doc.id)}
      className={`group cursor-pointer rounded-lg border p-3 transition-colors ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <FileText size={20} className="text-[var(--color-text-muted)]" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (doc.id != null) onDelete(doc.id);
          }}
          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <p className="truncate text-xs font-medium">{doc.name}</p>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
        <span className="flex items-center gap-0.5">
          <Calendar size={8} /> {new Date(doc.uploadedAt).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-0.5">
          <HardDrive size={8} /> {formatSize(doc.fileSize)}
        </span>
      </div>
      <span
        className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${DOMAIN_COLORS[doc.domain as Domain] ?? 'bg-gray-500/20 text-gray-400'}`}
      >
        {doc.domain}
      </span>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
