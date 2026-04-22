import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cron-triggered: deletes VPS screenshots for top-ups approved more than 6 hours ago,
// then clears the screenshot_url column. Pending and rejected requests are kept.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const VPS_URL = Deno.env.get('VPS_UPLOAD_URL');
    const VPS_TOKEN = Deno.env.get('VPS_UPLOAD_TOKEN');
    if (!VPS_URL || !VPS_TOKEN) return json({ error: 'VPS not configured' }, 500);

    const { data: rows, error } = await admin.rpc('list_expired_topup_screenshots');
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const row of (rows ?? []) as { id: string; screenshot_url: string }[]) {
      try {
        const r = await fetch(VPS_URL, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${VPS_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: row.screenshot_url }),
        });
        const ok = r.ok;
        if (ok) {
          await admin.rpc('clear_topup_screenshot', { p_id: row.id });
        }
        results.push({ id: row.id, deleted: ok, status: r.status });
      } catch (e) {
        results.push({ id: row.id, deleted: false, error: String(e) });
      }
    }
    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}