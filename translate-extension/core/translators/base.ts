export type TranslationSegment = {
  id: string;
  text: string;
};

export type TranslationChunk = {
  id: string;
  text: string;
  done: boolean;
};

export type TranslateOptions = {
  sourceLang: string;
  targetLang: string;
  signal: AbortSignal;
  apiKey?: string;
  providerConfig?: unknown;
};

export type ProviderErrorCode =
  | 'UNSUPPORTED_LANG_PAIR'
  | 'PROVIDER_KEY_MISSING'
  | 'QUOTA_EXCEEDED'
  | 'AUTH_FAILED'
  | 'PROVIDER_FAILED';

export class TranslateProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranslateProviderError';
  }
}

export interface TranslateProvider {
  readonly id: string;
  readonly displayName: string;
  readonly requiresKey: boolean;
  readonly supportedLangs: { source: string[]; target: string[] };
  readonly limits: { maxSegmentChars: number; maxBatchSegments: number; qps: number };
  translate(
    segments: TranslationSegment[],
    opts: TranslateOptions,
  ): AsyncIterable<TranslationChunk>;
}

export function ensureSupportedLanguage(
  provider: TranslateProvider,
  sourceLang: string,
  targetLang: string,
): void {
  const sourceOk =
    sourceLang === 'auto' || provider.supportedLangs.source.includes(sourceLang);
  const targetOk = provider.supportedLangs.target.includes(targetLang);
  if (!sourceOk || !targetOk) {
    throw new TranslateProviderError(
      'UNSUPPORTED_LANG_PAIR',
      `[${provider.id}] does not support ${sourceLang} -> ${targetLang}`,
    );
  }
}
