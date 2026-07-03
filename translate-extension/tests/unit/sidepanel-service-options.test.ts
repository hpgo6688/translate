import { describe, expect, it } from 'vitest';

import { buildServiceOptions, resolveProviderWithFallback } from '@/entrypoints/sidepanel/service-options';

describe('sidepanel service options', () => {
  it('returns only deepseek provider', () => {
    const options = buildServiceOptions();
    expect(options).toEqual([
      { id: 'deepseek', label: 'DeepSeek v4 Pro', tier: 'pro', badge: 'Pro' },
    ]);
  });

  it('keeps deepseek when active provider is available', () => {
    const options = buildServiceOptions();
    const result = resolveProviderWithFallback('deepseek', options);
    expect(result).toEqual({
      nextProviderId: 'deepseek',
      changed: false,
    });
  });

  it('falls back to deepseek when active provider is unknown', () => {
    const options = buildServiceOptions();
    const result = resolveProviderWithFallback('google', options);
    expect(result).toEqual({
      nextProviderId: 'deepseek',
      changed: true,
    });
  });
});
