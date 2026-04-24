import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Returns Telegram admin-mirror config status and lets an admin send a test message.
// Body: { action: "status" } | { action: "test", text?: string }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Verify the caller is an admin via their JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: who.user.id,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'status';

    if (action === 'status') {
      return json({
        bot_token_set: !!token,
        admin_chat_id_set: !!chatId,
        admin_chat_id_preview: chatId ? maskChatId(chatId) : null,
      });
    }

    if (action === 'test') {
      if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);
      if (!chatId) return json({ error: 'TELEGRAM_ADMIN_CHAT_ID missing' }, 500);
      const text =
        (typeof body?.text === 'string' && body.text.trim()) ||
        '✅ <b>NexusX admin test</b>\nTelegram admin group is configured correctly.';
      const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const data = await tg.json();
      if (!tg.ok) return json({ error: 'telegram send failed', detail: data }, 502);
      return json({ ok: true, chat_id_preview: maskChatId(chatId), message_id: data?.result?.message_id });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function maskChatId(id: string) {
  const s = String(id);
  if (s.length <= 4) return s;
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}