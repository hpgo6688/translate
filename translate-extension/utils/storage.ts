import { defineExtensionStorage } from '@webext-core/storage';

type ExtensionChrome = {
  storage: {
    local: unknown;
    sync: unknown;
  };
};

const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;

export interface LocalStorageSchema {
  providerKeys: Record<string, string>;
  cacheLimits: {
    ttlDays: number;
    maxRecords: number;
  };
  uiLocaleOverride: string | null;
}

export interface SyncStorageSchema {
  defaultSourceLang: string;
  defaultTargetLang: string;
  defaultProviderId: string;
  translationEnabled: boolean;
}

const localStorageArea = defineExtensionStorage<LocalStorageSchema>(
  extensionChrome!.storage.local as Parameters<typeof defineExtensionStorage>[0],
);
const syncStorageArea = defineExtensionStorage<SyncStorageSchema>(
  extensionChrome!.storage.sync as Parameters<typeof defineExtensionStorage>[0],
);

export const storage = {
  local: localStorageArea,
  sync: syncStorageArea,
};
