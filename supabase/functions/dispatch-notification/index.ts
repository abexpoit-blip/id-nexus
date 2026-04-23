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
      .select('user_id, title, body, kind, reference_id')
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

    // Special: order_placed → 3-stage delivery (Processing → Delivered+CSV → Confirmation)
    if (n.kind === 'order_placed' && n.reference_id) {
      const out = await sendOrderDelivery(admin, token, profile.telegram_chat_id, n.reference_id);
      return json(out);
    }

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

// ============= Order delivery: 3 stages with CSV =============
async function sendOrderDelivery(admin: any, token: string, chatId: number, orderId: string) {
  // STAGE 1: Processing
  await tgSend(token, {
    chat_id: chatId,
    text: '⏳ <b>আপনার অর্ডার প্রসেস হচ্ছে...</b>\n\nID গুলো প্রস্তুত করা হচ্ছে।',
    parse_mode: 'HTML',
  });

  const { data: o, error } = await admin.rpc('bot_get_order_for_delivery', { p_order_id: orderId });
  if (error || !o) {
    await tgSend(token, { chat_id: chatId, text: `❌ অর্ডার ফেচ করতে পারিনি: ${error?.message ?? 'unknown'}` });
    return { ok: false, error: error?.message };
  }
  const accounts: any[] = o.accounts ?? [];

  // STAGE 2a: Delivered text — preview first 3 inline, rest in file
  const previewLines = [
    `📬 <b>ডেলিভারি সম্পন্ন!</b>`,
    ``,
    `📦 ${escapeHtml(o.category ?? '')} × ${o.quantity}`,
    `💰 মোট: ৳${o.total}`,
    ``,
  ];
  const preview = accounts.slice(0, Math.min(3, accounts.length));
  for (const a of preview) {
    previewLines.push(`🆔 <code>${escapeHtml(a.uid)}</code>`);
    previewLines.push(`🔑 <code>${escapeHtml(a.password)}</code>`);
    if (a.two_fa) previewLines.push(`🔐 2FA: <code>${escapeHtml(a.two_fa)}</code>`);
    if (a.email) previewLines.push(`📧 ${escapeHtml(a.email)}`);
    previewLines.push('');
  }
  if (accounts.length > preview.length) {
    previewLines.push(`⬇️ বাকি ${accounts.length - preview.length}টি ID নিচের ফাইলে আছে।`);
  }
  await tgSend(token, { chat_id: chatId, text: previewLines.join('\n'), parse_mode: 'HTML' });

  // STAGE 2b: CSV file (Excel-compatible)
  const header = ['UID', 'Password', '2FA', 'Email', 'EmailPassword'].join(',');
  const rows = accounts.map((a: any) =>
    [csvEscape(a.uid), csvEscape(a.password), csvEscape(a.two_fa ?? ''),
     csvEscape(a.email ?? ''), csvEscape(a.email_password ?? '')].join(','),
  );
  const csv = '\uFEFF' + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const safeCat = String(o.category ?? 'order').replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
  const filename = `order_${safeCat}_${String(o.order_id).slice(0, 8)}.csv`;
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', `📎 ${accounts.length} ID — Excel-এ open করুন`);
  fd.append('document', blob, filename);
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });

  // STAGE 3: Final confirmation
  await tgSend(token, {
    chat_id: chatId,
    text:
      `✅ <b>অর্ডার সম্পন্ন!</b>\n\n` +
      `💼 নতুন ব্যালেন্স: <b>৳${o.new_balance}</b>\n` +
      `🙏 ধন্যবাদ — আবার কেনাকাটার জন্য /start পাঠান।`,
    parse_mode: 'HTML',
  });

  return { ok: true, stages: 3, accounts: accounts.length };
}

async function tgSend(token: string, body: any) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}