/**
 * End-to-end encryption using AES-GCM (Web Crypto API).
 * The encryption key never leaves the client — it's embedded in the share code.
 */

const ALGO = 'AES-GCM';
const KEY_LENGTH = 128;
const IV_LENGTH = 12;

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, ['encrypt', 'decrypt']);
}

async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64Url(raw);
}

async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded);
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: KEY_LENGTH }, false, ['decrypt']);
}

export async function encrypt(plaintext: string): Promise<{ ciphertext: string; keyString: string }> {
  const key = await generateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);

  // Prepend IV to ciphertext
  const combined = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), IV_LENGTH);

  return {
    ciphertext: toBase64Url(combined.buffer),
    keyString: await exportKey(key),
  };
}

export async function decrypt(ciphertext: string, keyString: string): Promise<string> {
  const combined = fromBase64Url(ciphertext);
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);
  const key = await importKey(keyString);
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
