import { supabase } from '@/integrations/supabase/client';
import { encrypt, decrypt } from '@/lib/crypto';
import * as tus from 'tus-js-client';

export interface SharedFile {
  name: string;
  type: string;
  size?: number;
  /** Present for storage-backed files (fetched signed URL). */
  url?: string;
  /** Present for inline (small, optionally E2E-encrypted) files. */
  dataUrl?: string;
  /** Storage object path — used for on-demand signed URL fetch. */
  storagePath?: string;
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
  { label: '2 hours', value: 2 * 60 * 60 * 1000 },
] as const;

const DEFAULT_EXPIRY_MS = 15 * 60 * 1000;
const MAX_CONTENT_BYTES = 5_000_000 - 1;
/** Max size for the inline (base64-in-DB) path — used for E2E-encrypted files. */
export const MAX_INLINE_FILE_BYTES = Math.floor(MAX_CONTENT_BYTES * 0.7);
/** Absolute cap for any single file uploaded to Storage. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB

const MULTI_FILE_MIME = 'application/x-multi-file';
const STORAGE_MIME = 'application/x-storage-share';
const BUCKET = 'shared-files';

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
  /** Called with 0..1 as files upload (Storage path only). */
  onProgress?: (fraction: number) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}

/** Upload a File to Storage using resumable (tus) transport. */
async function uploadFileToStorage(
  file: File,
  code: string,
  index: number,
  onProgress?: (bytesSent: number, bytesTotal: number) => void,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const token = session?.access_token ?? anonKey;

  // Safe object key — random suffix so listing/enumeration is useless without the code.
  const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(0, 80);
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  const objectPath = `${code}/${index}-${suffix}-${safeName}`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: anonKey,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: BUCKET,
        objectName: objectPath,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      onProgress: (sent, total) => {
        onProgress?.(sent, total);
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  return objectPath;
}

/** ------- TEXT ------- */

/** Returns token: CODE-KEY if encrypted, or just CODE if not */
export async function createTextShare(
  text: string,
  options: CreateShareOptions = {},
): Promise<{ token: string; encrypted: boolean }> {
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

/** ------- FILES ------- */

/**
 * Whether the requested share can use inline (E2E-encryptable) storage.
 * Inline is used only when: encryption is requested AND total size ≤ 5 MB.
 */
function shouldGoInline(files: File[], encrypted: boolean): boolean {
  if (!encrypted) return false;
  const total = files.reduce((s, f) => s + f.size, 0);
  return total <= MAX_INLINE_FILE_BYTES;
}

/** Single file. If encrypted + small, inline; otherwise upload to Storage. */
export async function createFileShare(
  file: File,
  options: CreateShareOptions = {},
): Promise<{ token: string; encrypted: boolean }> {
  return createMultiFileShare([file], options);
}

export async function createMultiFileShare(
  files: File[],
  options: CreateShareOptions = {},
): Promise<{ token: string; encrypted: boolean }> {
  const { expiryMs = DEFAULT_EXPIRY_MS, encrypted = false, onProgress } = options;
  if (files.length === 0) throw new Error('No files selected');

  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      throw new Error(`"${f.name}" exceeds the 10 GB maximum.`);
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();

  // -------- Inline (E2E) path: only when encryption is on AND total ≤ 5 MB.
  if (shouldGoInline(files, encrypted)) {
    const inlinePayload: Array<{ name: string; type: string; dataUrl: string }> = [];
    for (const f of files) {
      inlinePayload.push({ name: f.name, type: f.type, dataUrl: await readFileAsDataUrl(f) });
    }
    const raw = JSON.stringify(inlinePayload);
    const { ciphertext, keyString } = await encrypt(raw);
    if (new Blob([ciphertext]).size > MAX_CONTENT_BYTES) {
      throw new Error('Files too large after encoding.');
    }
    const { error } = await supabase.from('shared_items').insert({
      code,
      type: 'file',
      content: ciphertext,
      encrypted: true,
      file_name: files.length > 1 ? `multi:${files.length}` : files[0].name,
      file_type: files.length > 1 ? MULTI_FILE_MIME : files[0].type,
      expires_at: expiresAt,
    });
    if (error) throw new Error('Failed to create share');
    return { token: `${code}-${keyString}`, encrypted: true };
  }

  // -------- Storage path (default for files, required for >5 MB and for anything non-encrypted).
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const perFileSent = new Array(files.length).fill(0);
  const emitProgress = () => {
    if (!onProgress) return;
    const sent = perFileSent.reduce((s, n) => s + n, 0);
    onProgress(totalBytes === 0 ? 1 : sent / totalBytes);
  };

  const storagePaths: string[] = [];
  const fileNames: string[] = [];
  const fileTypes: string[] = [];
  const fileSizes: number[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = await uploadFileToStorage(f, code, i, (sent) => {
        perFileSent[i] = sent;
        emitProgress();
      });
      perFileSent[i] = f.size;
      emitProgress();
      storagePaths.push(path);
      fileNames.push(f.name);
      fileTypes.push(f.type || 'application/octet-stream');
      fileSizes.push(f.size);
    }
  } catch (e) {
    // Best-effort: leave already-uploaded objects to expire with the bucket cleanup;
    // there's no anon delete policy. Surface the error to the UI.
    throw new Error(`Upload failed: ${(e as Error).message}`);
  }

  const { error } = await supabase.from('shared_items').insert({
    code,
    type: 'file',
    content: JSON.stringify({ storage: true, count: files.length }),
    encrypted: false,
    file_name: files.length > 1 ? `multi:${files.length}` : files[0].name,
    file_type: STORAGE_MIME,
    storage_paths: storagePaths,
    file_names: fileNames,
    file_types: fileTypes,
    file_sizes: fileSizes,
    expires_at: expiresAt,
  });

  if (error) throw new Error('Failed to create share record');
  return { token: code, encrypted: false };
}

/** ------- RETRIEVAL ------- */

async function fetchSignedUrl(code: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('get-share-file', {
    body: { code, path },
  });
  if (error || !data?.url) return null;
  return data.url as string;
}

/** Retrieve by full token or room code. Returns item + whether decryption key is needed. */
export async function retrieveShare(token: string): Promise<SharedItem | null> {
  const dashIndex = token.indexOf('-');
  const isFullToken = dashIndex !== -1 && dashIndex >= 6;

  const lookupCode = isFullToken
    ? token.substring(0, dashIndex).toUpperCase()
    : token.toUpperCase().substring(0, 6);
  const keyString = isFullToken ? token.substring(dashIndex + 1) : null;

  const { data: resp, error } = await supabase.functions.invoke('get-share', {
    body: { code: lookupCode },
  });

  const data = resp?.item ?? null;
  if (error || !data) return null;

  const isEncrypted = !!data.encrypted;
  const baseType = data.type as 'text' | 'file';
  const isStorage = data.file_type === STORAGE_MIME || (Array.isArray(data.storage_paths) && data.storage_paths.length > 0);
  const isMultiInline = data.file_type === MULTI_FILE_MIME;

  // ---- Storage-backed files: resolve signed URLs on demand.
  if (isStorage) {
    const paths: string[] = data.storage_paths ?? [];
    const names: string[] = data.file_names ?? [];
    const types: string[] = data.file_types ?? [];
    const sizes: number[] = data.file_sizes ?? [];
    const files: SharedFile[] = await Promise.all(
      paths.map(async (p, i) => ({
        name: names[i] ?? `file-${i + 1}`,
        type: types[i] ?? 'application/octet-stream',
        size: sizes[i],
        storagePath: p,
        url: (await fetchSignedUrl(lookupCode, p)) ?? undefined,
      })),
    );
    return {
      id: data.id,
      code: data.code,
      type: baseType,
      content: '',
      fileName: data.file_name ?? undefined,
      fileType: data.file_type ?? undefined,
      files,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  }

  // ---- Inline path (text OR small encrypted files).
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
  if (baseType === 'file' && isEncrypted) {
    try {
      const parsed = JSON.parse(rawContent) as Array<{ name: string; type: string; dataUrl: string }>;
      files = parsed.map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl }));
    } catch {
      return null;
    }
  } else if (isMultiInline) {
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
    content: files ? '' : rawContent,
    fileName: data.file_name ?? undefined,
    fileType: data.file_type ?? undefined,
    files,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  };
}

/** Check if a room code has encrypted content (for prompting key entry) */
export async function checkShareEncryption(
  roomCode: string,
): Promise<{ found: boolean; encrypted: boolean; data?: any }> {
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
