import { assignParagraphIds } from '@/core/dom/paragraph-id';
import { injectTranslation } from '@/core/dom/injector';
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
const currentMode: 'below' | 'side-by-side' | 'replace' = 'below';

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
};

function getChrome(): ExtensionChrome {
  const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome;
  if (!extensionChrome) {
    throw new Error('Chrome extension API unavailable');
  }
  return extensionChrome;
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
    applyStyleVariables(defaultTranslationStyle);
    const stopStyleSync = listenStyleChanges((nextStyle) => applyStyleVariables(nextStyle));

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
