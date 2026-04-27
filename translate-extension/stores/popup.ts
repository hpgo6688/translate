import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PopupState = {
  enabled: boolean;
  targetLang: string;
  providerId: string;
  selectionEnabled: boolean;
  selectionMode: string;
  sessionChars: number;
  cacheHitRate: number;
  setEnabled: (enabled: boolean) => Promise<void>;
  setTargetLang: (targetLang: string) => Promise<void>;
  setProviderId: (providerId: string) => Promise<void>;
  setSelectionEnabled: (selectionEnabled: boolean) => Promise<void>;
  setSelectionMode: (selectionMode: string) => Promise<void>;
};

type ExtensionChrome = {
  storage: {
    sync: {
      set: (items: Record<string, unknown>) => Promise<void>;
      get: (keys: string[]) => Promise<Record<string, unknown>>;
    };
    onChanged: {
      addListener: (listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) => void;
      removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) => void;
    };
  };
  tabs: {
    query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<Array<{ id?: number }>>;
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

async function notifyActiveTabStart(): Promise<void> {
  const tabs = await getChrome().tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId == null) {
    return;
  }
  await getChrome().tabs.sendMessage(tabId, { type: 'POPUP_TRANSLATE_START' });
}

export const usePopupStore = create<PopupState>()(
  persist(
    (set) => ({
      enabled: false,
      targetLang: 'zh-CN',
      providerId: 'google',
      selectionEnabled: false,
      selectionMode: 'direct',
      sessionChars: 0,
      cacheHitRate: 0,
      async setEnabled(enabled) {
        set({ enabled });
        await getChrome().storage.sync.set({ popupEnabled: enabled });
        if (enabled) {
          setTimeout(() => {
            void notifyActiveTabStart();
          }, 100);
        }
      },
      async setTargetLang(targetLang) {
        set({ targetLang });
        await getChrome().storage.sync.set({ popupTargetLang: targetLang });
      },
      async setProviderId(providerId) {
        set({ providerId });
        await getChrome().storage.sync.set({ popupProviderId: providerId });
      },
      async setSelectionEnabled(selectionEnabled) {
        set({ selectionEnabled });
        await getChrome().storage.sync.set({ popupSelectionEnabled: selectionEnabled });
      },
      async setSelectionMode(selectionMode) {
        set({ selectionMode });
        await getChrome().storage.sync.set({ popupSelectionMode: selectionMode });
      },
    }),
    {
      name: 'popup-store',
    },
  ),
);

let removeStorageListener: (() => void) | null = null;

export function startPopupStorageSync(): () => void {
  if (removeStorageListener) {
    return removeStorageListener;
  }
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== 'sync') {
      return;
    }
    if (typeof changes.popupEnabled?.newValue === 'boolean') {
      usePopupStore.setState({ enabled: changes.popupEnabled.newValue });
    }
    if (typeof changes.popupTargetLang?.newValue === 'string') {
      usePopupStore.setState({ targetLang: changes.popupTargetLang.newValue });
    }
    if (typeof changes.popupProviderId?.newValue === 'string') {
      usePopupStore.setState({ providerId: changes.popupProviderId.newValue });
    }
    if (typeof changes.popupSelectionEnabled?.newValue === 'boolean') {
      usePopupStore.setState({ selectionEnabled: changes.popupSelectionEnabled.newValue });
    }
    if (typeof changes.popupSelectionMode?.newValue === 'string') {
      usePopupStore.setState({ selectionMode: changes.popupSelectionMode.newValue });
    }
  };
  getChrome().storage.onChanged.addListener(listener);
  removeStorageListener = () => {
    getChrome().storage.onChanged.removeListener(listener);
    removeStorageListener = null;
  };
  return removeStorageListener;
}
