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
let selectionCardServiceLabelElement: HTMLSpanElement | null = null;
let selectionCardServiceMenuElement: HTMLDivElement | null = null;
let selectionCardServiceButtonElement: HTMLButtonElement | null = null;
let selectionCardPinned = false;
let selectionCardProviderId = 'google';
let selectionCardProviderChangeHandler: ((providerId: string) => void) | null = null;
const translatedParagraphIds = new Set<string>();
let currentMode: DisplayMode = 'below';
let hoverRequestSeq = 0;
let selectionRequestSeq = 0;
let hoverLoadingStyleReady = false;
let selectionCardStyleReady = false;

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
      set: (items: Record<string, unknown>) => Promise<void>;
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

const SELECTION_CARD_PROVIDER_OPTIONS: Array<{ id: string; label: string; tier: 'free' | 'pro' }> = [
  { id: 'google', label: 'Free Translation Service', tier: 'free' },
  { id: 'deepl', label: 'DeepL Pro', tier: 'pro' },
];

function getSelectionProviderLabel(providerId: string): string {
  return SELECTION_CARD_PROVIDER_OPTIONS.find((item) => item.id === providerId)?.label ?? 'Free Translation Service';
}

function resolveSelectionCardFontSize(text: string): number {
  const length = text.trim().length;
  if (length <= 24) {
    return 24;
  }
  if (length <= 48) {
    return 20;
  }
  if (length <= 96) {
    return 18;
  }
  if (length <= 180) {
    return 16;
  }
  return 14;
}

function applySelectionCardBodyTypography(text: string): void {
  if (!selectionCardBodyElement) {
    return;
  }
  const fontSize = resolveSelectionCardFontSize(text);
  selectionCardBodyElement.style.fontSize = `${fontSize}px`;
  selectionCardBodyElement.style.lineHeight = fontSize <= 18 ? '1.5' : '1.35';
}

function ensureSelectionCardStyle(): void {
  if (selectionCardStyleReady) {
    return;
  }
  const style = document.createElement('style');
  style.textContent = `
    [data-translate-selection-card-body] {
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 #f1f5f9;
    }
    [data-translate-selection-card-body]::-webkit-scrollbar {
      width: 10px;
    }
    [data-translate-selection-card-body]::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 9999px;
    }
    [data-translate-selection-card-body]::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 9999px;
      border: 2px solid #f1f5f9;
    }
    [data-translate-selection-card-body]::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  `;
  document.head.append(style);
  selectionCardStyleReady = true;
}

function updateSelectionCardProviderUI(): void {
  if (selectionCardServiceLabelElement) {
    selectionCardServiceLabelElement.textContent = getSelectionProviderLabel(selectionCardProviderId);
  }
}

