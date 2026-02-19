import { useLicenseStore } from '../stores/useLicenseStore';
import type { Domain } from '@docintel/ai-engine';

const FREE_DOMAINS: Domain[] = ['contracts'];

export function useFeatureGate() {
  const { tier, canUploadToday } = useLicenseStore();

  return {
    canUpload: () => canUploadToday(),

    canExport: () => tier === 'pro',

    canAccessDomain: (domain: Domain) => {
      if (tier === 'pro') return true;
      return FREE_DOMAINS.includes(domain);
    },

    canBatchProcess: () => tier === 'pro',

    maxChunksPerQuery: tier === 'pro' ? 10 : 3,

    tier,
    isPro: tier === 'pro',
  };
}
