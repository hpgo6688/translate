import {
  type TranslateProvider,
  TranslateProviderError,
  ensureSupportedLanguage,
} from '@/core/translators/base';

type AnthropicMessageResponse = {
  content?: Array<{
    type: string;
    text?: string;
  }>;
};

const DEEPSEEK_MESSAGES_URL = 'https://api.deepseek.com/anthropic/v1/messages';
const DEEPSEEK_MODEL = 'deepseek-v4-pro';
const ANTHROPIC_VERSION = '2023-06-01';

const DEEPSEEK_SUPPORTED_TARGETS = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'it', 'pt'];
const SYSTEM_PROMPT =
  'You are a translation engine. Return only the translated text without explanations, prefixes, or quotes.';

function readTranslatedText(payload: AnthropicMessageResponse): string | null {
  const textBlock = payload.content?.find((block) => block.type === 'text');
  const translated = textBlock?.text?.trim();
  return translated || null;
}

export const deepseekProvider: TranslateProvider = {
  id: 'deepseek',
  displayName: 'DeepSeek v4 Pro',
  requiresKey: true,
  supportedLangs: {
    source: ['auto', ...DEEPSEEK_SUPPORTED_TARGETS],
    target: DEEPSEEK_SUPPORTED_TARGETS,
  },
  limits: {
    maxSegmentChars: 8000,
    maxBatchSegments: 20,
    qps: 3,
  },
  async *translate(segments, opts) {
    ensureSupportedLanguage(this, opts.sourceLang, opts.targetLang);

    if (!opts.apiKey) {
      throw new TranslateProviderError(
        'PROVIDER_KEY_MISSING',
        'DeepSeek API key is required',
      );
    }

    for (const segment of segments) {
      const response = await fetch(DEEPSEEK_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        signal: opts.signal,
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          max_tokens: 4096,
          temperature: 0.2,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Translate from ${opts.sourceLang} to ${opts.targetLang}:\n\n${segment.text}`,
            },
          ],
        }),
      });

      if (response.status === 401 || response.status === 403) {
        throw new TranslateProviderError('AUTH_FAILED', 'DeepSeek authentication failed');
      }
      if (!response.ok) {
        throw new TranslateProviderError(
          'PROVIDER_FAILED',
          `DeepSeek request failed with status ${response.status}`,
        );
      }

      const payload = (await response.json()) as AnthropicMessageResponse;
      const translated = readTranslatedText(payload);
      if (!translated) {
        throw new TranslateProviderError(
          'PROVIDER_FAILED',
          'DeepSeek response did not include translated text',
        );
      }

      yield {
        id: segment.id,
        text: translated,
        done: true,
      };
    }
  },
};
