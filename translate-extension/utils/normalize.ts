function toBase64Url(input: Uint8Array): string {
  let binary = '';
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function normalize(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export async function paragraphId(text: string): Promise<string> {
  const normalized = normalize(text);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-1', data);
  const truncated = new Uint8Array(digest).slice(0, 16);
  return toBase64Url(truncated);
}
