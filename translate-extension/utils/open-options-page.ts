import { sendMessage } from '@/utils/messaging';

type ExtensionChrome = {
  runtime?: {
    getURL?: (path: string) => string;
  };
  tabs?: {
    create?: (options: { url: string }) => void | Promise<void>;
  };
};

export async function openOptionsPage(hash = 'general'): Promise<void> {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  const normalizedHash = hash.replace(/^#/, '');

  if (extensionChrome?.tabs?.create && extensionChrome.runtime?.getURL) {
    await extensionChrome.tabs.create({
      url: extensionChrome.runtime.getURL(`options.html#${normalizedHash}`),
    });
    return;
  }

  await sendMessage('OPEN_OPTIONS_PAGE', { hash: normalizedHash });
}
