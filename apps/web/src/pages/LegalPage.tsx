import { DomainPageLayout } from '../components/shared/DomainPageLayout';
import { useDocumentStore } from '../stores/useDocumentStore';
import { BookOpen, Clock, ShieldCheck, AlertTriangle } from 'lucide-react';

export function LegalPage() {
  const selectedId = useDocumentStore((s) => s.selectedDocumentId);

  return (
    <DomainPageLayout domain="legal" title="Legal Discovery">
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
        <AlertTriangle size={14} className="mr-2 inline" />
        For informational purposes only — not legal advice. Consult a qualified attorney.
      </div>
      {selectedId != null && (
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            icon={<BookOpen size={18} />}
            label="Case References"
            desc="Citations & precedents"
            color="bg-purple-500/10 text-purple-400"
          />
          <QuickAction
            icon={<Clock size={18} />}
            label="Legal Timeline"
            desc="Key dates & deadlines"
            color="bg-amber-500/10 text-amber-400"
          />
          <QuickAction
            icon={<ShieldCheck size={18} />}
            label="Privilege Detection"
            desc="Attorney-client privilege"
            color="bg-emerald-500/10 text-emerald-400"
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
