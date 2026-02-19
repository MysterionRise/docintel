import { DomainPageLayout } from '../components/shared/DomainPageLayout';
import { useDocumentStore } from '../stores/useDocumentStore';
import { Stethoscope, Pill, FlaskConical } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';

export function MedicalPage() {
  const selectedId = useDocumentStore((s) => s.selectedDocumentId);

  return (
    <DomainPageLayout domain="medical" title="Medical Records">
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
        <AlertTriangle size={14} className="mr-2 inline" />
        For informational purposes only — not medical advice. Consult a healthcare professional.
      </div>
      {selectedId != null && (
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            icon={<Stethoscope size={18} />}
            label="Patient Summary"
            desc="Diagnoses & conditions"
            color="bg-red-500/10 text-red-400"
          />
          <QuickAction
            icon={<Pill size={18} />}
            label="Medications"
            desc="Active prescriptions & dosages"
            color="bg-purple-500/10 text-purple-400"
          />
          <QuickAction
            icon={<FlaskConical size={18} />}
            label="Lab Results"
            desc="Test values & ranges"
            color="bg-teal-500/10 text-teal-400"
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
