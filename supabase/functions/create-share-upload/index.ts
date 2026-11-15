import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';

const input = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  name: z.string().min(1).max(255),
  index: z.number().int().min(0).max(999),
  size: z.number().int().min(0).max(10 * 1024 * 1024 * 1024),
}).strict();

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Intentionally account-free: this grants only creation at a fresh server-generated
// path. It never grants listing, reading, deleting or overwriting existing files.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  try {
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return response({ error: 'Invalid upload details' }, 400);
    const { code, name, index } = parsed.data;
    const safeName = name.replace(/[^\w.\-]/g, '_').slice(0, 80);
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      (b) => b.toString(16).padStart(2, '0')).join('');
    const path = `${code}/${index}-${suffix}-${safeName}`;
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.storage.from('shared-files')
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return response({ error: 'Could not prepare upload' }, 500);
    return response({ path, token: data.token });
  } catch {
    return response({ error: 'Could not prepare upload' }, 500);
  }
});