import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sends a Telegram message to a user's linked chat_id.
// Body: { user_id: uuid, text: string }
// Auth: requires the caller to be authenticated; only admins or the user themselves can trigger.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthenticated' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: me } = await supabase.auth.getUser();
    if (!me.user) return json({ error: 'Unauthenticated' }, 401);

    const { user_id, text } = await req.json();
    if (!user_id || !text) return json({ error: 'user_id and text required' }, 400);

    // Permission: caller must be admin OR the recipient itself.
    if (me.user.id !== user_id) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: me.user.id, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', user_id)
      .maybeSingle();
    if (pErr) return json({ error: pErr.message }, 500);
    if (!profile?.telegram_chat_id) return json({ ok: false, reason: 'user has not linked telegram' });

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: profile.telegram_chat_id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const tgData = await tgRes.json();
    if (!tgRes.ok) return json({ error: 'telegram send failed', detail: tgData }, 502);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}