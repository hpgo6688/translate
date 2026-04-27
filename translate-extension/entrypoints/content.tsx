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
const paragraphIdByElement = new WeakMap<HTMLElement, string>();
const hoverRequestById = new Map<string, HTMLElement>();
const hoverIdByElement = new WeakMap<HTMLElement, string>();
const hoverLoadingById = new Map<string, HTMLSpanElement>();
const hoverLoadingTimeoutById = new Map<string, number>();
const hoverLoadingPositionRestore = new WeakMap<HTMLElement, string>();
const selectionRequestById = new Map<string, { x: number; y: number }>();
let selectionActionButton: HTMLButtonElement | null = null;
let selectionCardElement: HTMLDivElement | null = null;
let selectionCardBodyElement: HTMLDivElement | null = null;
let selectionCardPinButton: HTMLButtonElement | null = null;
let selectionCardPinned = false;
const translatedParagraphIds = new Set<string>();
let currentMode: DisplayMode = 'below';
let hoverRequestSeq = 0;
let selectionRequestSeq = 0;
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
    paragraphIdByElement.set(paragraph.element, paragraph.id);
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

function isSelectionMode(value: unknown): value is 'direct' | 'icon' | 'mini-icon' | 'ctrl' | 'option' | 'shift' {
  return (
    value === 'direct' ||
    value === 'icon' ||
    value === 'mini-icon' ||
    value === 'ctrl' ||
    value === 'option' ||
    value === 'shift'
  );
}

function showSelectionTranslation(text: string, x: number, y: number): void {
  const card = ensureSelectionCard();
  if (!card || !selectionCardBodyElement) {
    return;
  }
  selectionCardBodyElement.textContent = text;
  card.style.display = 'block';
  if (selectionCardPinned) {
    card.style.opacity = '1';
    return;
  }
  const width = card.offsetWidth || 360;
  const height = card.offsetHeight || 170;
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  card.style.left = `${Math.max(8, Math.min(maxLeft, x))}px`;
  card.style.top = `${Math.max(8, Math.min(maxTop, y + 8))}px`;
  card.style.opacity = '1';
}

function updatePinButtonStyle(): void {
  if (!selectionCardPinButton) {
    return;
  }
  selectionCardPinButton.textContent = selectionCardPinned ? 'Unpin' : 'Pin';
  selectionCardPinButton.style.background = selectionCardPinned ? '#2563eb' : '#eef2ff';
  selectionCardPinButton.style.color = selectionCardPinned ? '#ffffff' : '#1e3a8a';
}

function closeSelectionCard(): void {
  if (!selectionCardElement) {
    return;
  }
  selectionCardElement.style.display = 'none';
}

function clampCardToViewportWithAnimation(card: HTMLDivElement): void {
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  const rawLeft = Number.parseFloat(card.style.left || '0');
  const rawTop = Number.parseFloat(card.style.top || '0');
  const nextLeft = Math.max(8, Math.min(maxLeft, rawLeft));
  const nextTop = Math.max(8, Math.min(maxTop, rawTop));
  if (nextLeft === rawLeft && nextTop === rawTop) {
    return;
  }
  card.style.transition = 'left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1)';
  card.style.left = `${nextLeft}px`;
  card.style.top = `${nextTop}px`;
  window.setTimeout(() => {
    if (selectionCardElement === card) {
      card.style.transition = '';
    }
  }, 220);
}

