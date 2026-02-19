import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tier } from '../types';
import { validateLicenseKey } from '../lib/licenseValidator';

interface LicenseState {
  tier: Tier;
  licenseKey: string | null;
  email: string | null;
  expiry: number | null;
  dailyUploads: number;
  lastUploadDate: string;
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>;
  deactivateLicense: () => void;
  recordUpload: () => void;
  canUploadToday: () => boolean;
}

const MAX_FREE_UPLOADS = 3;

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      licenseKey: null,
      email: null,
      expiry: null,
      dailyUploads: 0,
      lastUploadDate: '',

      activateLicense: async (key) => {
        const result = await validateLicenseKey(key);
        if (result.valid && result.payload) {
          set({
            tier: 'pro',
            licenseKey: key,
            email: result.payload.email,
            expiry: result.payload.expiry,
          });
          return { success: true };
        }
        return { success: false, error: result.error };
      },

      deactivateLicense: () => {
        set({ tier: 'free', licenseKey: null, email: null, expiry: null });
      },

      recordUpload: () => {
        const today = getToday();
        const state = get();
        if (state.lastUploadDate !== today) {
          set({ dailyUploads: 1, lastUploadDate: today });
        } else {
          set({ dailyUploads: state.dailyUploads + 1 });
        }
      },

      canUploadToday: () => {
        const state = get();
        if (state.tier === 'pro') return true;
        const today = getToday();
        if (state.lastUploadDate !== today) return true;
        return state.dailyUploads < MAX_FREE_UPLOADS;
      },
    }),
    { name: 'docintel-license' },
  ),
);
