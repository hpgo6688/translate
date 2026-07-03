export type ProviderOption = {
  id: string;
  label: string;
  tier: 'free' | 'pro';
  disabled?: boolean;
  badge?: string;
};

export function buildServiceOptions(): ProviderOption[] {
  return [{ id: 'deepseek', label: 'DeepSeek v4 Pro', tier: 'pro', badge: 'Pro' }];
}

export function resolveProviderWithFallback(
  activeProviderId: string,
  options: ProviderOption[],
): { nextProviderId: string; changed: boolean } {
  const activeOption = options.find((item) => item.id === activeProviderId && !item.disabled);
  if (activeOption) {
    return { nextProviderId: activeProviderId, changed: false };
  }

  const fallback = options.find((item) => !item.disabled) ?? options[0];
  return { nextProviderId: fallback?.id ?? 'deepseek', changed: Boolean(fallback && fallback.id !== activeProviderId) };
}
