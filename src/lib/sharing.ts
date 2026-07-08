import { supabase } from '@/integrations/supabase/client';
import { encrypt, decrypt } from '@/lib/crypto';

export interface SharedFile {
  name: string;
  type: string;
  dataUrl: string;
}

export interface SharedItem {
  id: string;
  code: string;
  type: 'text' | 'file';
  content: string;
  fileName?: string;
  fileType?: string;
  files?: SharedFile[];
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
const MAX_CONTENT_BYTES = 5_000_000 - 1;
const MAX_FILE_BYTES = Math.floor(MAX_CONTENT_BYTES * 0.7); // account for base64 overhead (~33%)

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

  if (new Blob([content]).size > MAX_CONTENT_BYTES) {
    throw new Error('Content too large. Maximum is ~5MB.');
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
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File too large. Maximum is ~3.5MB.');
  }
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

        if (new Blob([content]).size > MAX_CONTENT_BYTES) {
          reject(new Error('File too large after encoding. Try a smaller file.'));
          return;
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

const MULTI_FILE_MIME = 'application/x-multi-file';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}

export async function createMultiFileShare(files: File[], options: CreateShareOptions = {}): Promise<{ token: string; encrypted: boolean }> {
  const { expiryMs = DEFAULT_EXPIRY_MS, encrypted = false } = options;
  if (files.length === 0) throw new Error('No files selected');
  if (files.length === 1) return createFileShare(files[0], options);

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_FILE_BYTES) {
    throw new Error('Total file size too large. Maximum is ~3.5MB combined.');
  }

  const payload: SharedFile[] = [];
  for (const f of files) {
    payload.push({ name: f.name, type: f.type, dataUrl: await readFileAsDataUrl(f) });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();
  const raw = JSON.stringify(payload);

  let content: string;
  let keyString: string | null = null;
  if (encrypted) {
    const result = await encrypt(raw);
    content = result.ciphertext;
    keyString = result.keyString;
  } else {
    content = raw;
  }

  if (new Blob([content]).size > MAX_CONTENT_BYTES) {
    throw new Error('Files too large after encoding. Try smaller files.');
  }

  const { error } = await supabase.from('shared_items').insert({
    code,
    type: 'file',
    content,
    encrypted,
    file_name: `multi:${files.length}`,
    file_type: MULTI_FILE_MIME,
    expires_at: expiresAt,
  });

  if (error) throw new Error('Failed to create share');
  return {
    token: encrypted ? `${code}-${keyString}` : code,
    encrypted,
  };
}

/** Retrieve by full token or room code. Returns item + whether decryption key is needed. */
export async function retrieveShare(token: string): Promise<SharedItem | null> {
  const dashIndex = token.indexOf('-');
  const isFullToken = dashIndex !== -1 && dashIndex >= 6;

  const lookupCode = isFullToken ? token.substring(0, dashIndex).toUpperCase() : token.toUpperCase().substring(0, 6);
  const keyString = isFullToken ? token.substring(dashIndex + 1) : null;

  const { data: resp, error } = await supabase.functions.invoke('get-share', {
    body: { code: lookupCode },
  });

  const data = resp?.item ?? null;
  if (error || !data) return null;

  const isEncrypted = !!data.encrypted;
  const baseType = data.type as 'text' | 'file';
  const isMulti = data.file_type === MULTI_FILE_MIME;

  let rawContent: string | null = null;
  if (isEncrypted && keyString) {
    try {
      rawContent = await decrypt(data.content, keyString);
    } catch {
      return null;
    }
  } else if (!isEncrypted) {
    rawContent = data.content;
  }

  if (rawContent === null) return null;

  let files: SharedFile[] | undefined;
  if (isMulti) {
    try {
      files = JSON.parse(rawContent) as SharedFile[];
    } catch {
      return null;
    }
  }

  return {
    id: data.id,
    code: data.code,
    type: baseType,
    content: isMulti ? '' : rawContent,
    fileName: data.file_name ?? undefined,
    fileType: data.file_type ?? undefined,
    files,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  };
}

/** Check if a room code has encrypted content (for prompting key entry) */
export async function checkShareEncryption(roomCode: string): Promise<{ found: boolean; encrypted: boolean; data?: any }> {
  const { data: resp, error } = await supabase.functions.invoke('get-share', {
    body: { code: roomCode.toUpperCase(), checkOnly: true },
  });

  if (error || !resp?.found) return { found: false, encrypted: false };
  return { found: true, encrypted: !!resp.encrypted };
}

export function getTimeRemaining(item: SharedItem): string {
  const remaining = new Date(item.expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
