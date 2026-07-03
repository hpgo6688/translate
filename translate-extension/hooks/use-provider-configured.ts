import { useEffect, useState } from 'react';

import { providerKeyStore } from '@/core/keystore/provider-keys';

type ExtensionChrome = {
  storage: {
    onChanged: {
      addListener: (
        listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void,
      ) => void;
      removeListener: (
        listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void,
      ) => void;
    };
  };
};

function getChrome(): ExtensionChrome {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  if (!extensionChrome) {
    throw new Error('Chrome extension API unavailable');
  }
  return extensionChrome;
}

export function useProviderConfigured(): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const refresh = async (): Promise<void> => {
      const next = await providerKeyStore.hasAnyConfiguredProvider();
      if (active) {
        setConfigured(next);
      }
    };

    void refresh();

    const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string): void => {
      if (areaName === 'sync' && (changes.settings || changes.providerConfigs)) {
        void refresh();
        return;
      }
      if (areaName === 'local' && changes.providerKeys) {
        void refresh();
      }
    };

    getChrome().storage.onChanged.addListener(listener);
    return () => {
      active = false;
      getChrome().storage.onChanged.removeListener(listener);
    };
  }, []);

  return configured;
}
