import { FileText, HeartPulse, DollarSign, Scale } from 'lucide-react';
import { Link } from 'react-router';

const domains = [
  { to: '/contracts', label: 'Contracts', desc: 'Clause extraction, obligation tracking, risk scoring', icon: FileText, color: 'bg-blue-500/10 text-blue-400' },
  { to: '/medical', label: 'Medical Records', desc: 'Patient summaries, medication timelines, lab results', icon: HeartPulse, color: 'bg-red-500/10 text-red-400' },
  { to: '/financial', label: 'Financial Documents', desc: 'Revenue analysis, ratio extraction, batch invoices', icon: DollarSign, color: 'bg-green-500/10 text-green-400' },
  { to: '/legal', label: 'Legal Discovery', desc: 'Case references, legal timelines, privilege detection', icon: Scale, color: 'bg-purple-500/10 text-purple-400' },
];

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-2 text-2xl font-bold">Welcome to DocIntel</h2>
      <p className="mb-8 text-[var(--color-text-muted)]">
        AI-powered document analysis running entirely on your device. Choose a domain to get started.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {domains.map(({ to, label, desc, icon: Icon, color }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-colors hover:border-[var(--color-primary)]"
          >
            <div className={`mb-3 inline-flex rounded-lg p-2 ${color}`}>
              <Icon size={24} />
            </div>
            <h3 className="mb-1 font-semibold group-hover:text-[var(--color-primary)]">{label}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
