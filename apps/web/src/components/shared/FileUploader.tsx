import { useCallback, useState } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react';

interface FileUploaderProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
}

interface FileEntry {
  file: File;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
}

const DEFAULT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.tiff,.tif,.txt,.md';
const VALID_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.txt', '.md'];
const MAX_FILE_SIZE_MB = 200;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File, maxSizeMB: number): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!VALID_EXTENSIONS.includes(ext)) {
    return `Unsupported file type: ${ext}. Accepted: PDF, PNG, JPG, TIFF, TXT`;
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File too large (${formatSize(file.size)}). Max: ${maxSizeMB} MB`;
  }
  if (file.size === 0) {
    return 'File is empty';
  }
  return null;
}

export function FileUploader({
  onFiles,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  maxSizeMB = MAX_FILE_SIZE_MB,
}: FileUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);

  const processFiles = useCallback(
    (incoming: File[]) => {
      const entries: FileEntry[] = [];
      const validFiles: File[] = [];

      for (const file of incoming) {
        const error = validateFile(file, maxSizeMB);
        if (error) {
          entries.push({ file, status: 'error', error });
        } else {
          entries.push({ file, status: 'queued' });
          validFiles.push(file);
        }
      }

      setFiles(entries);

      if (validFiles.length > 0) {
        onFiles(validFiles);
        // Mark queued files as processing
        setFiles((prev) =>
          prev.map((f) => (f.status === 'queued' ? { ...f, status: 'processing' } : f)),
        );
      }
    },
    [onFiles, maxSizeMB],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const incoming = Array.from(e.dataTransfer.files);
      if (incoming.length) processFiles(incoming);
    },
    [processFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const incoming = Array.from(e.target.files ?? []);
      if (incoming.length) processFiles(incoming);
      e.target.value = '';
    },
    [processFiles],
  );

  const clearFiles = () => setFiles([]);

  const hasErrors = files.some((f) => f.status === 'error');

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
        }`}
      >
        <Upload size={28} className="text-[var(--color-text-muted)]" />
        <span className="text-sm text-[var(--color-text-muted)]">
          {dragging ? 'Release to upload' : 'Drop files here, or click to browse'}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          PDF, PNG, JPG, TIFF, TXT &middot; Max {maxSizeMB} MB
        </span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </label>

      {/* File list with status */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((entry, i) => (
            <div
              key={`${entry.file.name}-${i}`}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
                entry.status === 'error'
                  ? 'bg-red-500/10 text-red-400'
                  : entry.status === 'done'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
              }`}
            >
              {entry.status === 'error' ? (
                <AlertTriangle size={12} />
              ) : entry.status === 'done' ? (
                <CheckCircle size={12} />
              ) : entry.status === 'processing' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileText size={12} />
              )}
              <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
              <span className="shrink-0">{formatSize(entry.file.size)}</span>
              {entry.error && (
                <span className="shrink-0 text-red-400">{entry.error}</span>
              )}
            </div>
          ))}
          {(hasErrors || files.every((f) => f.status === 'done' || f.status === 'error')) && (
            <button
              onClick={clearFiles}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
