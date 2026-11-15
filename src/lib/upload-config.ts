/** Bypass the API gateway for hosted resumable uploads; preserve custom hosts. */
export function resumableUploadEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co');
  }
  url.pathname = '/storage/v1/upload/resumable';
  url.search = '';
  url.hash = '';
  return url.toString();
}

// Allow temporary mobile connection interruptions to recover on the same upload.
export const UPLOAD_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000];

export function uploadErrorMessage(error: unknown): string {
  const status = (error as { originalResponse?: { getStatus(): number } } | null)
    ?.originalResponse?.getStatus();
  if (!status) {
    return 'The upload connection was interrupted. Keep this page open, check your connection, and try again.';
  }
  if (status === 413) return 'This file exceeds the storage upload limit.';
  if (status === 401 || status === 403) return 'Storage rejected this upload. Please try again.';
  return 'The file could not be uploaded. Please try again shortly.';
}