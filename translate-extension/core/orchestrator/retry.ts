import pRetry, { AbortError } from 'p-retry';

import { TranslateProviderError } from '@/core/translators/base';

export function shouldRetryError(error: unknown): boolean {
  if (error instanceof TranslateProviderError) {
    return error.code === 'PROVIDER_FAILED' || error.code === 'QUOTA_EXCEEDED';
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    /network/i.test(error.message) ||
    /fetch/i.test(error.message) ||
    /429|502|503|504/.test(error.message)
  );
}

export async function withProviderRetry<T>(operation: () => Promise<T>): Promise<T> {
  return pRetry(operation, {
    retries: 2,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 4000,
    onFailedAttempt(context) {
      if (!shouldRetryError(context.error)) {
        throw new AbortError(context.error);
      }
    },
  });
}
