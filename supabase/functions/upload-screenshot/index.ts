import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Receives an image file from the buyer, forwards it to the user's VPS upload endpoint,
// and returns the public URL the VPS gives back. Authenticated users only.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Diagnostic: GET /upload-screenshot/diag → tests VPS connectivity & token
    if (req.method === 'GET' && url.pathname.endsWith('/diag')) {
      const VPS_URL = Deno.env.get('VPS_UPLOAD_URL') ?? '';
      const VPS_TOKEN = Deno.env.get('VPS_UPLOAD_TOKEN') ?? '';
      const out: any = {
        VPS_URL_set: !!VPS_URL,
        VPS_URL_preview: VPS_URL ? VPS_URL.replace(/^(https?:\/\/[^/]+).*/, '$1') + '/...' : null,
        VPS_URL_endsWith_upload: VPS_URL.endsWith('/upload'),
        VPS_TOKEN_set: !!VPS_TOKEN,
        VPS_TOKEN_length: VPS_TOKEN.length,
      };
      try {
        const base = VPS_URL.replace(/\/upload\/?$/, '');
        const h = await fetch(base + '/health', { method: 'GET' });
        out.health_status = h.status;
        out.health_body = (await h.text()).slice(0, 200);
      } catch (e) {
        out.health_error = String(e);
      }
      return json(out);
    }

    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthenticated' }, 401);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: me } = await sb.auth.getUser();
    if (!me.user) return json({ error: 'Unauthenticated' }, 401);

    const VPS_URL = Deno.env.get('VPS_UPLOAD_URL');
    const VPS_TOKEN = Deno.env.get('VPS_UPLOAD_TOKEN');
    if (!VPS_URL || !VPS_TOKEN) return json({ error: 'VPS not configured' }, 500);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'file field required' }, 400);
    if (file.size > 5 * 1024 * 1024) return json({ error: 'Max 5MB' }, 413);
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) return json({ error: 'Only PNG/JPG/WEBP' }, 415);

    const out = new FormData();
    out.append('file', file, file.name || `screenshot-${Date.now()}.jpg`);
    out.append('user_id', me.user.id);

    const r = await fetch(VPS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${VPS_TOKEN}` },
      body: out,
    });
    const text = await r.text();
    if (!r.ok) return json({ error: 'VPS upload failed', detail: text.slice(0, 500) }, 502);

    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* allow plain url */ parsed = { url: text.trim() }; }
    if (!parsed?.url) return json({ error: 'VPS did not return url', detail: text.slice(0, 500) }, 502);

    return json({ ok: true, url: parsed.url, filename: parsed.filename ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}