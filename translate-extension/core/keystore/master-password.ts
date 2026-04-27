import { decrypt, deriveKey, encrypt } from '@/utils/crypto';

const MASTER_SALT_KEY = 'masterPasswordSalt';
const MASTER_VERIFIER_KEY = 'masterPasswordVerifier';
const VERIFIER_PLAINTEXT = 'provider-key-verifier';

type MasterRecord = {
  salt: string;
  verifierCiphertext: string;
  verifierIv: string;
};

type ExtensionChrome = {
  storage: {
    local: {
      get: (keys?: string | string[]) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
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

export class MasterPasswordManager {
  private unlockedKey: CryptoKey | null = null;

  async setup(password: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(key, VERIFIER_PLAINTEXT);
    await getChrome().storage.local.set({
      [MASTER_SALT_KEY]: toBase64Url(salt),
      [MASTER_VERIFIER_KEY]: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
      },
    });
    this.unlockedKey = key;
  }

  async unlock(password: string): Promise<CryptoKey> {
    const record = await this.readRecord();
    if (!record) {
      throw new Error('Master password has not been set');
    }
    const key = await deriveKey(password, fromBase64Url(record.salt));
    try {
      const plain = await decrypt(key, record.verifierCiphertext, record.verifierIv);
      if (plain !== VERIFIER_PLAINTEXT) {
        throw new Error('Incorrect password');
      }
    } catch {
      throw new Error('Incorrect password');
    }
    this.unlockedKey = key;
    return key;
  }

  getKey(): CryptoKey | null {
    return this.unlockedKey;
  }

  lock(): void {
    this.unlockedKey = null;
  }

  async reset(): Promise<void> {
    this.unlockedKey = null;
    await getChrome().storage.local.remove([
      MASTER_SALT_KEY,
      MASTER_VERIFIER_KEY,
      'encryptedProviderKeys',
    ]);
  }

  private async readRecord(): Promise<MasterRecord | null> {
    const raw = await getChrome().storage.local.get([
      MASTER_SALT_KEY,
      MASTER_VERIFIER_KEY,
    ]);
    const salt = raw[MASTER_SALT_KEY];
    const verifier = raw[MASTER_VERIFIER_KEY] as
      | { ciphertext?: string; iv?: string }
      | undefined;
    if (
      typeof salt !== 'string' ||
      !verifier ||
      typeof verifier.ciphertext !== 'string' ||
      typeof verifier.iv !== 'string'
    ) {
      return null;
    }
    return {
      salt,
      verifierCiphertext: verifier.ciphertext,
      verifierIv: verifier.iv,
    };
  }
}

export const masterPasswordManager = new MasterPasswordManager();
