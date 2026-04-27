import { describe, expect, it } from 'vitest';

import { preserveInlineFormatting } from '@/core/dom/injector';
import { assignParagraphIds } from '@/core/dom/paragraph-id';
import { collectTranslatableParagraphs } from '@/core/dom/walker';

describe('dom content pipeline', () => {
  it('applies skip rules for nav/footer/code/notranslate', () => {
    document.body.innerHTML = `
      <nav><p>ignore nav</p></nav>
      <p class="notranslate">ignore class</p>
      <code>ignore code</code>
      <p>valid paragraph text</p>
    `;
    const result = collectTranslatableParagraphs(document);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('valid paragraph text');
  });

  it('creates stable ids with duplicate suffix', async () => {
    document.body.innerHTML = `
      <p>Hello world</p>
      <p>Hello world</p>
    `;
    const candidates = collectTranslatableParagraphs(document);
    const ids = await assignParagraphIds(candidates);
    expect(ids[0]?.id).not.toBe(ids[1]?.id);
    expect(ids[1]?.id).toContain('#1');
  });

  it('rejects short text and non-letter text', () => {
    document.body.innerHTML = `
      <p>123</p>
      <p>---</p>
      <p>ok</p>
      <p>long enough words</p>
    `;
    const result = collectTranslatableParagraphs(document);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('long enough words');
  });

  it('preserves inline anchor formatting', () => {
    document.body.innerHTML = `<p>See <a href="https://example.com">link</a></p>`;
    const source = document.querySelector('p') as HTMLElement;
    const html = preserveInlineFormatting(source, '查看链接');
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toContain('查看链接');
  });
});
