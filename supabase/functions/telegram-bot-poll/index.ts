import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

// Telegram bot polling: handles /deposit flow for linked buyers,
// and Approve/Reject inline buttons for admins.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const start = Date.now();
  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!TG_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

  const VPS_URL = Deno.env.get('VPS_UPLOAD_URL');
  const VPS_TOKEN = Deno.env.get('VPS_UPLOAD_TOKEN');
  const ADMIN_CHAT = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: state, error: stateErr } = await admin
    .from('telegram_bot_state').select('update_offset').eq('id', 1).single();
  if (stateErr) return json({ error: stateErr.message }, 500);

  let offset: number = (state?.update_offset as number) ?? 0;
  let processed = 0;

  while (true) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - start);
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(50, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset, timeout, allowed_updates: ['message', 'callback_query'] }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data }, 502);
    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      try {
        if (u.message) await handleMessage(admin, TG_TOKEN, VPS_URL, VPS_TOKEN, ADMIN_CHAT, u.message);
        else if (u.callback_query) await handleCallback(admin, TG_TOKEN, u.callback_query);
      } catch (e) {
        console.error('Update handle error', e);
      }
      processed++;
    }
    offset = Math.max(...updates.map((x: any) => x.update_id)) + 1;
    await admin.from('telegram_bot_state')
      .update({ update_offset: offset, updated_at: new Date().toISOString() })
      .eq('id', 1);
  }

  return json({ ok: true, processed, offset });
});

