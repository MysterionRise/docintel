import { DomainPageLayout } from '../components/shared/DomainPageLayout';
import { useDocumentStore } from '../stores/useDocumentStore';
import { ShieldAlert, CalendarClock, FileCheck } from 'lucide-react';

export function ContractsPage() {
  const selectedId = useDocumentStore((s) => s.selectedDocumentId);

  return (
    <DomainPageLayout domain="contracts" title="Contract Analysis">
      {selectedId != null && (
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            icon={<FileCheck size={18} />}
            label="Extract Clauses"
            desc="Key obligations & terms"
            color="bg-blue-500/10 text-blue-400"
          />
          <QuickAction
            icon={<CalendarClock size={18} />}
            label="Track Deadlines"
            desc="Important dates & milestones"
            color="bg-amber-500/10 text-amber-400"
          />
          <QuickAction
            icon={<ShieldAlert size={18} />}
            label="Risk Assessment"
            desc="Liability & indemnification"
            color="bg-red-500/10 text-red-400"
          />
        </div>
      )}
    </DomainPageLayout>
  );
}

function QuickAction({ icon, label, desc, color }: { icon: React.ReactNode; label: string; desc: string; color: string }) {
  return (
    <button className={`flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3 text-left transition-colors hover:border-[var(--color-primary)] ${color}`}>
      {icon}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs opacity-70">{desc}</p>
      </div>
    </button>
  );
}
