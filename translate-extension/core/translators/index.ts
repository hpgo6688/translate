import { type TranslateProvider } from '@/core/translators/base';
import { deeplFreeProvider } from '@/core/translators/deepl';
import { googleProvider } from '@/core/translators/google';

const providers: TranslateProvider[] = [googleProvider, deeplFreeProvider];

export const providerRegistry = new Map(providers.map((provider) => [provider.id, provider]));

export function getProvider(providerId: string): TranslateProvider {
  const provider = providerRegistry.get(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return provider;
}

export function listProviders(): TranslateProvider[] {
  return [...providerRegistry.values()];
}
