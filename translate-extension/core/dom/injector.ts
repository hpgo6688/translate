import type { ContentScriptContext } from 'wxt/utils/content-script-context';

import { mountTranslationShadow } from '@/core/dom/shadow-host';

export type DisplayMode = 'below' | 'side-by-side' | 'replace';

const WRAPPER_ATTR = 'data-translation-wrapper';

export function preserveInlineFormatting(
  source: HTMLElement,
  translatedText: string,
): string {
  const hasInlineTags = source.querySelector('a,em,strong,code');
  if (!hasInlineTags) {
    return translatedText;
  }
  const anchor = source.querySelector('a');
  if (!anchor) {
    return translatedText;
  }
  return `<a href="${anchor.getAttribute('href') ?? '#'}">${translatedText}</a>`;
}

function buildContentHtml(source: HTMLElement, text: string): string {
  return `<div class="translation-content">${preserveInlineFormatting(source, text)}</div>`;
}

function ensureWrapper(element: HTMLElement, id: string, mode: DisplayMode): HTMLElement {
  if (mode === 'below') {
    let wrapper = element.nextElementSibling as HTMLElement | null;
    if (!wrapper || wrapper.getAttribute(WRAPPER_ATTR) !== id) {
      wrapper = document.createElement('div');
      wrapper.setAttribute(WRAPPER_ATTR, id);
      element.insertAdjacentElement('afterend', wrapper);
    }
    return wrapper;
  }

  if (mode === 'side-by-side') {
    let wrapper = element.parentElement?.querySelector<HTMLElement>(`[${WRAPPER_ATTR}="${id}"]`) ?? null;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.setAttribute(WRAPPER_ATTR, id);
      wrapper.style.display = 'grid';
      wrapper.style.gridTemplateColumns = '1fr 1fr';
      const clone = element.cloneNode(true) as HTMLElement;
      wrapper.append(clone);
      element.replaceWith(wrapper);
    }
    return wrapper;
  }

  let wrapper = element.parentElement?.querySelector<HTMLElement>(`[${WRAPPER_ATTR}="${id}"]`) ?? null;
  if (!wrapper) {
    wrapper = document.createElement('span');
    wrapper.setAttribute(WRAPPER_ATTR, id);
    element.style.display = 'none';
    element.insertAdjacentElement('afterend', wrapper);
  }
  return wrapper;
}

export async function injectTranslation(
  ctx: ContentScriptContext,
  input: {
    id: string;
    element: HTMLElement;
    translation: string;
    mode: DisplayMode;
  },
): Promise<void> {
  const wrapper = ensureWrapper(input.element, input.id, input.mode);
  await mountTranslationShadow(
    ctx,
    input.id,
    wrapper,
    buildContentHtml(input.element, input.translation),
  );
}
