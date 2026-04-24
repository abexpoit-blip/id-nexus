import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Returns Telegram admin-mirror config status and lets an admin send a test message.
// Body:
//   { action: "status" }
//   { action: "test", text?: string }
//   { action: "forward_demo", amount?: number }
//     → creates a real pending topup_request for the calling admin, then mirrors
//       it to the Telegram admin group with working Approve/Reject buttons.
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

    if (action === 'forward_demo') {
      if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);
      if (!chatId) return json({ error: 'TELEGRAM_ADMIN_CHAT_ID missing' }, 500);

      const amount = Math.max(1, Math.min(100, Number(body?.amount) || 10));
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

      // Create a real pending top-up row owned by the admin themselves so the
      // existing approve/reject RPCs work end-to-end. Marked clearly as TEST.
      const { data: inserted, error: insErr } = await admin
        .from('topup_requests')
        .insert({
          user_id: who.user.id,
          amount_bdt: amount,
          method: 'bkash',
          sender_number: '01700000000',
          txn_id: `TEST-${stamp}`,
          status: 'pending',
          source: 'admin-test',
          screenshot_url:
            'https://placehold.co/600x800/1f2937/e5e7eb.png?text=TEST+SCREENSHOT',
          admin_note: '[admin-test]',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return json({ error: 'failed to create test topup', detail: insErr?.message }, 500);
      }

      // Read the user's current balance for caption parity with the real flow
      const { data: prof } = await admin
        .from('profiles')
        .select('display_name, email, balance_bdt')
        .eq('id', who.user.id)
        .maybeSingle();

      const who_label =
        prof?.display_name || prof?.email || String(who.user.id).slice(0, 8);
      const caption =
        `🧪 <b>TEST top-up (admin-test)</b>\n` +
        `User: ${escapeHtml(who_label)}\n` +
        `Amount: ৳${amount} via bkash\n` +
        `Sender: <code>01700000000</code>\n` +
        `TxnID: <code>TEST-${stamp}</code>\n` +
        `Current balance: ৳${prof?.balance_bdt ?? 0}\n\n` +
        `<i>Tap Approve / Reject to verify the end-to-end flow.</i>`;

      const replyMarkup = {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve:${inserted.id}` },
          { text: '❌ Reject', callback_data: `reject:${inserted.id}` },
        ]],
      };

      const tg = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: 'https://placehold.co/600x800/1f2937/e5e7eb.png?text=TEST+SCREENSHOT',
          caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });
      const tgData = await tg.json();
      if (!tg.ok) {
        return json({ error: 'telegram forward failed', detail: tgData, request_id: inserted.id }, 502);
      }

      // Tag as posted so the dispatch-notification trigger won't double-post
      await admin
        .from('topup_requests')
        .update({ admin_note: '[admin-test] [group_posted]' })
        .eq('id', inserted.id);

      return json({
        ok: true,
        request_id: inserted.id,
        amount_bdt: amount,
        chat_id_preview: maskChatId(chatId),
        message_id: tgData?.result?.message_id,
      });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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