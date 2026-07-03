import { listProviders } from '@/core/translators';

const PROVIDER_KEY_BAG = 'providerKeys';
const PROVIDER_CONFIG_KEY = 'providerConfigs';
const SETTINGS_KEY = 'settings';

export type ProviderConfig = {
  enabled: boolean;
  requiresKey: boolean;
  apiKey?: string;
};

type ProviderConfigRecord = Record<string, ProviderConfig>;
type ProviderKeyRecord = Record<string, string>;

type ChangeRecord = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: ChangeRecord, areaName: string) => void;

type ExtensionChrome = {
  storage: {
    local: {
      get: (keys?: string | string[]) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    sync: {
      get: (keys?: string | string[]) => Promise<Record<string, unknown>>;
    };
    onChanged: {
      addListener: (listener: ChangeListener) => void;
      removeListener: (listener: ChangeListener) => void;
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

export class ProviderKeyStore {
  private providerConfigs: ProviderConfigRecord = {};
  private removeStorageListener: (() => void) | null = null;

  async init(): Promise<void> {
    const extensionChrome = getChrome();
    const current = await extensionChrome.storage.sync.get(PROVIDER_CONFIG_KEY);
    this.providerConfigs =
      (current[PROVIDER_CONFIG_KEY] as ProviderConfigRecord | undefined) ?? {};

    const listener: ChangeListener = (changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }
      const changed = changes[PROVIDER_CONFIG_KEY];
      if (!changed?.newValue) {
        return;
      }
      this.providerConfigs = changed.newValue as ProviderConfigRecord;
    };
    extensionChrome.storage.onChanged.addListener(listener);
    this.removeStorageListener = () =>
      extensionChrome.storage.onChanged.removeListener(listener);
  }

  dispose(): void {
    this.removeStorageListener?.();
    this.removeStorageListener = null;
  }

  getProviderConfig(providerId: string): ProviderConfig | null {
    return this.providerConfigs[providerId] ?? null;
  }

  async setProviderKey(providerId: string, plaintextKey: string): Promise<void> {
    const bag = await this.getKeyBag();
    bag[providerId] = plaintextKey;
    await getChrome().storage.local.set({ [PROVIDER_KEY_BAG]: bag });
  }

  async getProviderKey(providerId: string): Promise<string | null> {
    const fromLocal = (await this.getKeyBag())[providerId]?.trim();
    if (fromLocal) {
      return fromLocal;
    }

    const syncPayload = await getChrome().storage.sync.get([SETTINGS_KEY]);
    const settings = syncPayload[SETTINGS_KEY] as { providers?: ProviderConfigRecord } | undefined;
    const fromSettings = settings?.providers?.[providerId]?.apiKey?.trim();
    return fromSettings || null;
  }

  async clearProviderKey(providerId: string): Promise<void> {
    const bag = await this.getKeyBag();
    delete bag[providerId];
    await getChrome().storage.local.set({ [PROVIDER_KEY_BAG]: bag });
  }

  async isProviderConfigured(providerId: string): Promise<boolean> {
    const provider = listProviders().find((item) => item.id === providerId);
    if (!provider) {
      return false;
    }

    const config = this.getProviderConfig(providerId);
    if (config && !config.enabled) {
      return false;
    }

    if (!provider.requiresKey) {
      return true;
    }

    const key = await this.getProviderKey(providerId);
    return Boolean(key);
  }

  async hasAnyConfiguredProvider(): Promise<boolean> {
    for (const provider of listProviders()) {
      if (await this.isProviderConfigured(provider.id)) {
        return true;
      }
    }
    return false;
  }

  private async getKeyBag(): Promise<ProviderKeyRecord> {
    const result = await getChrome().storage.local.get(PROVIDER_KEY_BAG);
    return (result[PROVIDER_KEY_BAG] as ProviderKeyRecord | undefined) ?? {};
  }
}

export const providerKeyStore = new ProviderKeyStore();
