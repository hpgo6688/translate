import { providerKeyStore } from '@/core/keystore/provider-keys';
import { masterPasswordManager } from '@/core/keystore/master-password';
import { splitIntoBatches } from '@/core/orchestrator/batcher';
import { splitByCache } from '@/core/orchestrator/cache-filter';
import { OrchestratorQueue } from '@/core/orchestrator/queue';
import { withProviderRetry } from '@/core/orchestrator/retry';
import { streamToTab } from '@/core/orchestrator/streamer';
import { TranslateProviderError, type TranslationSegment } from '@/core/translators/base';
import { getProvider } from '@/core/translators';
import { usageMeter } from '@/core/usage/meter';
import { normalizeLiteLlmConfig } from '@/utils/litellm-config';
import { sendMessage, onMessage, type TranslateBatchMessage, type TranslateTextMessage } from '@/utils/messaging';

const queue = new OrchestratorQueue(4, 50, 10);
const pendingUnlockBatches: Array<{ input: TranslateBatchMessage; tabId: number }> = [];
const pendingUnlockTexts: TranslateTextMessage[] = [];

type ExtensionChrome = {
  storage: {
    sync: {
      get: (keys: string[]) => Promise<Record<string, unknown>>;
    };
  };
  tabs: {
    sendMessage: (tabId: number, message: unknown) => Promise<void>;
  };
};

function getChrome(): ExtensionChrome {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  if (!extensionChrome) {
    throw new Error('Chrome extension API unavailable');
  }
  return extensionChrome;
}

async function readLiteLlmConfig(): Promise<ReturnType<typeof normalizeLiteLlmConfig>> {
  const payload = await getChrome().storage.sync.get(['liteLlmConfig']);
  return normalizeLiteLlmConfig(payload.liteLlmConfig);
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
  const provider = getProvider(input.providerId);
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
      const liteLlmConfig =
        provider.id === 'llm'
          ? (input.liteLlmConfig ?? (await readLiteLlmConfig()))
          : null;
      const abortController = new AbortController();
      if (provider.id === 'llm') {
        if (!liteLlmConfig) {
          throw new Error('CONFIG_MISSING');
        }
        setTimeout(() => abortController.abort(), liteLlmConfig.timeoutMs);
      }
      const chunkStream = await withProviderRetry(() =>
        Promise.resolve(
          provider.translate(batch, {
          sourceLang: input.sourceLang,
          targetLang: input.targetLang,
          signal: abortController.signal,
          apiKey: apiKey ?? undefined,
          providerConfig: liteLlmConfig ?? undefined,
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
  const provider = getProvider(input.providerId);
  const segments: TranslationSegment[] = [{ id: 'side-panel', text: input.text }];
  const { hits, misses } = await splitByCache({
    provider: provider.id,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    segments,
  });

  if (hits.length > 0) {
    return hits[0]?.cache.translation ?? '';
  }

  if (provider.requiresKey && masterPasswordManager.getKey() == null && (await providerKeyStore.hasEncryptedKeys())) {
    throw new Error('NEEDS_UNLOCK');
  }

  const apiKey = provider.requiresKey ? await providerKeyStore.getProviderKey(provider.id) : undefined;
  const liteLlmConfig =
    provider.id === 'llm'
      ? (input.liteLlmConfig ?? (await readLiteLlmConfig()))
      : null;
  if (provider.id === 'llm' && !liteLlmConfig) {
    throw new Error('CONFIG_MISSING');
  }
  const abortController = new AbortController();
  if (provider.id === 'llm' && liteLlmConfig) {
    setTimeout(() => abortController.abort(), liteLlmConfig.timeoutMs);
  }
  const stream = await withProviderRetry(() =>
    Promise.resolve(
      provider.translate(segments, {
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        signal: abortController.signal,
        apiKey: apiKey ?? undefined,
        providerConfig: liteLlmConfig ?? undefined,
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
  onMessage('UNLOCK_RESULT', async (message) => {
    if (!message.data.ok || !message.data.password) {
      return;
    }
    await masterPasswordManager.unlock(message.data.password);
    const pending = pendingUnlockBatches.splice(0, pendingUnlockBatches.length);
    for (const item of pending) {
      await handleTranslateBatch(item.input, item.tabId);
    }
    pendingUnlockTexts.splice(0, pendingUnlockTexts.length);
  });

  onMessage('TRANSLATE_BATCH', async (message) => {
    try {
      const maybeSender = message as unknown as { sender?: { tab?: { id?: number } } };
      const tabId = maybeSender.sender?.tab?.id ?? message.data.tabId;
      const provider = getProvider(message.data.providerId);
      if (tabId == null) {
        throw new Error('Missing tab id');
      }
      if (
        provider.requiresKey &&
        masterPasswordManager.getKey() == null &&
        (await providerKeyStore.hasEncryptedKeys())
      ) {
        pendingUnlockBatches.push({ input: message.data, tabId });
        await sendMessage('NEEDS_UNLOCK', { reason: 'missing_master_key' });
        return { accepted: false };
      }
      return await handleTranslateBatch(message.data, tabId);
    } catch (error) {
      if ((error as Error).message === 'NEEDS_UNLOCK') {
        const maybeSender = message as unknown as { sender?: { tab?: { id?: number } } };
        const tabId = maybeSender.sender?.tab?.id ?? message.data.tabId;
        if (tabId != null) {
          pendingUnlockBatches.push({ input: message.data, tabId });
        }
        await sendMessage('NEEDS_UNLOCK', { reason: 'missing_master_key' });
      }
      throw mapTranslationError(error);
    }
  });

  onMessage('TRANSLATE_TEXT', async (message) => {
    try {
      return { text: await translateTextViaPipeline(message.data) };
    } catch (error) {
      if ((error as Error).message === 'NEEDS_UNLOCK') {
        await sendMessage('NEEDS_UNLOCK', { reason: 'missing_master_key' });
        pendingUnlockTexts.push(message.data);
      }
      throw mapTranslationError(error);
    }
  });
});
