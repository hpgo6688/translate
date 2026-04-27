function toBase64Url(input: Uint8Array): string {
  let binary = '';
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto is not available');
  }
  return globalThis.crypto;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const webCrypto = getCrypto();
  const passwordKey = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: 200_000,
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const webCrypto = getCrypto();
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
    iv: toBase64Url(iv),
  };
}

export async function decrypt(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const webCrypto = getCrypto();
  const decrypted = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromBase64Url(iv)) },
    key,
    toArrayBuffer(fromBase64Url(ciphertext)),
  );
  return new TextDecoder().decode(decrypted);
}
