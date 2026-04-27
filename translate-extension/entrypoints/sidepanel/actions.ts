import type { ExtensionProtocolMap } from '@/utils/messaging';

type SidePanelChrome = {
  sidePanel?: {
    open?: (options: { windowId?: number }) => Promise<void>;
  };
  windows?: {
    getCurrent?: () => Promise<{ id?: number }>;
  };
};

type SendMessageLike = <K extends keyof ExtensionProtocolMap>(
  messageType: K,
  data: Parameters<ExtensionProtocolMap[K]>[0],
) => Promise<Awaited<ReturnType<ExtensionProtocolMap[K]>>>;

export async function openExtensionSidePanel(chromeApi?: SidePanelChrome): Promise<void> {
  const extensionChrome = chromeApi ?? ((globalThis as { chrome?: SidePanelChrome }).chrome ?? {});
  const windowInfo = await extensionChrome.windows?.getCurrent?.();
  await extensionChrome.sidePanel?.open?.({ windowId: windowInfo?.id });
}

export async function requestSidePanelTranslation(
  sendMessageLike: SendMessageLike,
  payload: {
    sourceLang: string;
    targetLang: string;
    providerId: string;
    text: string;
  },
): Promise<string> {
  const response = await sendMessageLike('TRANSLATE_TEXT', payload);
  return response.text;
}
