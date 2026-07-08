import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Signs a short-lived URL for a file in the private `shared-files` bucket,
// but ONLY after validating that the requested storage path belongs to a
// non-expired share row identified by the 6-character room code.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, path } = await req.json().catch(() => ({}));
    if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code.toUpperCase())) {
      return new Response(JSON.stringify({ error: 'Invalid code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof path !== 'string' || path.length === 0 || path.length > 512) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const normalized = code.toUpperCase();
    const nowIso = new Date().toISOString();

    const { data: item, error } = await supabase
      .from('shared_items')
      .select('storage_paths, expires_at')
      .eq('code', normalized)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (error) throw error;
    if (!item || !item.storage_paths || !item.storage_paths.includes(path)) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('shared-files')
      .createSignedUrl(path, 60 * 10); // 10-minute signed URL

    if (signErr || !signed) throw signErr ?? new Error('Failed to sign URL');

    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
