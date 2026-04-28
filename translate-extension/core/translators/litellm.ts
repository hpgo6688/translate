import {
  type TranslateOptions,
  type TranslateProvider,
  TranslateProviderError,
  ensureSupportedLanguage,
} from '@/core/translators/base';
import type { LiteLlmConfig } from '@/utils/litellm-config';

type LiteLlmResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const LLM_SUPPORTED_TARGETS = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'it', 'pt'];
const SYSTEM_PROMPT =
  'You are a translation engine. Return only the translated text without explanations, prefixes, or quotes.';

function buildLiteLlmChatEndpoint(rawEndpoint: string): string {
  const normalized = rawEndpoint.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  // Some users paste the models listing endpoint; route it back to base API path.
  const withoutModels = normalized.replace(/\/models$/, '');
  return `${withoutModels}/chat/completions`;
}

function readConfig(opts: TranslateOptions): LiteLlmConfig {
  const config = opts.providerConfig as LiteLlmConfig | undefined;
  if (!config?.endpoint || !config.model || !config.apiKey) {
    throw new TranslateProviderError(
      'PROVIDER_KEY_MISSING',
      'LiteLLM config missing endpoint, api key, or model',
    );
  }
  return config;
}

export const liteLlmProvider: TranslateProvider = {
  id: 'llm',
  displayName: 'LiteLLM',
  requiresKey: false,
  supportedLangs: {
    source: ['auto', 'en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'it', 'pt'],
    target: LLM_SUPPORTED_TARGETS,
  },
  limits: {
    maxSegmentChars: 8000,
    maxBatchSegments: 20,
    qps: 3,
  },
  async *translate(segments, opts) {
    ensureSupportedLanguage(this, opts.sourceLang, opts.targetLang);
    const config = readConfig(opts);
    const endpoint = buildLiteLlmChatEndpoint(config.endpoint);

    for (const segment of segments) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: opts.signal,
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Translate from ${opts.sourceLang} to ${opts.targetLang}:\n\n${segment.text}`,
            },
          ],
        }),
      });

      if (response.status === 401 || response.status === 403) {
        throw new TranslateProviderError('AUTH_FAILED', 'LiteLLM authentication failed');
      }
      if (!response.ok) {
        throw new TranslateProviderError(
          'PROVIDER_FAILED',
          `LiteLLM request failed with status ${response.status}`,
        );
      }

      const payload = (await response.json()) as LiteLlmResponse;
      const translated = payload.choices?.[0]?.message?.content?.trim();
      if (!translated) {
        throw new TranslateProviderError(
          'PROVIDER_FAILED',
          'LiteLLM response did not include translated text',
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
