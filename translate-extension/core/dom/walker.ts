export type ParagraphCandidate = {
  element: HTMLElement;
  text: string;
};

const SKIP_TAGS = new Set([
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'code',
  'pre',
  'kbd',
  'samp',
  'input',
  'textarea',
  'select',
  'button',
  'option',
  'math',
]);

function hasLetters(text: string): boolean {
  return /[A-Za-z\u4E00-\u9FFF]/.test(text);
}

function shouldSkipElement(element: Element, neverTranslateSelectors: string[]): boolean {
  const tagName = element.tagName.toLowerCase();
  if (SKIP_TAGS.has(tagName)) {
    return true;
  }
  if (
    element.closest(
      'nav,header,footer,aside,script,style,noscript,template,svg,canvas,code,pre,kbd,samp,math',
    )
  ) {
    return true;
  }
  if (element.closest('math,[class*="math"],[data-math]')) {
    return true;
  }
  if (
    element.closest('[translate="no"],.notranslate') ||
    neverTranslateSelectors.some((selector) => element.matches(selector))
  ) {
    return true;
  }
  return false;
}

export function collectTranslatableParagraphs(
  root: ParentNode = document,
  options: { neverTranslateSelectors?: string[] } = {},
): ParagraphCandidate[] {
  const neverTranslateSelectors = options.neverTranslateSelectors ?? [];
  const result: ParagraphCandidate[] = [];
  const nodes = root.querySelectorAll<HTMLElement>('p,li,article h1,article h2,article h3');

  for (const element of nodes) {
    if (shouldSkipElement(element, neverTranslateSelectors)) {
      continue;
    }
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (text.length < 4 || !hasLetters(text)) {
      continue;
    }
    result.push({ element, text });
  }
  return result;
}
