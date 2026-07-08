import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, checkOnly } = await req.json().catch(() => ({}));
    if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code.toUpperCase())) {
      return new Response(JSON.stringify({ error: 'Invalid code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const nowIso = new Date().toISOString();
    const normalized = code.toUpperCase();

    if (checkOnly) {
      const { data, error } = await supabase
        .from('shared_items')
        .select('encrypted, type')
        .eq('code', normalized)
        .gt('expires_at', nowIso)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ found: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ found: true, encrypted: !!data.encrypted, type: data.type }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('shared_items')
      .select('id, code, type, content, file_name, file_type, encrypted, created_at, expires_at, storage_paths, file_sizes, file_names, file_types')
      .eq('code', normalized)
      .gt('expires_at', nowIso)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return new Response(JSON.stringify({ item: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ item: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
