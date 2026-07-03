import { providerKeyStore } from '@/core/keystore/provider-keys';
import { splitIntoBatches } from '@/core/orchestrator/batcher';
import { splitByCache } from '@/core/orchestrator/cache-filter';
import { OrchestratorQueue } from '@/core/orchestrator/queue';
import { withProviderRetry } from '@/core/orchestrator/retry';
import { streamToTab } from '@/core/orchestrator/streamer';
import { TranslateProviderError, type TranslationSegment } from '@/core/translators/base';
import { getProvider, resolveProviderId } from '@/core/translators';
import { usageMeter } from '@/core/usage/meter';
import { onMessage, type TranslateBatchMessage, type TranslateTextMessage } from '@/utils/messaging';

const queue = new OrchestratorQueue(4, 50, 10);

type ExtensionChrome = {
  tabs: {
    sendMessage: (tabId: number, message: unknown) => Promise<void>;
    create: (options: { url: string }) => Promise<unknown>;
  };
  runtime: {
    getURL: (path: string) => string;
  };
};

function getChrome(): ExtensionChrome {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  if (!extensionChrome) {
    throw new Error('Chrome extension API unavailable');
  }
  return extensionChrome;
}

function mapTranslationError(error: unknown): Error {
  if (error instanceof TranslateProviderError) {
    if (error.code === 'AUTH_FAILED') {
      return new Error('AUTH_FAILED');
    }
    if (error.code === 'PROVIDER_KEY_MISSING') {
      return new Error('CONFIG_MISSING');
    }
    if (error.message.includes('did not include translated text')) {
      return new Error('INVALID_RESPONSE');
    }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error('TIMEOUT');
  }
  return error instanceof Error ? error : new Error('TRANSLATION_FAILED');
}

async function handleTranslateBatch(
  input: TranslateBatchMessage,
  tabId: number,
): Promise<{ accepted: boolean }> {
  const providerId = resolveProviderId(input.providerId);
  const provider = getProvider(providerId);
  const { hits, misses } = await splitByCache({
    provider: provider.id,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    segments: input.segments,
  });

  for (const hit of hits) {
    await getChrome().tabs.sendMessage(tabId, {
      type: 'TRANSLATION_CHUNK',
      payload: {
        id: hit.id,
        text: hit.cache.translation,
        done: true,
      },
    });
  }

  if (misses.length === 0) {
    return { accepted: true };
  }

  const batches = splitIntoBatches(misses);
  for (const batch of batches) {
    await queue.add(async () => {
      const apiKey = provider.requiresKey
        ? await providerKeyStore.getProviderKey(provider.id)
        : undefined;
      const abortController = new AbortController();
      const chunkStream = await withProviderRetry(() =>
        Promise.resolve(
          provider.translate(batch, {
          sourceLang: input.sourceLang,
          targetLang: input.targetLang,
          signal: abortController.signal,
          apiKey: apiKey ?? undefined,
          }),
        ),
      );
      await streamToTab(tabId, chunkStream);
      await usageMeter.increment({
        provider: provider.id,
        charsSubmitted: batch.reduce((acc, segment) => acc + segment.text.length, 0),
        success: true,
      });
    });
  }

  return { accepted: true };
}

async function translateTextViaPipeline(input: TranslateTextMessage): Promise<string> {
  const providerId = resolveProviderId(input.providerId);
  const provider = getProvider(providerId);
  const segments: TranslationSegment[] = [{ id: 'side-panel', text: input.text }];
  const { hits } = await splitByCache({
    provider: provider.id,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    segments,
  });

  if (hits.length > 0) {
    return hits[0]?.cache.translation ?? '';
  }

  const apiKey = provider.requiresKey ? await providerKeyStore.getProviderKey(provider.id) : undefined;
  const abortController = new AbortController();
  const stream = await withProviderRetry(() =>
    Promise.resolve(
      provider.translate(segments, {
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        signal: abortController.signal,
        apiKey: apiKey ?? undefined,
      }),
    ),
  );

  let translatedText = '';
  for await (const chunk of stream) {
    if (chunk.id === 'side-panel') {
      translatedText += chunk.text;
    }
  }

  await usageMeter.increment({
    provider: provider.id,
    charsSubmitted: input.text.length,
    success: true,
  });

  return translatedText;
}

export default defineBackground(() => {
  void providerKeyStore.init();

  const extensionChrome = (globalThis as {
    chrome?: {
      runtime?: {
        onInstalled?: {
          addListener: (
            listener: (details: { reason: string }) => void,
          ) => void;
        };
        getURL?: (path: string) => string;
      };
      tabs?: {
        create?: (options: { url: string }) => void;
      };
    };
  }).chrome;

  extensionChrome?.runtime?.onInstalled?.addListener((details) => {
    if (details.reason !== 'install') {
      return;
    }

    void (async () => {
      const configured = await providerKeyStore.hasAnyConfiguredProvider();
      if (!configured) {
        const optionsUrl =
          extensionChrome.runtime?.getURL?.('options.html#providers') ?? 'options.html#providers';
        extensionChrome.tabs?.create?.({ url: optionsUrl });
      }
    })();
  });

  onMessage('TRANSLATE_BATCH', async (message) => {
    try {
      const maybeSender = message as unknown as { sender?: { tab?: { id?: number } } };
      const tabId = maybeSender.sender?.tab?.id ?? message.data.tabId;
      if (tabId == null) {
        throw new Error('Missing tab id');
      }
      return await handleTranslateBatch(message.data, tabId);
    } catch (error) {
      throw mapTranslationError(error);
    }
  });

  onMessage('TRANSLATE_TEXT', async (message) => {
    try {
      return { text: await translateTextViaPipeline(message.data) };
    } catch (error) {
      throw mapTranslationError(error);
    }
  });

  onMessage('OPEN_OPTIONS_PAGE', async (message) => {
    const normalizedHash = message.data.hash?.replace(/^#/, '') ?? 'general';
    const optionsUrl = getChrome().runtime.getURL(`options.html#${normalizedHash}`);
    await getChrome().tabs.create({ url: optionsUrl });
    return { opened: true };
  });
});
