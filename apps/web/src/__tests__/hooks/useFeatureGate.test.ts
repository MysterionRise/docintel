import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../lib/licenseValidator', () => ({
  validateLicenseKey: vi.fn(),
}));

import { useLicenseStore } from '../../stores/useLicenseStore';
import { useFeatureGate } from '../../hooks/useFeatureGate';

describe('useFeatureGate', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      tier: 'free',
      licenseKey: null,
      email: null,
      expiry: null,
      dailyUploads: 0,
      lastUploadDate: '',
    });
  });

  it('free tier can access contracts domain', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canAccessDomain('contracts')).toBe(true);
  });

  it('free tier cannot access medical domain', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canAccessDomain('medical')).toBe(false);
  });

  it('free tier cannot access financial domain', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canAccessDomain('financial')).toBe(false);
  });

  it('free tier cannot access legal domain', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canAccessDomain('legal')).toBe(false);
  });

  it('pro tier can access all domains', () => {
    useLicenseStore.setState({ tier: 'pro' });

    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canAccessDomain('contracts')).toBe(true);
    expect(result.current.canAccessDomain('medical')).toBe(true);
    expect(result.current.canAccessDomain('financial')).toBe(true);
    expect(result.current.canAccessDomain('legal')).toBe(true);
  });

  it('free tier cannot export', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canExport()).toBe(false);
  });

  it('pro tier can export', () => {
    useLicenseStore.setState({ tier: 'pro' });
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canExport()).toBe(true);
  });

  it('free tier cannot batch process', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canBatchProcess()).toBe(false);
  });

  it('pro tier can batch process', () => {
    useLicenseStore.setState({ tier: 'pro' });
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.canBatchProcess()).toBe(true);
  });

  it('free tier has lower chunk limit', () => {
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.maxChunksPerQuery).toBe(3);
  });

  it('pro tier has higher chunk limit', () => {
    useLicenseStore.setState({ tier: 'pro' });
    const { result } = renderHook(() => useFeatureGate());
    expect(result.current.maxChunksPerQuery).toBe(10);
  });

  it('isPro reflects tier', () => {
    const { result: freeResult } = renderHook(() => useFeatureGate());
    expect(freeResult.current.isPro).toBe(false);

    useLicenseStore.setState({ tier: 'pro' });
    const { result: proResult } = renderHook(() => useFeatureGate());
    expect(proResult.current.isPro).toBe(true);
  });
});
