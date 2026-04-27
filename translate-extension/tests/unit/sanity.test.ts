import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('runs in jsdom environment', () => {
    const element = document.createElement('div');
    element.textContent = 'ok';
    expect(element.textContent).toBe('ok');
  });
});
