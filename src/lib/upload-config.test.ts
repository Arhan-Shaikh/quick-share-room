import { describe, expect, it } from 'vitest';
import { resumableUploadEndpoint, uploadErrorMessage, UPLOAD_RETRY_DELAYS } from './upload-config';

describe('resumable upload configuration', () => {
  it('uses the direct storage host for large hosted uploads', () => {
    expect(resumableUploadEndpoint('https://example123.supabase.co')).toBe(
      'https://example123.storage.supabase.co/storage/v1/upload/resumable',
    );
  });
  it('preserves custom and local storage hosts', () => {
    expect(resumableUploadEndpoint('http://localhost:54321')).toBe(
      'http://localhost:54321/storage/v1/upload/resumable',
    );
    expect(resumableUploadEndpoint('https://example123.storage.supabase.co')).toBe(
      'https://example123.storage.supabase.co/storage/v1/upload/resumable',
    );
  });
  it('allows more than a minute of connection recovery', () => {
    expect(UPLOAD_RETRY_DELAYS.reduce((sum, delay) => sum + delay, 0)).toBeGreaterThan(60000);
  });
  it('does not expose raw request URLs in network errors', () => {
    expect(uploadErrorMessage(new Error('https://private-host/upload'))).not.toContain('https://');
    expect(uploadErrorMessage({ originalResponse: { getStatus: () => 413 } })).toContain('storage upload limit');
  });
});