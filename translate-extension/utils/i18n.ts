import i18n, { type InitOptions } from 'i18next';

import en from '@/locales/en.json';
import zhCN from '@/locales/zh-CN.json';

export interface SetupI18nOptions extends InitOptions {
  languageOverride?: string;
}

function detectUiLanguage(): string {
  const extensionChrome = (globalThis as { chrome?: { i18n?: { getUILanguage?: () => string } } })
    .chrome;
  if (extensionChrome?.i18n?.getUILanguage) {
    return extensionChrome.i18n.getUILanguage();
  }
  return 'en';
}

export async function setupI18n(options: SetupI18nOptions = {}): Promise<typeof i18n> {
  const resolvedLng = options.languageOverride ?? options.lng ?? detectUiLanguage();

  if (!i18n.isInitialized) {
    await i18n.init({
      resources: {
        en: { translation: en },
        'zh-CN': { translation: zhCN },
      },
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      ...options,
      lng: resolvedLng,
    });
    return i18n;
  }

  await i18n.changeLanguage(resolvedLng);
  return i18n;
}

export { i18n };
