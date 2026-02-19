import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

const DEFAULT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.tiff,.tif';

export function FileUploader({ onFiles, accept = DEFAULT_ACCEPT, multiple = true }: FileUploaderProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(files);
      e.target.value = '';
    },
    [onFiles],
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors ${
        dragging
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
      }`}
    >
      <Upload size={32} className="text-[var(--color-text-muted)]" />
      <span className="text-sm text-[var(--color-text-muted)]">
        Drag & drop files here, or click to browse
      </span>
      <span className="text-xs text-[var(--color-text-muted)]">
        PDF, PNG, JPG, TIFF
      </span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
    </label>
  );
}
