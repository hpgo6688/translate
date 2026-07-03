import { type TranslateProvider } from '@/core/translators/base';
import { deepseekProvider } from '@/core/translators/deepseek';

const providers: TranslateProvider[] = [deepseekProvider];

export const providerRegistry = new Map(providers.map((provider) => [provider.id, provider]));

const DEFAULT_PROVIDER_ID = 'deepseek';

export function resolveProviderId(providerId: string): string {
  return providerRegistry.has(providerId) ? providerId : DEFAULT_PROVIDER_ID;
}

export function getProvider(providerId: string): TranslateProvider {
  const provider = providerRegistry.get(resolveProviderId(providerId));
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return provider;
}

export function listProviders(): TranslateProvider[] {
  return [...providerRegistry.values()];
}
