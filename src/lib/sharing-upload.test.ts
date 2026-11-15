import { afterEach, expect, it, vi } from 'vitest';

const { insert } = vi.hoisted(() => ({ insert: vi.fn(async () => ({ error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: async () => ({ data: { path: 'ABC123/0-random-test.txt', token: 'upload-permission' }, error: null }) },
    from: () => ({ insert }),
  },
}));
vi.mock('tus-js-client', () => ({
  Upload: class {
    constructor(_file: File, private options: { onSuccess(): void }) {}
    start() {
      // Simulate a large upload taking longer than the selected lifetime.
      vi.setSystemTime(new Date('2026-11-15T06:20:00Z'));
      this.options.onSuccess();
    }
  },
}));

import { createMultiFileShare } from './sharing';

afterEach(() => vi.useRealTimers());

it('keeps the selected 15-minute lifetime after a slow upload finishes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T06:00:00Z'));
  await createMultiFileShare([new File(['test'], 'test.txt')], { expiryMs: 15 * 60 * 1000 });
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    expires_at: '2026-11-15T06:35:00.000Z',
  }));
});