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

/** Returns full share token: LOOKUP-ENCRYPTIONKEY */
export async function createTextShare(text: string, expiryMs: number = DEFAULT_EXPIRY_MS): Promise<string> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();
  const { ciphertext, keyString } = await encrypt(text);

  const { error } = await supabase.from('shared_items').insert({
    code,
    type: 'text',
    content: ciphertext,
    expires_at: expiresAt,
  });

  if (error) throw new Error('Failed to create share');
  return `${code}-${keyString}`;
}

export async function createFileShare(file: File, expiryMs: number = DEFAULT_EXPIRY_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const code = generateCode();
        const expiresAt = new Date(Date.now() + expiryMs).toISOString();
        const dataUrl = reader.result as string;
        const { ciphertext, keyString } = await encrypt(dataUrl);

        const { error } = await supabase.from('shared_items').insert({
          code,
          type: 'file',
          content: ciphertext,
          file_name: file.name,
          file_type: file.type,
          expires_at: expiresAt,
        });

        if (error) {
          reject(new Error('File too large or failed to upload'));
          return;
        }
        resolve(`${code}-${keyString}`);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Accepts full token "LOOKUP-KEY", splits and decrypts */
export async function retrieveShare(token: string): Promise<SharedItem | null> {
  const dashIndex = token.indexOf('-');
  if (dashIndex === -1) return null;

  const lookupCode = token.substring(0, dashIndex).toUpperCase();
  const keyString = token.substring(dashIndex + 1);

  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('code', lookupCode)
    .single();

  if (error || !data) return null;

  try {
    const decryptedContent = await decrypt(data.content, keyString);
    return {
      id: data.id,
      code: data.code,
      type: data.type as 'text' | 'file',
      content: decryptedContent,
      fileName: data.file_name ?? undefined,
      fileType: data.file_type ?? undefined,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  } catch {
    return null; // wrong key
  }
}

export function getTimeRemaining(item: SharedItem): string {
  const remaining = new Date(item.expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
