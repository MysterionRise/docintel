import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/licenseValidator', () => ({
  validateLicenseKey: vi.fn(),
}));

import { useLicenseStore } from '../../stores/useLicenseStore';
import { validateLicenseKey } from '../../lib/licenseValidator';

describe('useLicenseStore', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      tier: 'free',
      licenseKey: null,
      email: null,
      expiry: null,
      dailyUploads: 0,
      lastUploadDate: '',
    });
    vi.clearAllMocks();
  });

  it('has correct initial state', () => {
    const state = useLicenseStore.getState();
    expect(state.tier).toBe('free');
    expect(state.licenseKey).toBeNull();
    expect(state.email).toBeNull();
  });

  it('activateLicense sets pro tier on valid key', async () => {
    vi.mocked(validateLicenseKey).mockResolvedValue({
      valid: true,
      payload: { email: 'test@example.com', expiry: 99999999, tier: 'pro' },
    });

    const result = await useLicenseStore.getState().activateLicense('valid-key');

    expect(result.success).toBe(true);
    expect(useLicenseStore.getState().tier).toBe('pro');
    expect(useLicenseStore.getState().email).toBe('test@example.com');
  });

  it('activateLicense returns error on invalid key', async () => {
    vi.mocked(validateLicenseKey).mockResolvedValue({
      valid: false,
      error: 'Invalid key',
    });

    const result = await useLicenseStore.getState().activateLicense('bad-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid key');
    expect(useLicenseStore.getState().tier).toBe('free');
  });

  it('deactivateLicense resets to free tier', () => {
    useLicenseStore.setState({ tier: 'pro', licenseKey: 'key', email: 'e@e.com', expiry: 123 });

    useLicenseStore.getState().deactivateLicense();

    const state = useLicenseStore.getState();
    expect(state.tier).toBe('free');
    expect(state.licenseKey).toBeNull();
    expect(state.email).toBeNull();
    expect(state.expiry).toBeNull();
  });

  it('canUploadToday returns true for pro users', () => {
    useLicenseStore.setState({ tier: 'pro', dailyUploads: 100, lastUploadDate: new Date().toISOString().slice(0, 10) });

    expect(useLicenseStore.getState().canUploadToday()).toBe(true);
  });

  it('canUploadToday returns true for free users on new day', () => {
    useLicenseStore.setState({ tier: 'free', dailyUploads: 5, lastUploadDate: '2020-01-01' });

    expect(useLicenseStore.getState().canUploadToday()).toBe(true);
  });

  it('canUploadToday returns false for free users at limit', () => {
    const today = new Date().toISOString().slice(0, 10);
    useLicenseStore.setState({ tier: 'free', dailyUploads: 3, lastUploadDate: today });

    expect(useLicenseStore.getState().canUploadToday()).toBe(false);
  });

  it('recordUpload increments daily count', () => {
    const today = new Date().toISOString().slice(0, 10);
    useLicenseStore.setState({ dailyUploads: 1, lastUploadDate: today });

    useLicenseStore.getState().recordUpload();

    expect(useLicenseStore.getState().dailyUploads).toBe(2);
  });

  it('recordUpload resets count on new day', () => {
    useLicenseStore.setState({ dailyUploads: 5, lastUploadDate: '2020-01-01' });

    useLicenseStore.getState().recordUpload();

    expect(useLicenseStore.getState().dailyUploads).toBe(1);
  });
});
