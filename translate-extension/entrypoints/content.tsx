import '@/assets/tailwind.css';
import { assignParagraphIds } from '@/core/dom/paragraph-id';
import { injectTranslation } from '@/core/dom/injector';
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

const paragraphById = new Map<string, ParagraphState>();
let currentMode: DisplayMode = 'below';

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

async function scanAndQueue() {
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
        sourceLang: 'auto',
        targetLang: 'zh-CN',
        providerId: 'google',
        segments: [{ id: item.id, text: item.text }],
      });
    },
  );
  return unobserve;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: false,
  cssInjectionMode: 'ui',
  async main(ctx) {
    const initial = await getChrome().storage.sync.get('translationStyle');
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

    await mountFloatingButton(ctx, {
      onTranslate: () => {
        void scanAndQueue();
      },
    });

    const stopObserve = observeDomChanges(document.documentElement, () => {
      void scanAndQueue();
    });

    getChrome().runtime.onMessage.addListener((message) => {
      if (message?.type === 'POPUP_TRANSLATE_START') {
        void scanAndQueue();
        return;
      }
      if (message?.type !== 'TRANSLATION_CHUNK') {
        return;
      }
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
    });

    void scanAndQueue();

    return () => {
      stopStyleSync();
      stopObserve();
    };
  },
});
