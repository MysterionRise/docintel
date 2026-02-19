import { ModelStatusBadge } from '../shared/ModelStatusBadge';

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <h1 className="text-sm font-medium text-[var(--color-text-muted)]">
        On-Device Document Intelligence
      </h1>
      <ModelStatusBadge />
    </header>
  );
}
