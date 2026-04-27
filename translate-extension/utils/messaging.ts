import { defineExtensionMessaging } from '@webext-core/messaging';

export interface TranslateBatchMessage {
  tabId?: number;
  sourceLang: string;
  targetLang: string;
  providerId: string;
  segments: Array<{ id: string; text: string }>;
}

export interface SettingsChangedMessage {
  keys: string[];
}

export interface NeedsUnlockMessage {
  reason: 'missing_master_key';
}

export interface UnlockResultMessage {
  ok: boolean;
  password?: string;
  error?: string;
}

export interface ExtensionProtocolMap {
  TRANSLATE_BATCH(data: TranslateBatchMessage): { accepted: boolean };
  SETTINGS_CHANGED(data: SettingsChangedMessage): void;
  NEEDS_UNLOCK(data: NeedsUnlockMessage): void;
  UNLOCK_RESULT(data: UnlockResultMessage): void;
}

const messenger = defineExtensionMessaging<ExtensionProtocolMap>();

export const sendMessage = messenger.sendMessage.bind(messenger);
export const onMessage = messenger.onMessage.bind(messenger);
