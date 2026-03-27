export interface SharedItem {
  id: string;
  type: 'text' | 'file';
  content: string; // text content or base64 for files
  fileName?: string;
  fileType?: string;
  createdAt: number;
  expiresAt: number;
}

const STORAGE_KEY = 'dropzone_items';
const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getAll(): Record<string, SharedItem> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const items = JSON.parse(raw) as Record<string, SharedItem>;
    // Purge expired
    const now = Date.now();
    const valid: Record<string, SharedItem> = {};
    for (const [k, v] of Object.entries(items)) {
      if (v.expiresAt > now) valid[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    return valid;
  } catch {
    return {};
  }
}

export function createTextShare(text: string): string {
  const code = generateCode();
  const items = getAll();
  items[code] = {
    id: code,
    type: 'text',
    content: text,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPIRY_MS,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return code;
}

export function createFileShare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const code = generateCode();
      const items = getAll();
      items[code] = {
        id: code,
        type: 'file',
        content: reader.result as string,
        fileName: file.name,
        fileType: file.type,
        createdAt: Date.now(),
        expiresAt: Date.now() + EXPIRY_MS,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        resolve(code);
      } catch {
        reject(new Error('File too large for local storage'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function retrieveShare(code: string): SharedItem | null {
  const items = getAll();
  return items[code.toUpperCase()] || null;
}

export function getTimeRemaining(item: SharedItem): string {
  const remaining = item.expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
