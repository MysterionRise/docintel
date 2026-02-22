import { CheckCircle, Loader2, FileText, Scissors, Cpu, AlertCircle } from 'lucide-react';
import type { ProcessingStatus } from '@docintel/document-parser';

interface ProcessingProgressProps {
  status: ProcessingStatus;
  progress: number;
  statusText?: string;
  chunkCount?: number;
}

const STAGES: Array<{
  key: ProcessingStatus;
  label: string;
  icon: typeof FileText;
}> = [
  { key: 'parsing', label: 'Parsing', icon: FileText },
  { key: 'chunking', label: 'Chunking', icon: Scissors },
  { key: 'embedding', label: 'Embedding', icon: Cpu },
];

function getStageIndex(status: ProcessingStatus): number {
  const idx = STAGES.findIndex((s) => s.key === status);
  if (status === 'done') return STAGES.length;
  if (status === 'ocr') return 0; // OCR is part of parsing stage
  return idx >= 0 ? idx : -1;
}

export function ProcessingProgress({ status, progress, statusText, chunkCount }: ProcessingProgressProps) {
  if (status === 'idle') return null;

  const currentStageIdx = getStageIndex(status);
  const isDone = status === 'done';
  const isError = status === 'error';

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {/* Stage indicators */}
      <div className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isComplete = i < currentStageIdx;
          const isCurrent = i === currentStageIdx && !isDone && !isError;
          const isPending = i > currentStageIdx;

          return (
            <div key={stage.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    isComplete
                      ? 'bg-green-500/20 text-green-400'
                      : isCurrent
                        ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                        : isPending
                          ? 'bg-white/5 text-[var(--color-text-muted)]'
                          : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {isComplete || (isDone && i <= currentStageIdx) ? (
                    <CheckCircle size={16} />
                  ) : isCurrent ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Icon size={16} />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    isComplete || isDone
                      ? 'text-green-400'
                      : isCurrent
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STAGES.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 rounded-full transition-colors ${
                    isComplete ? 'bg-green-500/30' : 'bg-white/10'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar for current stage */}
      {!isDone && !isError && progress > 0 && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Status text */}
      <div className="mt-2 text-center text-xs text-[var(--color-text-muted)]">
        {isError ? (
          <span className="flex items-center justify-center gap-1 text-red-400">
            <AlertCircle size={12} />
            {statusText ?? 'Processing failed'}
          </span>
        ) : isDone ? (
          <span className="flex items-center justify-center gap-1 text-green-400">
            <CheckCircle size={12} />
            Done{chunkCount ? ` — ${chunkCount} chunks indexed` : ''}
          </span>
        ) : (
          statusText ?? `${STAGES[currentStageIdx]?.label ?? 'Processing'}...`
        )}
      </div>
    </div>
  );
}
