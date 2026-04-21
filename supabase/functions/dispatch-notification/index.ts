import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Called by a DB trigger via pg_net after a notification row is inserted.
// Body: { notification_id: uuid }
// Uses service role to look up the user's telegram_chat_id and send the message.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { notification_id } = await req.json();
    if (!notification_id) return json({ error: 'notification_id required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: n, error: nErr } = await admin
      .from('notifications')
      .select('user_id, title, body')
      .eq('id', notification_id)
      .maybeSingle();
    if (nErr || !n) return json({ error: 'notification not found' }, 404);

    const { data: profile } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', n.user_id)
      .maybeSingle();
    if (!profile?.telegram_chat_id) return json({ ok: false, reason: 'no telegram link' });

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

    const text = `<b>${escapeHtml(n.title)}</b>${n.body ? `\n${escapeHtml(n.body)}` : ''}`;
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: profile.telegram_chat_id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const tgData = await tg.json();
    if (!tg.ok) return json({ error: 'telegram send failed', detail: tgData }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}