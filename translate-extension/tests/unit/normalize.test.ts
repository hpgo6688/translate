import { describe, expect, it } from 'vitest';

import { normalize, paragraphId } from '@/utils/normalize';

describe('normalize', () => {
  it('normalizes unicode and whitespace', () => {
    expect(normalize('  Cafe\u0301   world \n\t')).toBe('Caf\u00e9 world');
  });

  it('returns stable paragraph id for equivalent text', async () => {
    const idA = await paragraphId(' Hello   world. ');
    const idB = await paragraphId('Hello world.');
    expect(idA).toBe(idB);
  });
});
