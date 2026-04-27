import {
  type TranslateProvider,
  TranslateProviderError,
  ensureSupportedLanguage,
} from '@/core/translators/base';

type DeepLResponse = {
  translations: Array<{ text: string }>;
};

const DEEPL_SUPPORTED_LANGS = ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru'];

function toDeepLTarget(targetLang: string): string {
  if (targetLang === 'zh-CN') {
    return 'zh';
  }
  return targetLang;
}

export const deeplFreeProvider: TranslateProvider = {
  id: 'deepl',
  displayName: 'DeepL Free',
  requiresKey: true,
  supportedLangs: {
    source: ['auto', ...DEEPL_SUPPORTED_LANGS],
    target: DEEPL_SUPPORTED_LANGS,
  },
  limits: {
    maxSegmentChars: 5000,
    maxBatchSegments: 50,
    qps: 5,
  },
  async *translate(segments, opts) {
    ensureSupportedLanguage(this, opts.sourceLang, toDeepLTarget(opts.targetLang));

    if (!opts.apiKey) {
      throw new TranslateProviderError('PROVIDER_KEY_MISSING', 'DeepL API key is required');
    }

    const body = new URLSearchParams();
    for (const segment of segments) {
      body.append('text', segment.text);
    }
    body.set('target_lang', toDeepLTarget(opts.targetLang).toUpperCase());
    if (opts.sourceLang !== 'auto') {
      body.set('source_lang', toDeepLTarget(opts.sourceLang).toUpperCase());
    }

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${opts.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: opts.signal,
    });

    if (response.status === 456) {
      throw new TranslateProviderError(
        'QUOTA_EXCEEDED',
        'DeepL free-tier quota exceeded. Please check your usage.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new TranslateProviderError('AUTH_FAILED', 'DeepL authentication failed');
    }
    if (!response.ok) {
      throw new TranslateProviderError(
        'PROVIDER_FAILED',
        `DeepL request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as DeepLResponse;
    for (const [index, segment] of segments.entries()) {
      yield {
        id: segment.id,
        text: payload.translations[index]?.text ?? '',
        done: true,
      };
    }
  },
};
