interface ProgressBarProps {
  progress: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ progress, label, className = '' }: ProgressBarProps) {
  const percent = Math.round(progress * 100);

  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-[var(--color-text-muted)]">
          <span>{label}</span>
          <span>{percent}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
