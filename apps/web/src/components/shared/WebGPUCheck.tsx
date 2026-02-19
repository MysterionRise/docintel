import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

type GPUStatus = 'checking' | 'available' | 'unavailable';

export function WebGPUCheck({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GPUStatus>('checking');

  useEffect(() => {
    (async () => {
      if (!navigator.gpu) {
        setStatus('unavailable');
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      setStatus(adapter ? 'available' : 'unavailable');
    })();
  }, []);

  if (status === 'checking') return null;

  if (status === 'unavailable') {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
        <AlertTriangle size={40} className="mx-auto mb-3 text-yellow-400" />
        <h3 className="mb-2 text-lg font-semibold text-yellow-300">WebGPU Not Available</h3>
        <p className="text-sm text-yellow-200/80">
          This app requires WebGPU for on-device AI inference. Please use a supported browser:
        </p>
        <ul className="mt-3 space-y-1 text-sm text-yellow-200/60">
          <li>Chrome 113+ or Edge 113+</li>
          <li>Chrome Canary with WebGPU flag enabled</li>
        </ul>
      </div>
    );
  }

  return <>{children}</>;
}