function ensureSelectionCard(): HTMLDivElement | null {
  if (selectionCardElement?.isConnected) {
    return selectionCardElement;
  }
  const card = document.createElement('div');
  card.setAttribute('data-translate-selection-card', 'true');
  card.style.position = 'fixed';
  card.style.left = '12px';
  card.style.top = '12px';
  card.style.width = '360px';
  card.style.maxWidth = 'calc(100vw - 16px)';
  card.style.minHeight = '120px';
  card.style.background = '#ffffff';
  card.style.border = '1px solid rgba(148, 163, 184, 0.28)';
  card.style.borderRadius = '14px';
  card.style.boxShadow = '0 20px 40px rgba(15, 23, 42, 0.16)';
  card.style.zIndex = '2147483647';
  card.style.overflow = 'hidden';
  card.style.display = 'none';
  card.style.opacity = '0';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.padding = '10px 12px';
  header.style.background = '#f8fafc';
  header.style.borderBottom = '1px solid rgba(148, 163, 184, 0.18)';
  header.style.cursor = 'move';

  const title = document.createElement('div');
  title.textContent = 'Translation';
  title.style.fontSize = '13px';
  title.style.fontWeight = '600';
  title.style.color = '#0f172a';

  const actions = document.createElement('div');
  actions.style.display = 'inline-flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '6px';

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.style.height = '24px';
  pinButton.style.padding = '0 8px';
  pinButton.style.border = 'none';
  pinButton.style.borderRadius = '9999px';
  pinButton.style.fontSize = '11px';
  pinButton.style.cursor = 'pointer';
  pinButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectionCardPinned = !selectionCardPinned;
    updatePinButtonStyle();
  });
  selectionCardPinButton = pinButton;
  updatePinButtonStyle();

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'x';
  closeButton.style.width = '24px';
  closeButton.style.height = '24px';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '9999px';
  closeButton.style.background = '#e2e8f0';
  closeButton.style.color = '#334155';
  closeButton.style.fontSize = '12px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionCard();
  });

  actions.append(pinButton, closeButton);
  header.append(title, actions);

  const body = document.createElement('div');
  body.style.padding = '12px';
  body.style.color = '#111827';
  body.style.fontSize = '14px';
  body.style.lineHeight = '1.6';
  body.style.whiteSpace = 'pre-wrap';
  body.style.wordBreak = 'break-word';

  card.append(header, body);
  document.body.append(card);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let cardStartLeft = 0;
  let cardStartTop = 0;

  const onDragMove = (event: MouseEvent) => {
    if (!dragging) {
      return;
    }
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    card.style.left = `${cardStartLeft + deltaX}px`;
    card.style.top = `${cardStartTop + deltaY}px`;
  };

  const stopDrag = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', stopDrag);
    clampCardToViewportWithAnimation(card);
  };

  header.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      return;
    }
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    cardStartLeft = Number.parseFloat(card.style.left || '0');
    cardStartTop = Number.parseFloat(card.style.top || '0');
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', stopDrag);
    event.preventDefault();
  });

  selectionCardElement = card;
  selectionCardBodyElement = body;
  return card;
}

function removeSelectionActionButton(): void {
  if (!selectionActionButton) {
    return;
  }
  selectionActionButton.remove();
  selectionActionButton = null;
}

