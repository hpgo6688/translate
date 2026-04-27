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
  const rootStyle = getComputedStyle(document.documentElement);
  const color = rootStyle.getPropertyValue('--translate-ext-color').trim() || '#334155';
  const backgroundColor =
    rootStyle.getPropertyValue('--translate-ext-background').trim() || 'transparent';
  const fontScale = rootStyle.getPropertyValue('--translate-ext-font-scale').trim() || '100%';
  const fontScaleFactor = Number.parseFloat(fontScale) / 100 || 1;
  const decoration = rootStyle.getPropertyValue('--translate-ext-decoration').trim();
  const blur = rootStyle.getPropertyValue('--translate-ext-blur').trim() || '0px';
  const formattedText = preserveInlineFormatting(source, text);

  const baseStyle = [
    `color:${color}`,
    `background-color:${backgroundColor}`,
    `font-size:${fontScaleFactor}em`,
    `filter:blur(${blur === '0px' ? '0px' : blur})`,
    'display:block',
    'line-height:1.6',
    'margin-top:0.25rem',
  ];

  if (decoration === 'dashed-box') {
    baseStyle.push('text-decoration:none', `border:1px dashed ${color}`, 'padding:0.25rem 0.375rem');
    return `<div class="translation-content" style="${baseStyle.join(';')}">${formattedText}</div>`;
  }

  const line = decoration === 'none' ? 'none' : 'underline';
  const style =
    decoration === 'dashed-underline'
      ? 'dashed'
      : decoration === 'wavy-underline'
        ? 'wavy'
        : 'solid';
  baseStyle.push(
    `text-decoration-line:${line}`,
    `text-decoration-style:${line === 'none' ? 'solid' : style}`,
    `text-decoration-color:${color}`,
  );
  return `<div class="translation-content" style="${baseStyle.join(';')}">${formattedText}</div>`;
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
