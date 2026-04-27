import { describe, expect, it } from 'vitest';

import { decrypt, deriveKey, encrypt } from '@/utils/crypto';

describe('crypto', () => {
  it('encrypts and decrypts plaintext', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('secret-pass', salt);
    const payload = await encrypt(key, 'hello extension');
    await expect(decrypt(key, payload.ciphertext, payload.iv)).resolves.toBe(
      'hello extension',
    );
  });

  it('fails with wrong password key', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const rightKey = await deriveKey('correct-pass', salt);
    const wrongKey = await deriveKey('wrong-pass', salt);
    const payload = await encrypt(rightKey, 'confidential');
    await expect(
      decrypt(wrongKey, payload.ciphertext, payload.iv),
    ).rejects.toThrow();
  });

  it('fails if ciphertext was tampered', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('correct-pass', salt);
    const payload = await encrypt(key, 'secure data');
    const tampered = `${payload.ciphertext.slice(0, -1)}A`;
    await expect(decrypt(key, tampered, payload.iv)).rejects.toThrow();
  });
});