function showSelectionActionButton(options: {
  x: number;
  y: number;
  mode: 'icon' | 'mini-icon';
  onTrigger: () => void;
}): void {
  removeSelectionActionButton();
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Translate selected text');
  button.style.position = 'fixed';
  button.style.left = `${Math.max(8, Math.min(window.innerWidth - 48, options.x))}px`;
  button.style.top = `${Math.max(8, Math.min(window.innerHeight - 40, options.y + 8))}px`;
  button.style.zIndex = '2147483647';
  button.style.border = 'none';
  button.style.borderRadius = '9999px';
  button.style.cursor = 'pointer';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.background = '#2563eb';
  button.style.color = '#ffffff';
  button.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.35)';
  button.style.padding = options.mode === 'mini-icon' ? '0 8px' : '0 12px';
  button.style.height = options.mode === 'mini-icon' ? '24px' : '30px';
  button.style.fontSize = options.mode === 'mini-icon' ? '11px' : '12px';
  button.textContent = options.mode === 'mini-icon' ? 'T' : 'Translate';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onTrigger();
    removeSelectionActionButton();
  });
  document.body.append(button);
  selectionActionButton = button;
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
      'popupSelectionEnabled',
      'popupSelectionMode',
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
    let popupSelectionEnabled = isBoolean(initial.popupSelectionEnabled) ? initial.popupSelectionEnabled : false;
    let popupSelectionMode: 'direct' | 'icon' | 'mini-icon' | 'ctrl' | 'option' | 'shift' = isSelectionMode(
      initial.popupSelectionMode,
    )
      ? initial.popupSelectionMode
      : 'mini-icon';
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
      if (isBoolean(changes.popupSelectionEnabled?.newValue)) {
        popupSelectionEnabled = changes.popupSelectionEnabled.newValue;
      }
      if (isSelectionMode(changes.popupSelectionMode?.newValue)) {
        popupSelectionMode = changes.popupSelectionMode.newValue;
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
      const paragraphId = paragraphIdByElement.get(currentHoverTarget);
      if (paragraphId && translatedParagraphIds.has(paragraphId)) {
        // Auto translation already rendered this paragraph, avoid duplicate hover blocks.
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
    const triggerSelectionTranslate = () => {
      if (!masterEnabled || !popupSelectionEnabled) {
        return;
      }
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!selection || selection.rangeCount === 0 || !text) {
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionRequestSeq += 1;
      const requestId = `selection-${selectionRequestSeq}`;
      selectionRequestById.set(requestId, { x: rect.left, y: rect.bottom });
      void sendMessage('TRANSLATE_BATCH', {
        sourceLang,
        targetLang,
        providerId,
        segments: [{ id: requestId, text }],
      });
    };
    const mouseupListener = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode) {
        if (selectionCardElement?.contains(targetNode)) {
          return;
        }
        if (selectionActionButton?.contains(targetNode)) {
          return;
        }
      }
      if (!popupSelectionEnabled) {
        removeSelectionActionButton();
        return;
      }
      if (popupSelectionMode === 'direct') {
        triggerSelectionTranslate();
        return;
      }
      if (popupSelectionMode === 'icon' || popupSelectionMode === 'mini-icon') {
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? '';
        if (!selection || selection.rangeCount === 0 || !text) {
          removeSelectionActionButton();
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showSelectionActionButton({
          x: rect.right,
          y: rect.bottom,
          mode: popupSelectionMode,
          onTrigger: triggerSelectionTranslate,
        });
      }
    };
    const selectionHotkeyListener = (event: KeyboardEvent) => {
      if (!popupSelectionEnabled) {
        return;
      }
      if (!isSelectionMode(popupSelectionMode)) {
        return;
      }
      if (popupSelectionMode === 'ctrl' && normalizeHotkey(event.key) === 'control') {
        event.preventDefault();
        triggerSelectionTranslate();
        removeSelectionActionButton();
      }
      if (popupSelectionMode === 'option' && normalizeHotkey(event.key) === 'alt') {
        event.preventDefault();
        triggerSelectionTranslate();
        removeSelectionActionButton();
      }
      if (popupSelectionMode === 'shift' && normalizeHotkey(event.key) === 'shift') {
        event.preventDefault();
        triggerSelectionTranslate();
        removeSelectionActionButton();
      }
    };
    const selectionChangeListener = () => {
      const text = window.getSelection()?.toString().trim() ?? '';
      if (!text) {
        removeSelectionActionButton();
      }
    };
    const pointerDownOutsideCardListener = (event: PointerEvent) => {
      if (selectionCardPinned || !selectionCardElement || selectionCardElement.style.display === 'none') {
        return;
      }
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        closeSelectionCard();
        return;
      }
      if (selectionCardElement.contains(targetNode)) {
        return;
      }
      if (selectionActionButton && selectionActionButton.contains(targetNode)) {
        return;
      }
      closeSelectionCard();
    };
    const resizeListener = () => {
      if (selectionCardElement && selectionCardElement.style.display !== 'none') {
        clampCardToViewportWithAnimation(selectionCardElement);
      }
    };
    document.addEventListener('mousemove', pointerListener, { passive: true });
    document.addEventListener('keydown', keydownListener);
    document.addEventListener('mouseup', mouseupListener);
    document.addEventListener('keydown', selectionHotkeyListener);
    document.addEventListener('selectionchange', selectionChangeListener);
    document.addEventListener('pointerdown', pointerDownOutsideCardListener, true);
    window.addEventListener('resize', resizeListener);

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
      const selectionAnchor = selectionRequestById.get(message.payload.id);
      if (selectionAnchor) {
        selectionRequestById.delete(message.payload.id);
        showSelectionTranslation(message.payload.text, selectionAnchor.x, selectionAnchor.y);
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
        translatedParagraphIds.add(target.id);
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
      document.removeEventListener('mouseup', mouseupListener);
      document.removeEventListener('keydown', selectionHotkeyListener);
      document.removeEventListener('selectionchange', selectionChangeListener);
      document.removeEventListener('pointerdown', pointerDownOutsideCardListener, true);
      window.removeEventListener('resize', resizeListener);
      removeSelectionActionButton();
      if (selectionCardElement) {
        selectionCardElement.remove();
      }
      selectionCardElement = null;
      selectionCardBodyElement = null;
      selectionCardPinButton = null;
      selectionCardPinned = false;
      getChrome().storage.onChanged.removeListener(storageListener);
    };
  },
});
