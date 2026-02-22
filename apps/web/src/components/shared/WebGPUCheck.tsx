import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { detectCapabilities } from '@docintel/ai-engine';

type GPUStatus = 'checking' | 'available' | 'fallback';

export function WebGPUCheck({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GPUStatus>('checking');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    detectCapabilities().then((cap) => {
      setStatus(cap.hasWebGPU ? 'available' : 'fallback');
    });
  }, []);

  if (status === 'checking') return null;

  return (
    <>
      {status === 'fallback' && !dismissed && (
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <Cpu size={20} className="mt-0.5 shrink-0 text-yellow-400" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-yellow-300">WebGPU Not Available</h3>
            <p className="mt-1 text-xs text-yellow-200/80">
              AI inference will use CPU (WASM) mode, which is slower but fully functional.
              For better performance, use Chrome 113+ or Edge 113+.
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-xs text-yellow-400/60 hover:text-yellow-400"
          >
            Dismiss
          </button>
        </div>
      )}
      {children}
    </>
  );
}
