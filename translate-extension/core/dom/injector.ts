import type { ContentScriptContext } from 'wxt/utils/content-script-context';

import { mountTranslationShadow, unmountTranslationShadow } from '@/core/dom/shadow-host';

export type DisplayMode = 'below' | 'side-by-side' | 'replace';

const WRAPPER_ATTR = 'data-translation-wrapper';
const INLINE_LINK_SELECTOR = 'a[href]';

function applySafeAnchorAttributes(from: HTMLAnchorElement, to: HTMLAnchorElement): void {
  const href = from.getAttribute('href');
  if (href && href.trim() !== '') {
    to.setAttribute('href', href);
  }
  const target = from.getAttribute('target');
  if (target && target.trim() !== '') {
    to.setAttribute('target', target);
  }
  const rel = from.getAttribute('rel');
  if (rel && rel.trim() !== '') {
    to.setAttribute('rel', rel);
  }
}

function buildFormattedNode(source: HTMLElement, translatedText: string): Node {
  const anchor = source.querySelector(INLINE_LINK_SELECTOR);
  if (!(anchor instanceof HTMLAnchorElement)) {
    return document.createTextNode(translatedText);
  }
  const translatedAnchor = document.createElement('a');
  applySafeAnchorAttributes(anchor, translatedAnchor);
  translatedAnchor.textContent = translatedText;
  return translatedAnchor;
}

export function preserveInlineFormatting(source: HTMLElement, translatedText: string): string {
  const node = buildFormattedNode(source, translatedText);
  if (node.nodeType === Node.TEXT_NODE) {
    return translatedText;
  }
  const container = document.createElement('div');
  container.append(node);
  return container.innerHTML;
}

function buildContentElement(source: HTMLElement, text: string): HTMLElement {
  const rootStyle = getComputedStyle(document.documentElement);
  const color = rootStyle.getPropertyValue('--translate-ext-color').trim() || '#334155';
  const backgroundColor =
    rootStyle.getPropertyValue('--translate-ext-background').trim() || 'transparent';
  const fontScale = rootStyle.getPropertyValue('--translate-ext-font-scale').trim() || '100%';
  const fontScaleFactor = Number.parseFloat(fontScale) / 100 || 1;
  const decoration = rootStyle.getPropertyValue('--translate-ext-decoration').trim();
  const blur = rootStyle.getPropertyValue('--translate-ext-blur').trim() || '0px';
  const content = document.createElement('div');
  content.className = 'translation-content';
  content.style.color = color;
  content.style.backgroundColor = backgroundColor;
  content.style.fontSize = `${fontScaleFactor}em`;
  content.style.filter = `blur(${blur === '0px' ? '0px' : blur})`;
  content.style.display = 'block';
  content.style.lineHeight = '1.6';
  content.style.marginTop = '0.25rem';
  content.append(buildFormattedNode(source, text));

  if (decoration === 'dashed-box') {
    content.style.textDecoration = 'none';
    content.style.border = `1px dashed ${color}`;
    content.style.padding = '0.25rem 0.375rem';
    return content;
  }

  const line = decoration === 'none' ? 'none' : 'underline';
  const style =
    decoration === 'dashed-underline'
      ? 'dashed'
      : decoration === 'wavy-underline'
        ? 'wavy'
        : 'solid';
  content.style.textDecorationLine = line;
  content.style.textDecorationStyle = line === 'none' ? 'solid' : style;
  content.style.textDecorationColor = color;
  return content;
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
    buildContentElement(input.element, input.translation),
  );
}

export function removeTranslation(
  input: {
    id: string;
    element: HTMLElement;
    mode: DisplayMode;
  },
): void {
  unmountTranslationShadow(input.id);
  if (input.mode === 'replace') {
    input.element.style.display = '';
  }
  if (input.mode !== 'below') {
    return;
  }
  const wrapper = input.element.nextElementSibling as HTMLElement | null;
  if (wrapper && wrapper.getAttribute(WRAPPER_ATTR) === input.id) {
    wrapper.remove();
  }
}
