import { supabase } from '@/integrations/supabase/client';
import { encrypt, decrypt } from '@/lib/crypto';

export interface SharedItem {
  id: string;
  code: string;
  type: 'text' | 'file';
  content: string;
  fileName?: string;
  fileType?: string;
  createdAt: string;
  expiresAt: string;
}

export const EXPIRY_OPTIONS = [
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '15 minutes', value: 15 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
] as const;

const DEFAULT_EXPIRY_MS = 15 * 60 * 1000;

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export interface CreateShareOptions {
  expiryMs?: number;
  encrypted?: boolean;
}

/** Returns token: CODE-KEY if encrypted, or just CODE if not */
export async function createTextShare(text: string, options: CreateShareOptions = {}): Promise<{ token: string; encrypted: boolean }> {
  const { expiryMs = DEFAULT_EXPIRY_MS, encrypted = false } = options;
  const code = generateCode();
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();

  let content: string;
  let keyString: string | null = null;

  if (encrypted) {
    const result = await encrypt(text);
    content = result.ciphertext;
    keyString = result.keyString;
  } else {
    content = text;
  }

  const { error } = await supabase.from('shared_items').insert({
    code,
    type: 'text',
    content,
    encrypted,
    expires_at: expiresAt,
  });

  if (error) throw new Error('Failed to create share');
  return {
    token: encrypted ? `${code}-${keyString}` : code,
    encrypted,
  };
}

export async function createFileShare(file: File, options: CreateShareOptions = {}): Promise<{ token: string; encrypted: boolean }> {
  const { expiryMs = DEFAULT_EXPIRY_MS, encrypted = false } = options;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const code = generateCode();
        const expiresAt = new Date(Date.now() + expiryMs).toISOString();
        const dataUrl = reader.result as string;

        let content: string;
        let keyString: string | null = null;

        if (encrypted) {
          const result = await encrypt(dataUrl);
          content = result.ciphertext;
          keyString = result.keyString;
        } else {
          content = dataUrl;
        }

        const { error } = await supabase.from('shared_items').insert({
          code,
          type: 'file',
          content,
          encrypted,
          file_name: file.name,
          file_type: file.type,
          expires_at: expiresAt,
        });

        if (error) {
          reject(new Error('File too large or failed to upload'));
          return;
        }
        resolve({
          token: encrypted ? `${code}-${keyString}` : code,
          encrypted,
        });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Retrieve by full token or room code. Returns item + whether decryption key is needed. */
export async function retrieveShare(token: string): Promise<SharedItem | null> {
  const dashIndex = token.indexOf('-');
  const isFullToken = dashIndex !== -1 && dashIndex >= 6;

  const lookupCode = isFullToken ? token.substring(0, dashIndex).toUpperCase() : token.toUpperCase().substring(0, 6);
  const keyString = isFullToken ? token.substring(dashIndex + 1) : null;

  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('code', lookupCode)
    .single();

  if (error || !data) return null;

  const isEncrypted = data.type.endsWith('_encrypted');
  const baseType = data.type.replace('_encrypted', '') as 'text' | 'file';

  if (isEncrypted && keyString) {
    try {
      const decryptedContent = await decrypt(data.content, keyString);
      return {
        id: data.id,
        code: data.code,
        type: baseType,
        content: decryptedContent,
        fileName: data.file_name ?? undefined,
        fileType: data.file_type ?? undefined,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      };
    } catch {
      return null;
    }
  }

  if (!isEncrypted) {
    return {
      id: data.id,
      code: data.code,
      type: baseType,
      content: data.content,
      fileName: data.file_name ?? undefined,
      fileType: data.file_type ?? undefined,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  }

  // Encrypted but no key provided — return null (caller should prompt for key)
  return null;
}

/** Check if a room code has encrypted content (for prompting key entry) */
export async function checkShareEncryption(roomCode: string): Promise<{ found: boolean; encrypted: boolean; data?: any }> {
  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('code', roomCode.toUpperCase())
    .single();

  if (error || !data) return { found: false, encrypted: false };
  return { found: true, encrypted: data.type.endsWith('_encrypted'), data };
}

export function getTimeRemaining(item: SharedItem): string {
  const remaining = new Date(item.expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
