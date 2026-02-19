import { DomainPageLayout } from '../components/shared/DomainPageLayout';
import { useDocumentStore } from '../stores/useDocumentStore';
import { TrendingUp, Receipt, PieChart } from 'lucide-react';

export function FinancialPage() {
  const selectedId = useDocumentStore((s) => s.selectedDocumentId);

  return (
    <DomainPageLayout domain="financial" title="Financial Documents">
      {selectedId != null && (
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            icon={<TrendingUp size={18} />}
            label="Financial Summary"
            desc="Revenue, expenses & profit"
            color="bg-green-500/10 text-green-400"
          />
          <QuickAction
            icon={<PieChart size={18} />}
            label="Key Ratios"
            desc="Performance indicators"
            color="bg-blue-500/10 text-blue-400"
          />
          <QuickAction
            icon={<Receipt size={18} />}
            label="Batch Invoices"
            desc="Process multiple invoices"
            color="bg-amber-500/10 text-amber-400"
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
