import { defineExtensionMessaging } from '@webext-core/messaging';

export interface TranslateBatchMessage {
  tabId?: number;
  sourceLang: string;
  targetLang: string;
  providerId: string;
  segments: Array<{ id: string; text: string }>;
}

export interface TranslateTextMessage {
  sourceLang: string;
  targetLang: string;
  providerId: string;
  text: string;
}

export interface SettingsChangedMessage {
  keys: string[];
}

export interface OpenOptionsPageMessage {
  hash?: string;
}

export interface ExtensionProtocolMap {
  TRANSLATE_BATCH(data: TranslateBatchMessage): { accepted: boolean };
  TRANSLATE_TEXT(data: TranslateTextMessage): { text: string };
  SETTINGS_CHANGED(data: SettingsChangedMessage): void;
  OPEN_OPTIONS_PAGE(data: OpenOptionsPageMessage): { opened: boolean };
}

const messenger = defineExtensionMessaging<ExtensionProtocolMap>();

export const sendMessage = messenger.sendMessage.bind(messenger);
export const onMessage = messenger.onMessage.bind(messenger);
