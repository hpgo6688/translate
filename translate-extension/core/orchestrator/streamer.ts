import type { TranslationChunk } from '@/core/translators/base';

type ExtensionChrome = {
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

export async function streamToTab(
  tabId: number,
  source: AsyncIterable<TranslationChunk>,
): Promise<void> {
  for await (const chunk of source) {
    await getChrome().tabs.sendMessage(tabId, {
      type: 'TRANSLATION_CHUNK',
      payload: chunk,
    });
  }
}
