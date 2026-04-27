import { describe, expect, it } from 'vitest';

import { buildServiceOptions, resolveProviderWithFallback } from '@/entrypoints/sidepanel/service-options';

describe('sidepanel service options', () => {
  it('keeps pro provider disabled for free users', () => {
    const options = buildServiceOptions(false);
    const deeplOption = options.find((item) => item.id === 'deepl');
    expect(deeplOption?.disabled).toBe(true);
  });

  it('enables deepl option for pro users', () => {
    const options = buildServiceOptions(true);
    const deeplOption = options.find((item) => item.id === 'deepl');
    expect(deeplOption?.disabled).toBe(false);
  });

  it('falls back to first available provider when active is unavailable', () => {
    const options = buildServiceOptions(false);
    const result = resolveProviderWithFallback('deepl', options);
    expect(result).toEqual({
      nextProviderId: 'google',
      changed: true,
    });
  });
});
