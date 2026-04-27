import {
  type TranslateOptions,
  type TranslateProvider,
  type TranslationSegment,
  TranslateProviderError,
  ensureSupportedLanguage,
} from '@/core/translators/base';

const GOOGLE_SUPPORTED_TARGETS = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'it', 'pt'];

type GoogleResponse = Array<Array<[string]>>;

async function translateSingle(
  segment: TranslationSegment,
  opts: TranslateOptions,
): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('dt', 't');
  url.searchParams.set('sl', opts.sourceLang);
  url.searchParams.set('tl', opts.targetLang);
  url.searchParams.set('q', segment.text);

  const response = await fetch(url, { signal: opts.signal });
  if (!response.ok) {
    throw new TranslateProviderError(
      'PROVIDER_FAILED',
      `Google translate failed with status ${response.status}`,
    );
  }

  const payload = (await response.json()) as GoogleResponse;
  const translated = payload?.[0]?.map((item) => item[0]).join('') ?? '';
  return translated;
}

export const googleProvider: TranslateProvider = {
  id: 'google',
  displayName: 'Google',
  requiresKey: false,
  supportedLangs: {
    source: ['auto', 'en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'it', 'pt'],
    target: GOOGLE_SUPPORTED_TARGETS,
  },
  limits: {
    maxSegmentChars: 5000,
    maxBatchSegments: 50,
    qps: 10,
  },
  async *translate(segments, opts) {
    ensureSupportedLanguage(this, opts.sourceLang, opts.targetLang);
    const translated = await Promise.all(
      segments.map(async (segment) => ({
        id: segment.id,
        text: await translateSingle(segment, opts),
      })),
    );
    for (const segment of translated) {
      yield {
        ...segment,
        done: true,
      };
    }
  },
};
