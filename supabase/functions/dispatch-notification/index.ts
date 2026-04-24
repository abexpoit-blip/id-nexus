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

    // Special: website top-up notifications to admin → also forward to ADMIN GROUP
    // (so any admin in the group can approve/reject without opening the website)
    if (n.kind === 'system' && n.reference_id && /top-up request/i.test(n.title)) {
      // Best-effort: don't block the user-DM if group post fails
      try {
        await forwardTopupToAdminGroup(admin, token, n.reference_id);
      } catch (e) {
        console.error('forwardTopupToAdminGroup failed', e);
      }
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

// ============= Admin-group mirror for top-up screenshots =============
// Posts the deposit screenshot + meta + Approve/Reject buttons to the admin
// group configured via env `TELEGRAM_ADMIN_CHAT_ID`. The bot poller already
// handles `approve:<id>` / `reject:<id>` callbacks coming from that group.
//
// Idempotency: we tag a row in topup_requests.admin_note once posted, so
// repeated trigger fires for the same request won't spam the group.
async function forwardTopupToAdminGroup(admin: any, token: string, requestId: string) {
  const adminChat = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');
  if (!adminChat) return; // not configured — silently skip

  // Read the request + user info
  const { data: req } = await admin
    .from('topup_requests')
    .select('id, user_id, amount_bdt, method, sender_number, txn_id, screenshot_url, screenshot_path, status, source, admin_note')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return;
  if (req.status !== 'pending') return; // already processed
  if (req.admin_note && req.admin_note.includes('[group_posted]')) return; // already posted

  const { data: prof } = await admin
    .from('profiles')
    .select('display_name, email, balance_bdt')
    .eq('id', req.user_id)
    .maybeSingle();

  const who = prof?.display_name || prof?.email || String(req.user_id).slice(0, 8);
  const caption =
    `💰 <b>New top-up (${escapeHtml(req.source || 'website')})</b>\n` +
    `User: ${escapeHtml(who)}\n` +
    `Amount: ৳${req.amount_bdt} via ${escapeHtml(req.method)}\n` +
    `Sender: <code>${escapeHtml(req.sender_number)}</code>\n` +
    `TxnID: <code>${escapeHtml(req.txn_id)}</code>\n` +
    `Current balance: ৳${prof?.balance_bdt ?? 0}`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `approve:${req.id}` },
      { text: '❌ Reject', callback_data: `reject:${req.id}` },
    ]],
  };

  let posted = false;

  // Prefer photo if a public URL exists
  if (req.screenshot_url) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChat,
        photo: req.screenshot_url,
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
    posted = r.ok;
  }

  // If no public URL, try a signed URL from Supabase Storage
  if (!posted && req.screenshot_path) {
    const { data: signed } = await admin.storage
      .from('topup-screenshots')
      .createSignedUrl(req.screenshot_path, 60 * 60 * 24);
    if (signed?.signedUrl) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChat,
          photo: signed.signedUrl,
          caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });
      posted = r.ok;
    }
  }

  // Fall back to text-only message if no screenshot reachable
  if (!posted) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChat,
        text: `${caption}\n\n⚠️ <i>No screenshot attached</i>`,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
    posted = r.ok;
  }

  if (posted) {
    await admin.from('topup_requests').update({
      admin_note: ((req.admin_note ?? '') + ' [group_posted]').trim(),
    }).eq('id', req.id);
  }
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