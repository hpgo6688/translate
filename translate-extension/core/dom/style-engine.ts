const ROOT_SELECTOR = ':root';
const STYLE_PREFIX = '--translate-ext';

export type TranslationStyle = {
  color: string;
  fontScale: number;
  decoration: 'none' | 'underline' | 'dashed-underline' | 'wavy-underline' | 'dashed-box';
  blurPx: number;
};

export const defaultTranslationStyle: TranslationStyle = {
  color: '#334155',
  fontScale: 100,
  decoration: 'none',
  blurPx: 0,
};

type ChangeRecord = Record<string, { newValue?: unknown }>;
type ChangeListener = (changes: ChangeRecord, areaName: string) => void;
type ExtensionChrome = {
  storage: {
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

export function applyStyleVariables(style: TranslationStyle): void {
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (!root) {
    return;
  }
  root.style.setProperty(`${STYLE_PREFIX}-color`, style.color);
  root.style.setProperty(`${STYLE_PREFIX}-font-scale`, `${style.fontScale}%`);
  root.style.setProperty(`${STYLE_PREFIX}-decoration`, style.decoration);
  root.style.setProperty(`${STYLE_PREFIX}-blur`, `${style.blurPx}px`);
}

export function listenStyleChanges(onUpdate: (style: TranslationStyle) => void): () => void {
  const listener: ChangeListener = (changes, area) => {
    if (area !== 'sync' || !changes.translationStyle?.newValue) {
      return;
    }
    onUpdate(changes.translationStyle.newValue as TranslationStyle);
  };
  const extensionChrome = getChrome();
  extensionChrome.storage.onChanged.addListener(listener);
  return () => extensionChrome.storage.onChanged.removeListener(listener);
}
