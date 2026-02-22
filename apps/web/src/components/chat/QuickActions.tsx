import { FileSearch, ListChecks, ShieldAlert } from 'lucide-react';
import type { QuickAction } from '../../hooks/useDocumentChat';

interface QuickActionsProps {
  onAction: (action: QuickAction) => void;
  disabled?: boolean;
}

const ACTIONS: Array<{ action: QuickAction; label: string; icon: typeof FileSearch }> = [
  { action: 'summarize', label: 'Summarize', icon: ListChecks },
  { action: 'extract', label: 'Extract key info', icon: FileSearch },
  { action: 'risks', label: 'Find risks', icon: ShieldAlert },
];

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACTIONS.map(({ action, label, icon: Icon }) => (
        <button
          key={action}
          onClick={() => onAction(action)}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-30"
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}