function showSelectionTranslation(text: string, x: number, y: number): void {
  const card = ensureSelectionCard();
  if (!card || !selectionCardBodyElement) {
    return;
  }
  selectionCardBodyElement.textContent = text;
  applySelectionCardBodyTypography(text);
  card.style.display = 'flex';
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
  ensureSelectionCardStyle();
  const card = document.createElement('div');
  card.setAttribute('data-translate-selection-card', 'true');
  card.style.position = 'fixed';
  card.style.left = '12px';
  card.style.top = '12px';
  card.style.width = '420px';
  card.style.height = '260px';
  card.style.maxWidth = 'calc(100vw - 16px)';
  card.style.minHeight = '180px';
  card.style.background = '#ffffff';
  card.style.border = '1px solid rgba(148, 163, 184, 0.22)';
  card.style.borderRadius = '18px';
  card.style.boxShadow = '0 20px 36px rgba(15, 23, 42, 0.14)';
  card.style.zIndex = '2147483647';
  card.style.overflow = 'hidden';
  card.style.display = 'none';
  card.style.opacity = '0';
  card.style.flexDirection = 'column';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'flex-start';
  header.style.gap = '8px';
  header.style.padding = '14px 16px 8px';
  header.style.background = '#ffffff';
  header.style.borderBottom = '1px solid rgba(148, 163, 184, 0.18)';
  header.style.cursor = 'move';

  const brand = document.createElement('div');
  brand.textContent = '⇄';
  brand.style.width = '28px';
  brand.style.height = '28px';
  brand.style.borderRadius = '8px';
  brand.style.display = 'inline-flex';
  brand.style.alignItems = 'center';
  brand.style.justifyContent = 'center';
  brand.style.fontSize = '14px';
  brand.style.fontWeight = '700';
  brand.style.color = '#ffffff';
  brand.style.background = 'linear-gradient(135deg, #ec4899, #8b5cf6)';

  const servicePickerWrap = document.createElement('div');
  servicePickerWrap.style.position = 'relative';
  servicePickerWrap.style.flex = '1';

  const servicePickerButton = document.createElement('button');
  selectionCardServiceButtonElement = servicePickerButton;
  servicePickerButton.type = 'button';
  servicePickerButton.style.height = '36px';
  servicePickerButton.style.width = '100%';
  servicePickerButton.style.maxWidth = '220px';
  servicePickerButton.style.border = 'none';
  servicePickerButton.style.borderRadius = '10px';
  servicePickerButton.style.background = '#f4f5f7';
  servicePickerButton.style.display = 'inline-flex';
  servicePickerButton.style.alignItems = 'center';
  servicePickerButton.style.justifyContent = 'space-between';
  servicePickerButton.style.padding = '0 12px';
  servicePickerButton.style.cursor = 'pointer';

  const serviceLabel = document.createElement('span');
  serviceLabel.style.fontSize = '13px';
  serviceLabel.style.color = '#111827';
  serviceLabel.style.whiteSpace = 'nowrap';
  serviceLabel.style.overflow = 'hidden';
  serviceLabel.style.textOverflow = 'ellipsis';
  selectionCardServiceLabelElement = serviceLabel;
  updateSelectionCardProviderUI();

  const serviceArrow = document.createElement('span');
  serviceArrow.textContent = '▾';
  serviceArrow.style.fontSize = '12px';
  serviceArrow.style.color = '#6b7280';
  servicePickerButton.append(serviceLabel, serviceArrow);

  const serviceMenu = document.createElement('div');
  serviceMenu.style.position = 'absolute';
  serviceMenu.style.left = '0';
  serviceMenu.style.top = '42px';
  serviceMenu.style.width = '270px';
  serviceMenu.style.background = '#ffffff';
  serviceMenu.style.border = '1px solid rgba(148, 163, 184, 0.2)';
  serviceMenu.style.borderRadius = '12px';
  serviceMenu.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.15)';
  serviceMenu.style.padding = '6px';
  serviceMenu.style.display = 'none';
  serviceMenu.style.zIndex = '2147483647';
  selectionCardServiceMenuElement = serviceMenu;

  for (const option of SELECTION_CARD_PROVIDER_OPTIONS) {
    const optionButton = document.createElement('button');
    optionButton.type = 'button';
    optionButton.style.width = '100%';
    optionButton.style.border = 'none';
    optionButton.style.borderRadius = '8px';
    optionButton.style.padding = '8px 10px';
    optionButton.style.background = 'transparent';
    optionButton.style.display = 'flex';
    optionButton.style.alignItems = 'center';
    optionButton.style.justifyContent = 'space-between';
    optionButton.style.cursor = 'pointer';

    const label = document.createElement('span');
    label.textContent = option.label;
    label.style.fontSize = '14px';
    label.style.color = '#111827';

    const tier = document.createElement('span');
    tier.textContent = option.tier === 'pro' ? 'Pro' : 'Free';
    tier.style.fontSize = '11px';
    tier.style.padding = '1px 6px';
    tier.style.borderRadius = '9999px';
    tier.style.background = option.tier === 'pro' ? '#e0e7ff' : '#e5e7eb';
    tier.style.color = option.tier === 'pro' ? '#3730a3' : '#374151';
    optionButton.append(label, tier);

    optionButton.addEventListener('mouseenter', () => {
      optionButton.style.background = '#f3f4f6';
    });
    optionButton.addEventListener('mouseleave', () => {
      optionButton.style.background = 'transparent';
    });
    optionButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectionCardProviderId = option.id;
      updateSelectionCardProviderUI();
      if (selectionCardServiceMenuElement) {
        selectionCardServiceMenuElement.style.display = 'none';
      }
      selectionCardProviderChangeHandler?.(option.id);
      void getChrome().storage.sync.set({ popupProviderId: option.id });
    });
    serviceMenu.append(optionButton);
  }

  servicePickerButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectionCardServiceMenuElement) {
      return;
    }
    selectionCardServiceMenuElement.style.display =
      selectionCardServiceMenuElement.style.display === 'none' ? 'block' : 'none';
  });

  servicePickerWrap.append(servicePickerButton, serviceMenu);

  const actions = document.createElement('div');
  actions.style.display = 'inline-flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '6px';

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.style.height = '26px';
  pinButton.style.padding = '0 10px';
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
  closeButton.textContent = '✕';
  closeButton.style.width = '26px';
  closeButton.style.height = '26px';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '9999px';
  closeButton.style.background = '#f1f5f9';
  closeButton.style.color = '#64748b';
  closeButton.style.fontSize = '12px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionCard();
  });

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.textContent = '⋯';
  moreButton.style.width = '26px';
  moreButton.style.height = '26px';
  moreButton.style.border = 'none';
  moreButton.style.borderRadius = '9999px';
  moreButton.style.background = '#f1f5f9';
  moreButton.style.color = '#64748b';
  moreButton.style.fontSize = '14px';
  moreButton.style.cursor = 'pointer';

  actions.append(pinButton, moreButton, closeButton);
  header.append(brand, servicePickerWrap, actions);

  const body = document.createElement('div');
  body.style.padding = '18px 18px 12px';
  body.style.color = '#111827';
  body.style.fontSize = '28px';
  body.style.fontWeight = '500';
  body.style.lineHeight = '1.35';
  body.style.whiteSpace = 'pre-wrap';
  body.style.wordBreak = 'break-word';
  body.style.flex = '1';
  body.style.overflowY = 'auto';
  body.style.minHeight = '0';
  body.setAttribute('data-translate-selection-card-body', 'true');

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.alignItems = 'center';
  footer.style.justifyContent = 'space-between';
  footer.style.padding = '8px 14px 12px';

  const leftActions = document.createElement('div');
  leftActions.style.display = 'inline-flex';
  leftActions.style.gap = '8px';

  const rightActions = document.createElement('div');
  rightActions.style.display = 'inline-flex';
  rightActions.style.gap = '8px';

  const makeFooterIcon = (text: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.style.width = '26px';
    button.style.height = '26px';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.background = '#f8fafc';
    button.style.color = '#64748b';
    button.style.fontSize = '14px';
    button.style.cursor = 'pointer';
    return button;
  };
  leftActions.append(makeFooterIcon('🔊'), makeFooterIcon('⧉'));
  rightActions.append(makeFooterIcon('👍'), makeFooterIcon('👎'));
  footer.append(leftActions, rightActions);

  card.append(header, body, footer);
  document.body.append(card);

  const minCardWidth = 320;
  const minCardHeight = 180;
  const viewportPadding = 8;

  const clampCardSizeAndPosition = () => {
    const rawWidth = Number.parseFloat(card.style.width || `${card.offsetWidth}`);
    const rawHeight = Number.parseFloat(card.style.height || `${card.offsetHeight}`);
    const maxWidth = Math.max(minCardWidth, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.max(minCardHeight, window.innerHeight - viewportPadding * 2);
    const nextWidth = Math.max(minCardWidth, Math.min(maxWidth, rawWidth));
    const nextHeight = Math.max(minCardHeight, Math.min(maxHeight, rawHeight));
    card.style.width = `${nextWidth}px`;
    card.style.height = `${nextHeight}px`;
    const rawLeft = Number.parseFloat(card.style.left || '0');
    const rawTop = Number.parseFloat(card.style.top || '0');
    const maxLeft = Math.max(viewportPadding, window.innerWidth - nextWidth - viewportPadding);
    const maxTop = Math.max(viewportPadding, window.innerHeight - nextHeight - viewportPadding);
    card.style.left = `${Math.max(viewportPadding, Math.min(maxLeft, rawLeft))}px`;
    card.style.top = `${Math.max(viewportPadding, Math.min(maxTop, rawTop))}px`;
  };

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

  type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  const addResizeHandle = (corner: ResizeCorner) => {
    const handle = document.createElement('div');
    handle.setAttribute('data-resize-corner', corner);
    handle.style.position = 'absolute';
    handle.style.width = '12px';
    handle.style.height = '12px';
    handle.style.zIndex = '2';
    handle.style.background = 'transparent';
    if (corner === 'top-left') {
      handle.style.left = '0';
      handle.style.top = '0';
      handle.style.cursor = 'nwse-resize';
    }
    if (corner === 'top-right') {
      handle.style.right = '0';
      handle.style.top = '0';
      handle.style.cursor = 'nesw-resize';
    }
    if (corner === 'bottom-left') {
      handle.style.left = '0';
      handle.style.bottom = '0';
      handle.style.cursor = 'nesw-resize';
    }
    if (corner === 'bottom-right') {
      handle.style.right = '0';
      handle.style.bottom = '0';
      handle.style.cursor = 'nwse-resize';
    }

    let resizing = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;

    const onResizeMove = (event: MouseEvent) => {
      if (!resizing) {
        return;
      }
      const deltaX = event.clientX - startMouseX;
      const deltaY = event.clientY - startMouseY;
      let nextLeft = startLeft;
      let nextTop = startTop;
      let nextWidth = startWidth;
      let nextHeight = startHeight;

      if (corner === 'top-left') {
        nextWidth = startWidth - deltaX;
        nextHeight = startHeight - deltaY;
        nextLeft = startLeft + deltaX;
        nextTop = startTop + deltaY;
      } else if (corner === 'top-right') {
        nextWidth = startWidth + deltaX;
        nextHeight = startHeight - deltaY;
        nextTop = startTop + deltaY;
      } else if (corner === 'bottom-left') {
        nextWidth = startWidth - deltaX;
        nextHeight = startHeight + deltaY;
        nextLeft = startLeft + deltaX;
      } else {
        nextWidth = startWidth + deltaX;
        nextHeight = startHeight + deltaY;
      }

      card.style.left = `${nextLeft}px`;
      card.style.top = `${nextTop}px`;
      card.style.width = `${nextWidth}px`;
      card.style.height = `${nextHeight}px`;
      clampCardSizeAndPosition();
    };

    const stopResize = () => {
      if (!resizing) {
        return;
      }
      resizing = false;
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', stopResize);
      clampCardToViewportWithAnimation(card);
    };

    handle.addEventListener('mousedown', (event) => {
      resizing = true;
      startMouseX = event.clientX;
      startMouseY = event.clientY;
      startLeft = Number.parseFloat(card.style.left || '0');
      startTop = Number.parseFloat(card.style.top || '0');
      startWidth = Number.parseFloat(card.style.width || `${card.offsetWidth}`);
      startHeight = Number.parseFloat(card.style.height || `${card.offsetHeight}`);
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onResizeMove);
      window.addEventListener('mouseup', stopResize);
      event.preventDefault();
      event.stopPropagation();
    });

    card.append(handle);
  };
  addResizeHandle('top-left');
  addResizeHandle('top-right');
  addResizeHandle('bottom-left');
  addResizeHandle('bottom-right');
  clampCardSizeAndPosition();

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
    selectionCardProviderId = providerId;
    selectionCardProviderChangeHandler = (nextProviderId: string) => {
      providerId = nextProviderId;
    };
    updateSelectionCardProviderUI();
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
        selectionCardProviderId = providerId;
        updateSelectionCardProviderUI();
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
      const targetNode = event.target as Node | null;
      if (
        selectionCardServiceMenuElement &&
        selectionCardServiceMenuElement.style.display !== 'none' &&
        targetNode &&
        !selectionCardServiceMenuElement.contains(targetNode) &&
        !selectionCardServiceButtonElement?.contains(targetNode)
      ) {
        selectionCardServiceMenuElement.style.display = 'none';
      }
      if (selectionCardPinned || !selectionCardElement || selectionCardElement.style.display === 'none') {
        return;
      }
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
      selectionCardServiceLabelElement = null;
      selectionCardServiceMenuElement = null;
      selectionCardServiceButtonElement = null;
      selectionCardPinned = false;
      selectionCardProviderChangeHandler = null;
      getChrome().storage.onChanged.removeListener(storageListener);
    };
  },
});
