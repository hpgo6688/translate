import '@/assets/tailwind.css';
import { assignParagraphIds } from '@/core/dom/paragraph-id';
import { injectTranslation, removeTranslation } from '@/core/dom/injector';
import type { DisplayMode } from '@/core/dom/injector';
import { observeDomChanges } from '@/core/dom/observer';
import { applyStyleVariables, defaultTranslationStyle, listenStyleChanges } from '@/core/dom/style-engine';
import { observeInViewport } from '@/core/dom/viewport';
import { collectTranslatableParagraphs } from '@/core/dom/walker';
import { mountFloatingButton } from '@/entrypoints/content/floating-button';
import { sendMessage } from '@/utils/messaging';

type ParagraphState = {
  id: string;
  element: HTMLElement;
  text: string;
};

type GeneralSettings = {
  defaultSourceLang: string;
  defaultTargetLang: string;
  defaultProviderId: string;
  masterEnabled: boolean;
};

type ShortcutSettings = {
  hoverTranslateHotkey: string;
};

const paragraphById = new Map<string, ParagraphState>();
const hoverRequestById = new Map<string, HTMLElement>();
const hoverIdByElement = new WeakMap<HTMLElement, string>();
const hoverLoadingById = new Map<string, HTMLSpanElement>();
const hoverLoadingTimeoutById = new Map<string, number>();
const hoverLoadingPositionRestore = new WeakMap<HTMLElement, string>();
let currentMode: DisplayMode = 'below';
let hoverRequestSeq = 0;
let hoverLoadingStyleReady = false;

type RuntimeMessage = {
  type: string;
  payload: {
    id: string;
    text: string;
  };
};

type ExtensionChrome = {
  runtime: {
    onMessage: {
      addListener: (listener: (message: RuntimeMessage) => void) => void;
    };
  };
  storage: {
    sync: {
      get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    };
    onChanged: {
      addListener: (listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) => void;
      removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) => void;
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

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'below' || value === 'side-by-side' || value === 'replace';
}

async function scanAndQueue(config: {
  sourceLang: string;
  targetLang: string;
  providerId: string;
}) {
  const candidates = collectTranslatableParagraphs(document);
  const paragraphs = await assignParagraphIds(candidates);
  for (const paragraph of paragraphs) {
    paragraphById.set(paragraph.id, paragraph);
  }

  const unobserve = observeInViewport(
    paragraphs.map((paragraph) => paragraph.element),
    (element) => {
      const item = paragraphs.find((paragraph) => paragraph.element === element);
      if (!item) {
        return;
      }
      void sendMessage('TRANSLATE_BATCH', {
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        providerId: config.providerId,
        segments: [{ id: item.id, text: item.text }],
      });
    },
  );
  return unobserve;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function parseGeneralSettings(value: unknown): GeneralSettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybe = value as Partial<GeneralSettings>;
  if (
    !isNonEmptyString(maybe.defaultSourceLang) ||
    !isNonEmptyString(maybe.defaultTargetLang) ||
    !isNonEmptyString(maybe.defaultProviderId) ||
    !isBoolean(maybe.masterEnabled)
  ) {
    return null;
  }
  return {
    defaultSourceLang: maybe.defaultSourceLang,
    defaultTargetLang: maybe.defaultTargetLang,
    defaultProviderId: maybe.defaultProviderId,
    masterEnabled: maybe.masterEnabled,
  };
}

function parseShortcutSettings(value: unknown): ShortcutSettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybe = value as Partial<ShortcutSettings>;
  if (!isNonEmptyString(maybe.hoverTranslateHotkey)) {
    return null;
  }
  return {
    hoverTranslateHotkey: maybe.hoverTranslateHotkey,
  };
}

function normalizeHotkey(input: string): string {
  const value = input.trim().toLowerCase();
  if (value === 'option') {
    return 'alt';
  }
  if (value === 'control') {
    return 'control';
  }
  if (value === 'shift') {
    return 'shift';
  }
  return value;
}

function resolveHoverTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  if (!target.isConnected) {
    return null;
  }
  if (target.closest('[data-translation-wrapper]')) {
    return null;
  }
  return target;
}

function ensureHoverLoadingStyle(): void {
  if (hoverLoadingStyleReady) {
    return;
  }
  const style = document.createElement('style');
  style.textContent = `
    @keyframes translate-ext-hover-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.append(style);
  hoverLoadingStyleReady = true;
}

function attachHoverLoading(target: HTMLElement, id: string): void {
  ensureHoverLoadingStyle();
  detachHoverLoading(id);
  if (getComputedStyle(target).position === 'static') {
    hoverLoadingPositionRestore.set(target, target.style.position);
    target.style.position = 'relative';
  }
  const spinner = document.createElement('span');
  spinner.setAttribute('data-translate-hover-loading', id);
  spinner.setAttribute('aria-hidden', 'true');
  spinner.style.position = 'absolute';
  spinner.style.right = '-6px';
  spinner.style.top = '50%';
  spinner.style.width = '12px';
  spinner.style.height = '12px';
  spinner.style.marginTop = '-6px';
  spinner.style.border = '2px solid rgba(148, 163, 184, 0.45)';
  spinner.style.borderTopColor = '#475569';
  spinner.style.borderRadius = '9999px';
  spinner.style.pointerEvents = 'none';
  spinner.style.zIndex = '2147483647';
  spinner.style.animation = 'translate-ext-hover-spin 0.8s linear infinite';
  target.append(spinner);
  hoverLoadingById.set(id, spinner);
  const timeoutId = window.setTimeout(() => {
    detachHoverLoading(id);
    hoverRequestById.delete(id);
  }, 15000);
  hoverLoadingTimeoutById.set(id, timeoutId);
}

function detachHoverLoading(id: string): void {
  const spinner = hoverLoadingById.get(id);
  const timeoutId = hoverLoadingTimeoutById.get(id);
  if (timeoutId !== undefined) {
    window.clearTimeout(timeoutId);
    hoverLoadingTimeoutById.delete(id);
  }
  if (!spinner) {
    return;
  }
  const host = spinner.parentElement;
  spinner.remove();
  hoverLoadingById.delete(id);
  if (!host) {
    return;
  }
  const nextRestore = hoverLoadingPositionRestore.get(host);
  if (nextRestore === undefined) {
    return;
  }
  if (!host.querySelector('[data-translate-hover-loading]')) {
    host.style.position = nextRestore;
    hoverLoadingPositionRestore.delete(host);
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: false,
  cssInjectionMode: 'ui',
  async main(ctx) {
    const initial = await getChrome().storage.sync.get([
      'translationStyle',
      'popupEnabled',
      'popupTargetLang',
      'popupProviderId',
      'settings',
    ]);
    const initialStyle = initial.translationStyle as
      | {
          displayMode?: unknown;
          color?: string;
          backgroundColor?: string;
          fontScale?: number;
          decoration?: string;
          blurPx?: number;
        }
      | undefined;
    let popupEnabled = isBoolean(initial.popupEnabled) ? initial.popupEnabled : false;
    let sourceLang = 'auto';
    let targetLang = 'zh-CN';
    let providerId = 'google';
    let masterEnabled = true;
    let hoverTranslateHotkey = 'Option';
    let currentHoverTarget: HTMLElement | null = null;
    let activeHoverTarget: HTMLElement | null = null;
    let activeHoverRequestId: string | null = null;
    const initialSettings = initial.settings as { general?: unknown; shortcuts?: unknown } | undefined;
    const initialGeneral = parseGeneralSettings(initialSettings?.general);
    const initialShortcuts = parseShortcutSettings(initialSettings?.shortcuts);
    if (initialGeneral) {
      sourceLang = initialGeneral.defaultSourceLang;
      targetLang = initialGeneral.defaultTargetLang;
      providerId = initialGeneral.defaultProviderId;
      masterEnabled = initialGeneral.masterEnabled;
    }
    if (initialShortcuts) {
      hoverTranslateHotkey = initialShortcuts.hoverTranslateHotkey;
    }
    if (isNonEmptyString(initial.popupTargetLang)) {
      targetLang = initial.popupTargetLang;
    }
    if (isNonEmptyString(initial.popupProviderId)) {
      providerId = initial.popupProviderId;
    }
    if (isDisplayMode(initialStyle?.displayMode)) {
      currentMode = initialStyle.displayMode;
    }
    applyStyleVariables(defaultTranslationStyle);
    if (initialStyle) {
      applyStyleVariables({
        color: typeof initialStyle.color === 'string' ? initialStyle.color : defaultTranslationStyle.color,
        backgroundColor:
          typeof initialStyle.backgroundColor === 'string' &&
          initialStyle.backgroundColor.trim() !== ''
            ? initialStyle.backgroundColor
            : defaultTranslationStyle.backgroundColor,
        fontScale:
          typeof initialStyle.fontScale === 'number'
            ? initialStyle.fontScale
            : defaultTranslationStyle.fontScale,
        decoration:
          initialStyle.decoration === 'underline' ||
          initialStyle.decoration === 'dashed-underline' ||
          initialStyle.decoration === 'wavy-underline' ||
          initialStyle.decoration === 'dashed-box'
            ? initialStyle.decoration
            : defaultTranslationStyle.decoration,
        blurPx:
          typeof initialStyle.blurPx === 'number' ? initialStyle.blurPx : defaultTranslationStyle.blurPx,
      });
    }
    const stopStyleSync = listenStyleChanges((nextStyle) => {
      applyStyleVariables(nextStyle);
      const maybeDisplayMode = (nextStyle as unknown as { displayMode?: unknown }).displayMode;
      if (isDisplayMode(maybeDisplayMode)) {
        currentMode = maybeDisplayMode;
      }
    });
    const storageListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'sync') {
        return;
      }
      let shouldRescan = false;
      if (isBoolean(changes.popupEnabled?.newValue)) {
        popupEnabled = changes.popupEnabled.newValue;
        shouldRescan = shouldRescan || popupEnabled;
      }
      if (changes.settings?.newValue) {
        const parsedSettings = changes.settings.newValue as { general?: unknown; shortcuts?: unknown };
        const nextGeneral = parseGeneralSettings(parsedSettings.general);
        const nextShortcuts = parseShortcutSettings(parsedSettings.shortcuts);
        if (nextGeneral) {
          const hasLanguageChanged =
            sourceLang !== nextGeneral.defaultSourceLang || targetLang !== nextGeneral.defaultTargetLang;
          const hasProviderChanged = providerId !== nextGeneral.defaultProviderId;
          sourceLang = nextGeneral.defaultSourceLang;
          targetLang = nextGeneral.defaultTargetLang;
          providerId = nextGeneral.defaultProviderId;
          masterEnabled = nextGeneral.masterEnabled;
          shouldRescan = shouldRescan || hasLanguageChanged || hasProviderChanged;
        }
        if (nextShortcuts) {
          hoverTranslateHotkey = nextShortcuts.hoverTranslateHotkey;
        }
      }
      if (isNonEmptyString(changes.popupTargetLang?.newValue)) {
        const hasPopupTargetChanged = targetLang !== changes.popupTargetLang.newValue;
        targetLang = changes.popupTargetLang.newValue;
        shouldRescan = shouldRescan || hasPopupTargetChanged;
      }
      if (isNonEmptyString(changes.popupProviderId?.newValue)) {
        const hasPopupProviderChanged = providerId !== changes.popupProviderId.newValue;
        providerId = changes.popupProviderId.newValue;
        shouldRescan = shouldRescan || hasPopupProviderChanged;
      }
      if (shouldRescan && popupEnabled && masterEnabled) {
        void scanAndQueue({ sourceLang, targetLang, providerId });
      }
    };
    getChrome().storage.onChanged.addListener(storageListener);

    const pointerListener = (event: MouseEvent) => {
      currentHoverTarget = resolveHoverTarget(event.target);
    };
    const keydownListener = (event: KeyboardEvent) => {
      if (!masterEnabled || !currentHoverTarget) {
        return;
      }
      if (normalizeHotkey(event.key) !== normalizeHotkey(hoverTranslateHotkey)) {
        return;
      }
      event.preventDefault();
      if (activeHoverTarget === currentHoverTarget && activeHoverRequestId) {
        detachHoverLoading(activeHoverRequestId);
        hoverRequestById.delete(activeHoverRequestId);
        removeTranslation({
          id: activeHoverRequestId,
          element: activeHoverTarget,
          mode: 'below',
        });
        activeHoverRequestId = null;
        activeHoverTarget = null;
        return;
      }
      let requestId = hoverIdByElement.get(currentHoverTarget);
      if (!requestId) {
        hoverRequestSeq += 1;
        requestId = `hover-${hoverRequestSeq}`;
        hoverIdByElement.set(currentHoverTarget, requestId);
      }
      const hoverText = currentHoverTarget.innerText.trim();
      if (!hoverText) {
        activeHoverTarget = null;
        activeHoverRequestId = null;
        return;
      }
      hoverRequestById.set(requestId, currentHoverTarget);
      attachHoverLoading(currentHoverTarget, requestId);
      activeHoverTarget = currentHoverTarget;
      activeHoverRequestId = requestId;
      void sendMessage('TRANSLATE_BATCH', {
        sourceLang,
        targetLang,
        providerId,
        segments: [{ id: requestId, text: hoverText }],
      });
    };
    document.addEventListener('mousemove', pointerListener, { passive: true });
    document.addEventListener('keydown', keydownListener);

    await mountFloatingButton(ctx, {
      onTranslate: () => {
        if (!popupEnabled || !masterEnabled) {
          return;
        }
        void scanAndQueue({ sourceLang, targetLang, providerId });
      },
    });

    const stopObserve = observeDomChanges(document.documentElement, () => {
      if (!popupEnabled || !masterEnabled) {
        return;
      }
      void scanAndQueue({ sourceLang, targetLang, providerId });
    });

    getChrome().runtime.onMessage.addListener((message) => {
      if (message?.type === 'POPUP_TRANSLATE_START') {
        if (!popupEnabled || !masterEnabled) {
          return;
        }
        void scanAndQueue({ sourceLang, targetLang, providerId });
        return;
      }
      if (message?.type !== 'TRANSLATION_CHUNK') {
        return;
      }
      if (!masterEnabled) {
        return;
      }
      const hoverTarget = hoverRequestById.get(message.payload.id);
      if (hoverTarget) {
        hoverRequestById.delete(message.payload.id);
        detachHoverLoading(message.payload.id);
        void injectTranslation(ctx, {
          id: message.payload.id,
          element: hoverTarget,
          translation: message.payload.text,
          mode: 'below',
        });
        return;
      }
      if (popupEnabled) {
        const target = paragraphById.get(message.payload.id);
        if (!target) {
          return;
        }
        void injectTranslation(ctx, {
          id: target.id,
          element: target.element,
          translation: message.payload.text,
          mode: currentMode,
        });
      }
    });

    if (popupEnabled && masterEnabled) {
      void scanAndQueue({ sourceLang, targetLang, providerId });
    }

    return () => {
      stopStyleSync();
      stopObserve();
      for (const id of hoverLoadingById.keys()) {
        detachHoverLoading(id);
      }
      document.removeEventListener('mousemove', pointerListener);
      document.removeEventListener('keydown', keydownListener);
      getChrome().storage.onChanged.removeListener(storageListener);
    };
  },
});
