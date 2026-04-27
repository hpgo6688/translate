import { decrypt, encrypt } from '@/utils/crypto';

import { masterPasswordManager } from '@/core/keystore/master-password';

const PROVIDER_KEY_BAG = 'encryptedProviderKeys';
const PROVIDER_CONFIG_KEY = 'providerConfigs';

type EncryptedProviderKey = {
  ciphertext: string;
  iv: string;
};

export type ProviderConfig = {
  enabled: boolean;
  requiresKey: boolean;
};

type ProviderConfigRecord = Record<string, ProviderConfig>;

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
    const key = masterPasswordManager.getKey();
    if (!key) {
      throw new Error('NEEDS_UNLOCK');
    }

    const encrypted = await encrypt(key, plaintextKey);
    const bag = await this.getEncryptedKeyBag();
    bag[providerId] = encrypted;
    await getChrome().storage.local.set({ [PROVIDER_KEY_BAG]: bag });
  }

  async getProviderKey(providerId: string): Promise<string | null> {
    const key = masterPasswordManager.getKey();
    if (!key) {
      throw new Error('NEEDS_UNLOCK');
    }

    const bag = await this.getEncryptedKeyBag();
    const encrypted = bag[providerId];
    if (!encrypted) {
      return null;
    }
    return decrypt(key, encrypted.ciphertext, encrypted.iv);
  }

  async clearProviderKey(providerId: string): Promise<void> {
    const bag = await this.getEncryptedKeyBag();
    delete bag[providerId];
    await getChrome().storage.local.set({ [PROVIDER_KEY_BAG]: bag });
  }

  async hasEncryptedKeys(): Promise<boolean> {
    const bag = await this.getEncryptedKeyBag();
    return Object.keys(bag).length > 0;
  }

  private async getEncryptedKeyBag(): Promise<Record<string, EncryptedProviderKey>> {
    const result = await getChrome().storage.local.get(PROVIDER_KEY_BAG);
    return (result[PROVIDER_KEY_BAG] as Record<string, EncryptedProviderKey> | undefined) ?? {};
  }
}

export const providerKeyStore = new ProviderKeyStore();
