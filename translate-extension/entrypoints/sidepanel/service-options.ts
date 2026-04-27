export type ProviderOption = {
  id: string;
  label: string;
  tier: 'free' | 'pro';
  disabled?: boolean;
  badge?: string;
};

export function buildServiceOptions(isProUser: boolean): ProviderOption[] {
  return [
    { id: 'google', label: 'Free Translation Service', tier: 'free' },
    { id: 'deepl', label: 'DeepL Pro', tier: 'pro', disabled: !isProUser, badge: 'Pro' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini', tier: 'pro', disabled: true, badge: 'Pro' },
    { id: 'claude-haiku', label: 'Claude Haiku 4.5', tier: 'pro', disabled: true, badge: 'Pro' },
  ];
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
  return { nextProviderId: fallback?.id ?? activeProviderId, changed: Boolean(fallback && fallback.id !== activeProviderId) };
}