async function handleMessage(admin: any, token: string, vpsUrl: string | undefined, vpsToken: string | undefined, adminChat: string | undefined, msg: any) {
  const chatId: number = msg.chat.id;
  const text: string = (msg.text ?? '').trim();

  // Lookup linked profile
  const { data: prof } = await admin
    .from('profiles').select('id, display_name, email')
    .eq('telegram_chat_id', chatId).maybeSingle();

  if (!prof) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: '⚠️ Your Telegram is not linked to any account.\n\nPlease open the website → Dashboard → Telegram → copy your link code, then send it to this bot.',
    });
    return;
  }

  // /start or help
  if (text === '/start' || text === '/help') {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        `👋 Hello ${prof.display_name ?? prof.email ?? ''}\n\n` +
        `Commands:\n` +
        `/deposit <amount> <bkash|nagad> <sender_no> <txn_id> — submit a top-up\n` +
        `Then reply to my next message with the payment screenshot.\n\n` +
        `Admin only:\n` +
        `/replace <item_id> <category_slug> [message] — quick-replace a reported UID\n` +
        `Example: <code>/replace 1234abcd 61xxx Sorry for the inconvenience</code>\n\n` +
        `Example:\n<code>/deposit 500 bkash 01712345678 9A1B2C3D4E</code>`,
      parse_mode: 'HTML',
    });
    return;
  }

  // /replace <item_id> <category_slug> [message...]
  if (text.startsWith('/replace')) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ Usage: /replace <item_id> <category_slug> [optional message]',
      });
      return;
    }
    const itemId = parts[1];
    const catSlug = parts[2];
    const message = parts.slice(3).join(' ').trim() || null;
    const { data: res, error } = await admin.rpc('bot_admin_replace_with_category', {
      p_admin_chat_id: chatId,
      p_item_id: itemId,
      p_category_slug: catSlug,
      p_message: message,
    });
    if (error) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ ${error.message}` });
      return;
    }
    const r = res as {
      new_uid?: string;
      category?: string;
      reported_uid?: string;
      buyer_name?: string;
      order_created_at?: string | null;
      window_hours?: number;
      in_window?: boolean;
      minutes_left?: number;
      outcome?: string;
    };
    const orderTime = r.order_created_at
      ? new Date(r.order_created_at).toUTCString()
      : 'unknown';
    const windowLine = r.in_window
      ? `🟢 In window — buyer can still report (${Math.floor((r.minutes_left ?? 0) / 60)}h ${(r.minutes_left ?? 0) % 60}m left of ${r.window_hours}h)`
      : `🔴 Out of window — buyer can NOT replace anymore (${r.window_hours}h expired)`;
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        `✅ <b>Replacement done</b>\n\n` +
        `Outcome: <b>${r.outcome ?? 'replaced'}</b>\n` +
        `Reported UID: <code>${r.reported_uid ?? '-'}</code>\n` +
        `New UID: <code>${r.new_uid}</code> (${r.category})\n` +
        `Buyer: ${r.buyer_name || '-'}\n` +
        `Order placed: ${orderTime}\n` +
        `${windowLine}`,
      parse_mode: 'HTML',
    });
    return;
  }

  // /deposit command
  if (text.startsWith('/deposit')) {
    const parts = text.split(/\s+/).slice(1);
    if (parts.length < 4) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: '❌ Usage:\n<code>/deposit AMOUNT METHOD SENDER_NO TXN_ID</code>\n\nMETHOD = bkash or nagad',
        parse_mode: 'HTML',
      });
      return;
    }
    const amount = Number(parts[0]);
    const method = parts[1].toLowerCase();
    const sender = parts[2];
    const txn = parts[3];
    if (!amount || amount < 50) { await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Amount must be ≥ 50' }); return; }
    if (method !== 'bkash' && method !== 'nagad') { await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Method must be bkash or nagad' }); return; }

    await admin.from('telegram_bot_sessions').upsert({
      chat_id: chatId,
      state: { kind: 'awaiting_screenshot', amount, method, sender, txn, created: Date.now() },
      updated_at: new Date().toISOString(),
    });
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `📸 Got it!\n\n৳${amount} via ${method} from ${sender} (txn ${txn})\n\nNow please <b>reply with the payment screenshot</b> as a photo.`,
      parse_mode: 'HTML',
    });
    return;
  }

  // Photo upload — check if there's a pending session
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    const { data: sess } = await admin.from('telegram_bot_sessions').select('state').eq('chat_id', chatId).maybeSingle();
    const st = sess?.state ?? {};
    if (st.kind !== 'awaiting_screenshot') {
      await tg(token, 'sendMessage', { chat_id: chatId, text: 'ℹ️ Send /deposit first, then reply with screenshot.' });
      return;
    }
    if (!vpsUrl || !vpsToken) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: '⚠️ Server not configured for screenshots. Contact admin.' });
      return;
    }

    // Pick highest resolution
    const photo = msg.photo[msg.photo.length - 1];
    const fileInfo = await tg(token, 'getFile', { file_id: photo.file_id });
    if (!fileInfo?.result?.file_path) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Could not fetch photo from Telegram.' });
      return;
    }
    const dl = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`);
    const blob = await dl.blob();

    const fd = new FormData();
    fd.append('file', blob, `tg-${Date.now()}.jpg`);
    fd.append('user_id', prof.id);
    const up = await fetch(vpsUrl, { method: 'POST', headers: { Authorization: `Bearer ${vpsToken}` }, body: fd });
    const upText = await up.text();
    if (!up.ok) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ Screenshot upload failed: ${upText.slice(0, 200)}` });
      return;
    }
    let parsed: any = {};
    try { parsed = JSON.parse(upText); } catch { parsed = { url: upText.trim() }; }
    if (!parsed?.url) { await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Upload returned no URL' }); return; }

    // Submit topup via service role function
    const { data: res, error } = await admin.rpc('bot_submit_topup_request', {
      p_telegram_chat_id: chatId,
      p_amount: st.amount,
      p_method: st.method,
      p_sender_number: st.sender,
      p_txn_id: st.txn,
      p_screenshot_url: parsed.url,
    });
    if (error) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ ${error.message}` });
      return;
    }
    const reqId = (res as any)?.id;

    // Clear session
    await admin.from('telegram_bot_sessions').delete().eq('chat_id', chatId);

    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `✅ Top-up request submitted!\n\nID: <code>${reqId}</code>\nAdmin will review shortly.`,
      parse_mode: 'HTML',
    });

    // Notify admin chat with inline buttons
    if (adminChat) {
      await tg(token, 'sendPhoto', {
        chat_id: adminChat,
        photo: parsed.url,
        caption:
          `💰 <b>New top-up</b>\n` +
          `User: ${prof.display_name ?? prof.email ?? prof.id.slice(0,8)}\n` +
          `Amount: ৳${st.amount} via ${st.method}\n` +
          `Sender: <code>${st.sender}</code>\n` +
          `TxnID: <code>${st.txn}</code>\n` +
          `Source: telegram_bot`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Approve', callback_data: `approve:${reqId}` },
            { text: '❌ Reject', callback_data: `reject:${reqId}` },
          ]],
        },
      });
    }
    return;
  }

  // Default reply
  await tg(token, 'sendMessage', { chat_id: chatId, text: 'Send /help to see available commands.' });
}

async function handleCallback(admin: any, token: string, cq: any) {
  const chatId = cq.from.id;
  const data: string = cq.data ?? '';
  const [action, reqId] = data.split(':');
  if (!reqId) return;

  if (action === 'approve') {
    const { data: res, error } = await admin.rpc('bot_admin_approve_topup', {
      p_admin_chat_id: chatId,
      p_request_id: reqId,
    });
    if (error) {
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: `❌ ${error.message}`, show_alert: true });
      return;
    }
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Approved' });
    await tg(token, 'editMessageCaption', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      caption: (cq.message.caption ?? '') + `\n\n✅ <b>Approved</b> · new balance ৳${(res as any)?.new_balance}`,
      parse_mode: 'HTML',
    });
  } else if (action === 'reject') {
    const { error } = await admin.rpc('bot_admin_reject_topup', {
      p_admin_chat_id: chatId,
      p_request_id: reqId,
      p_note: 'Rejected via Telegram bot',
    });
    if (error) {
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: `❌ ${error.message}`, show_alert: true });
      return;
    }
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '❌ Rejected' });
    await tg(token, 'editMessageCaption', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      caption: (cq.message.caption ?? '') + `\n\n❌ <b>Rejected</b>`,
      parse_mode: 'HTML',
    });
  }
}

async function tg(token: string, method: string, body: any) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await r.json();
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}