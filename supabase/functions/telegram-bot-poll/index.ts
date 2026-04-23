import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

// ============== Bangla labels (BasicTrick-style premium buttons) ==============
const T = {
  welcome: (name: string) =>
    `<b>★★ Nexus X Store ★★</b>\n\n` +
    `✨ "আপনার সন্তুষ্টিই আমাদের সার্থকতা।"\n\n` +
    `👤 অ্যাকাউন্ট: <b>${name}</b>\n` +
    `🛒 সার্ভিস নিতে নিচের বাটনে ক্লিক করুন:`,
  notLinked:
    `⚠️ আপনার Telegram কোনো অ্যাকাউন্টের সাথে লিংক করা নেই।\n\n` +
    `<b>🔗 কীভাবে লিংক করবেন:</b>\n` +
    `১. ওয়েবসাইটে গিয়ে Dashboard → Telegram\n` +
    `২. আপনার link code কপি করুন\n` +
    `৩. কোডটি এই বটে পাঠান (যেমন <code>ABC12345</code>)`,
  unknown: '❓ অজানা কমান্ড। মেনু দেখতে /start পাঠান।',
  buyMenuTitle: '<b>📚 আইডি ক্যাটাগরি মেনু</b>\n\nনিচ থেকে একটি ক্যাটাগরি নির্বাচন করুন:',
  noCategories: 'এখন কোনো ক্যাটাগরি available নেই।',
  outOfStock: '❌ স্টক শেষ! অনুগ্রহ করে পরে আবার চেষ্টা করুন।',
  insufficient: (need: number, have: number) =>
    `❌ পর্যাপ্ত ব্যালেন্স নেই।\n\nপ্রয়োজন: ৳${need}\nআপনার ব্যালেন্স: ৳${have}\n\n"💵 ব্যালেন্স অ্যাড" বাটনে ক্লিক করে টপ-আপ করুন।`,
  depositForm:
    `<b>💵 ডিপোজিট ফর্ম</b>\n\n` +
    `কমান্ড পাঠান:\n` +
    `<code>/deposit AMOUNT METHOD SENDER_NO TXN_ID</code>\n\n` +
    `উদাহরণ:\n<code>/deposit 500 bkash 01712345678 9A1B2C3D4E</code>\n\n` +
    `METHOD = <b>bkash</b> অথবা <b>nagad</b>\n` +
    `মিনিমাম: ৳50`,
  support: '<b>📞 সাপোর্ট</b>\n\nএডমিনের সাথে যোগাযোগ করতে: @basictrick_admin',
  back: '⬅️ ফিরে যান',
  buyId: '🛒 আইডি কিনুন',
  addBalance: '💵 ব্যালেন্স অ্যাড',
  profile: '👤 প্রোফাইল',
  supportBtn: '📞 সাপোর্ট ও হেল্প',
  logout: '🚪 লগআউট',
  confirmBuy: '✅ কনফার্ম করে কিনুন',
  cancel: '❌ বাতিল',
};

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: T.buyId, callback_data: 'menu:buy' }, { text: T.addBalance, callback_data: 'menu:deposit' }],
      [{ text: T.profile, callback_data: 'menu:profile' }, { text: T.supportBtn, callback_data: 'menu:support' }],
      [{ text: T.logout, callback_data: 'menu:logout' }],
    ],
  };
}

function backOnly() {
  return { inline_keyboard: [[{ text: T.back, callback_data: 'menu:home' }]] };
}

// ============== Entry point ==============
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
        else if (u.callback_query) await handleCallback(admin, TG_TOKEN, ADMIN_CHAT, u.callback_query);
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

// ============== Helpers ==============
function isAdminChat(chatId: number, adminChat: string | undefined) {
  if (!adminChat) return false;
  return String(chatId) === String(adminChat).trim();
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

async function sendMain(token: string, chatId: number, name: string) {
  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: T.welcome(name),
    parse_mode: 'HTML',
    reply_markup: mainMenu(),
  });
}

// ============== Message handler ==============
async function handleMessage(
  admin: any, token: string,
  vpsUrl: string | undefined, vpsToken: string | undefined,
  adminChat: string | undefined, msg: any,
) {
  const chatId: number = msg.chat.id;
  const text: string = (msg.text ?? '').trim();

  // Lookup linked profile
  const { data: prof } = await admin
    .from('profiles').select('id, display_name, email, balance_bdt')
    .eq('telegram_chat_id', chatId).maybeSingle();

  // ---- Unlinked: try linking via code, else show help ----
  if (!prof) {
    const codeMatch = text.match(/^(?:\/start\s+)?([A-Z0-9]{6,12})$/i);
    if (codeMatch) {
      const code = codeMatch[1].toUpperCase();
      const { data: target } = await admin
        .from('profiles')
        .select('id, display_name, email, telegram_chat_id')
        .eq('telegram_link_code', code).maybeSingle();
      if (!target) {
        await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ ভুল link code। নতুন code কপি করে আবার পাঠান।' });
        return;
      }
      if (target.telegram_chat_id && target.telegram_chat_id !== chatId) {
        await tg(token, 'sendMessage', { chat_id: chatId, text: '⚠️ এই অ্যাকাউন্ট অন্য Telegram-এ লিংক আছে। মালিককে /logout পাঠাতে বলুন।' });
        return;
      }
      await admin.from('profiles').update({ telegram_chat_id: chatId }).eq('id', target.id);
      await sendMain(token, chatId, target.display_name ?? target.email ?? 'User');
      return;
    }
    await tg(token, 'sendMessage', { chat_id: chatId, text: T.notLinked, parse_mode: 'HTML' });
    return;
  }

  const displayName = prof.display_name ?? prof.email ?? 'User';

  // ---- /start, /menu, /help → main menu ----
  if (text === '/start' || text === '/menu' || text === '/help') {
    await sendMain(token, chatId, displayName);
    return;
  }

  // ---- /logout ----
  if (text === '/logout' || text === '/disconnect') {
    await admin.from('telegram_bot_sessions').delete().eq('chat_id', chatId);
    await admin.from('profiles').update({ telegram_chat_id: null }).eq('id', prof.id);
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `👋 আপনি লগআউট হয়েছেন।\n\nনতুন অ্যাকাউন্ট লিংক করতে website-এর Dashboard → Telegram থেকে কোড নিয়ে এই বটে পাঠান।`,
    });
    return;
  }

  // ---- /deposit (works for everyone) ----
  if (text.startsWith('/deposit')) {
    await handleDeposit(admin, token, chatId, text);
    return;
  }

  // ---- Photo upload after /deposit ----
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    await handlePhotoUpload(admin, token, vpsUrl, vpsToken, adminChat, chatId, prof, msg);
    return;
  }

  // ---- Admin-only commands (HIDDEN — only admin chat can use) ----
  if (isAdminChat(chatId, adminChat)) {
    if (text.startsWith('/replace')) {
      await handleReplace(admin, token, chatId, text);
      return;
    }
  }

  // ---- Default ----
  await tg(token, 'sendMessage', { chat_id: chatId, text: T.unknown });
}

// ============== Callback (button press) handler ==============
// Admin-only callback prefixes — non-admin attempts are rejected unconditionally.
const ADMIN_CALLBACK_PREFIXES = ['approve:', 'reject:', 'admin:'];

async function handleCallback(admin: any, token: string, adminChat: string | undefined, cq: any) {
  const chatId = cq.from.id;
  const data: string = cq.data ?? '';
  const msgId = cq.message?.message_id;

  // ===== Hard guard: ANY admin-prefixed callback must come from TELEGRAM_ADMIN_CHAT_ID =====
  const isAdminCb = ADMIN_CALLBACK_PREFIXES.some((p) => data.startsWith(p));
  if (isAdminCb) {
    if (!adminChat || !isAdminChat(chatId, adminChat)) {
      console.warn(`[security] non-admin chat ${chatId} attempted admin callback "${data}"`);
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '⛔ Admin only', show_alert: true });
      return;
    }
    if (data.startsWith('approve:') || data.startsWith('reject:')) {
      await handleAdminTopupCallback(admin, token, cq);
      return;
    }
    // future admin: prefixed callbacks fall through to a no-op
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  // Get linked profile
  const { data: prof } = await admin
    .from('profiles').select('id, display_name, email, balance_bdt')
    .eq('telegram_chat_id', chatId).maybeSingle();
  if (!prof) {
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '🔗 প্রথমে অ্যাকাউন্ট লিংক করুন', show_alert: true });
    return;
  }

  const name = prof.display_name ?? prof.email ?? 'User';

  // ---- Main menu navigation ----
  if (data === 'menu:home') {
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: T.welcome(name), parse_mode: 'HTML', reply_markup: mainMenu(),
    });
    return;
  }

  if (data === 'menu:buy') {
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    const { data: cats, error } = await admin.rpc('bot_get_categories');
    if (error || !cats || cats.length === 0) {
      await tg(token, 'editMessageText', {
        chat_id: chatId, message_id: msgId,
        text: T.noCategories, reply_markup: backOnly(),
      });
      return;
    }
    const buttons = (cats as any[]).map((c) => ([{
      text: `📦 ${c.name} (${c.available}) → ৳${c.price_bdt}`,
      callback_data: `cat:${c.id}`,
    }]));
    buttons.push([{ text: T.back, callback_data: 'menu:home' }]);
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: T.buyMenuTitle, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
    return;
  }

  if (data.startsWith('cat:')) {
    const catId = data.slice(4);
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    const { data: cats } = await admin.rpc('bot_get_categories');
    const cat = (cats as any[] | null)?.find((c) => c.id === catId);
    if (!cat) {
      await tg(token, 'editMessageText', {
        chat_id: chatId, message_id: msgId,
        text: '❌ ক্যাটাগরি পাওয়া যায়নি।', reply_markup: backOnly(),
      });
      return;
    }
    const text =
      `<b>📦 ${cat.name}</b>\n\n` +
      `💰 দাম: <b>৳${cat.price_bdt}</b>\n` +
      `📊 স্টক: <b>${cat.available}</b>\n` +
      `💼 আপনার ব্যালেন্স: <b>৳${prof.balance_bdt}</b>\n\n` +
      (cat.available > 0 ? `কনফার্ম করলে ১টি আইডি ডেলিভার হবে।` : `❌ এই মুহূর্তে স্টক নেই।`);
    const kb: any[] = [];
    if (cat.available > 0) kb.push([{ text: T.confirmBuy, callback_data: `buy:${cat.id}` }]);
    kb.push([{ text: T.back, callback_data: 'menu:buy' }]);
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb },
    });
    return;
  }

  if (data.startsWith('buy:')) {
    const catId = data.slice(4);
    // STAGE 1: Processing
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '⏳ প্রসেস হচ্ছে...' });
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: '⏳ <b>আপনার অর্ডার প্রসেস হচ্ছে...</b>\n\nঅনুগ্রহ করে অপেক্ষা করুন।',
      parse_mode: 'HTML',
    });
    const { data: res, error } = await admin.rpc('bot_buy_account', {
      p_telegram_chat_id: chatId,
      p_category_id: catId,
    });
    if (error) {
      const msg = String(error.message || '');
      let userMsg = `❌ ${msg}`;
      if (msg.includes('insufficient_balance')) {
        const { data: cats } = await admin.rpc('bot_get_categories');
        const cat = (cats as any[] | null)?.find((c) => c.id === catId);
        userMsg = T.insufficient(cat?.price_bdt ?? 0, prof.balance_bdt);
      } else if (msg.includes('out_of_stock')) userMsg = T.outOfStock;
      else if (msg.includes('account_banned')) userMsg = '⛔ আপনার অ্যাকাউন্ট ব্যান করা হয়েছে।';
      await tg(token, 'editMessageText', {
        chat_id: chatId, message_id: msgId,
        text: userMsg, parse_mode: 'HTML', reply_markup: backOnly(),
      });
      return;
    }
    const r = res as any;
    // STAGE 2: Delivered with credentials + CSV file
    const lines = [
      `📬 <b>ডেলিভারি সম্পন্ন!</b>`,
      ``,
      `📦 ${r.category}`,
      `🆔 UID: <code>${r.uid}</code>`,
      `🔑 Password: <code>${r.password}</code>`,
    ];
    if (r.two_fa) lines.push(`🔐 2FA: <code>${r.two_fa}</code>`);
    if (r.email) lines.push(`📧 Email: <code>${r.email}</code>`);
    if (r.email_password) lines.push(`📧 Email Pass: <code>${r.email_password}</code>`);
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: lines.join('\n'), parse_mode: 'HTML',
    });
    // CSV download (Excel-compatible)
    await sendOrderCsv(token, chatId, r.category, [{
      uid: r.uid, password: r.password, two_fa: r.two_fa,
      email: r.email, email_password: r.email_password,
    }], r.order_id ?? 'order');
    // STAGE 3: Final confirmation
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        `✅ <b>অর্ডার সম্পন্ন!</b>\n\n` +
        `💼 নতুন ব্যালেন্স: <b>৳${r.new_balance}</b>\n` +
        `🙏 আমাদের সেবা ব্যবহারের জন্য ধন্যবাদ।`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: T.buyId, callback_data: 'menu:buy' }],
        [{ text: '🏠 মেনু', callback_data: 'menu:home' }],
      ]},
    });
    return;
  }

  if (data === 'menu:deposit') {
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: T.depositForm, parse_mode: 'HTML', reply_markup: backOnly(),
    });
    return;
  }

  if (data === 'menu:profile') {
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    const { data: pres, error } = await admin.rpc('bot_get_profile', { p_telegram_chat_id: chatId });
    if (error) {
      await tg(token, 'editMessageText', {
        chat_id: chatId, message_id: msgId,
        text: `❌ ${error.message}`, reply_markup: backOnly(),
      });
      return;
    }
    const p = pres as any;
    const text =
      `<b>👤 প্রোফাইল</b>\n\n` +
      `নাম: <b>${p.display_name ?? p.email}</b>\n` +
      `ইউজার আইডি: <code>${(p.user_id as string).slice(0, 8)}</code>\n` +
      `মোট ব্যালেন্স: <b>৳${p.balance_bdt}</b>\n` +
      `মোট অর্ডার: <b>${p.orders_count}</b>`;
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text, parse_mode: 'HTML', reply_markup: backOnly(),
    });
    return;
  }

  if (data === 'menu:support') {
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: T.support, parse_mode: 'HTML', reply_markup: backOnly(),
    });
    return;
  }

  if (data === 'menu:logout') {
    await admin.from('telegram_bot_sessions').delete().eq('chat_id', chatId);
    await admin.from('profiles').update({ telegram_chat_id: null }).eq('id', prof.id);
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '👋 লগআউট সম্পন্ন' });
    await tg(token, 'editMessageText', {
      chat_id: chatId, message_id: msgId,
      text: '👋 আপনি লগআউট হয়েছেন। নতুন link code পাঠিয়ে আবার লিংক করুন।',
    });
    return;
  }

  await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
}

// ============== Deposit flow ==============
async function handleDeposit(admin: any, token: string, chatId: number, text: string) {
  const parts = text.split(/\s+/).slice(1);
  if (parts.length < 4) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: T.depositForm, parse_mode: 'HTML' });
    return;
  }
  const amount = Number(parts[0]);
  const method = parts[1].toLowerCase();
  const sender = parts[2];
  const txn = parts[3];
  if (!amount || amount < 50) { await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ মিনিমাম ৳50 প্রয়োজন।' }); return; }
  if (method !== 'bkash' && method !== 'nagad') { await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Method bkash বা nagad হতে হবে।' }); return; }

  await admin.from('telegram_bot_sessions').upsert({
    chat_id: chatId,
    state: { kind: 'awaiting_screenshot', amount, method, sender, txn, created: Date.now() },
    updated_at: new Date().toISOString(),
  });
  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: `📸 পেয়েছি!\n\n৳${amount} via ${method} (sender ${sender}, txn ${txn})\n\nএখন <b>পেমেন্টের স্ক্রিনশট ছবি হিসেবে</b> পাঠান।`,
    parse_mode: 'HTML',
  });
}

async function handlePhotoUpload(
  admin: any, token: string,
  vpsUrl: string | undefined, vpsToken: string | undefined,
  adminChat: string | undefined, chatId: number, prof: any, msg: any,
) {
  const { data: sess } = await admin.from('telegram_bot_sessions').select('state').eq('chat_id', chatId).maybeSingle();
  const st = sess?.state ?? {};
  if (st.kind !== 'awaiting_screenshot') {
    await tg(token, 'sendMessage', { chat_id: chatId, text: 'ℹ️ আগে /deposit কমান্ড পাঠান, তারপর স্ক্রিনশট পাঠান।' });
    return;
  }
  if (!vpsUrl || !vpsToken) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: '⚠️ Server configured না। Admin-এর সাথে যোগাযোগ করুন।' });
    return;
  }
  const photo = msg.photo[msg.photo.length - 1];
  const fileInfo = await tg(token, 'getFile', { file_id: photo.file_id });
  if (!fileInfo?.result?.file_path) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ ছবি আনতে পারিনি।' });
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
    await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ Upload failed: ${upText.slice(0, 200)}` });
    return;
  }
  let parsed: any = {};
  try { parsed = JSON.parse(upText); } catch { parsed = { url: upText.trim() }; }
  if (!parsed?.url) { await tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Upload returned no URL' }); return; }

  const { data: res, error } = await admin.rpc('bot_submit_topup_request', {
    p_telegram_chat_id: chatId,
    p_amount: st.amount, p_method: st.method,
    p_sender_number: st.sender, p_txn_id: st.txn,
    p_screenshot_url: parsed.url,
  });
  if (error) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ ${error.message}` });
    return;
  }
  const reqId = (res as any)?.id;
  await admin.from('telegram_bot_sessions').delete().eq('chat_id', chatId);
  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: `✅ টপ-আপ রিকোয়েস্ট সাবমিট হয়েছে!\n\nID: <code>${reqId}</code>\nAdmin শীঘ্রই রিভিউ করবে।`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🏠 মেনু', callback_data: 'menu:home' }]] },
  });
  if (adminChat) {
    await tg(token, 'sendPhoto', {
      chat_id: adminChat, photo: parsed.url,
      caption:
        `💰 <b>New top-up</b>\n` +
        `User: ${prof.display_name ?? prof.email ?? prof.id.slice(0, 8)}\n` +
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
}

// ============== Admin /replace ==============
async function handleReplace(admin: any, token: string, chatId: number, text: string) {
  const parts = text.split(/\s+/);
  if (parts.length < 3) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: '⚠️ Usage: /replace <item_id> <category_slug> [optional message]' });
    return;
  }
  const itemId = parts[1];
  const catSlug = parts[2];
  const message = parts.slice(3).join(' ').trim() || null;
  const { data: res, error } = await admin.rpc('bot_admin_replace_with_category', {
    p_admin_chat_id: chatId, p_item_id: itemId, p_category_slug: catSlug, p_message: message,
  });
  if (error) { await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ ${error.message}` }); return; }
  const r = res as any;
  const orderTime = r.order_created_at ? new Date(r.order_created_at).toUTCString() : 'unknown';
  const windowLine = r.in_window
    ? `🟢 In window (${Math.floor((r.minutes_left ?? 0) / 60)}h ${(r.minutes_left ?? 0) % 60}m left of ${r.window_hours}h)`
    : `🔴 Out of window (${r.window_hours}h expired)`;
  await tg(token, 'sendMessage', {
    chat_id: chatId, parse_mode: 'HTML',
    text:
      `✅ <b>Replacement done</b>\n\n` +
      `Outcome: <b>${r.outcome ?? 'replaced'}</b>\n` +
      `Reported UID: <code>${r.reported_uid ?? '-'}</code>\n` +
      `New UID: <code>${r.new_uid}</code> (${r.category})\n` +
      `Buyer: ${r.buyer_name || '-'}\n` +
      `Order placed: ${orderTime}\n${windowLine}`,
  });
}

// ============== Admin topup approve/reject callback ==============
async function handleAdminTopupCallback(admin: any, token: string, cq: any) {
  const data: string = cq.data ?? '';
  const [action, reqId] = data.split(':');
  if (!reqId) return;
  const chatId = cq.from.id;

  if (action === 'approve') {
    const { data: res, error } = await admin.rpc('bot_admin_approve_topup', {
      p_admin_chat_id: chatId, p_request_id: reqId,
    });
    if (error) {
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: `❌ ${error.message}`, show_alert: true });
      return;
    }
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Approved' });
    await tg(token, 'editMessageCaption', {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id,
      caption: (cq.message.caption ?? '') + `\n\n✅ <b>Approved</b> · new balance ৳${(res as any)?.new_balance}`,
      parse_mode: 'HTML',
    });
  } else if (action === 'reject') {
    const { error } = await admin.rpc('bot_admin_reject_topup', {
      p_admin_chat_id: chatId, p_request_id: reqId, p_note: 'Rejected via Telegram bot',
    });
    if (error) {
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: `❌ ${error.message}`, show_alert: true });
      return;
    }
    await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '❌ Rejected' });
    await tg(token, 'editMessageCaption', {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id,
      caption: (cq.message.caption ?? '') + `\n\n❌ <b>Rejected</b>`,
      parse_mode: 'HTML',
    });
  }
}
// ============== CSV delivery helper (Excel-compatible) ==============
function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function sendOrderCsv(
  token: string, chatId: number, category: string,
  accounts: Array<{ uid: string; password: string; two_fa?: string | null; email?: string | null; email_password?: string | null }>,
  orderId: string,
) {
  const header = ['UID', 'Password', '2FA', 'Email', 'EmailPassword'].join(',');
  const rows = accounts.map((a) => [
    csvEscape(a.uid), csvEscape(a.password), csvEscape(a.two_fa ?? ''),
    csvEscape(a.email ?? ''), csvEscape(a.email_password ?? ''),
  ].join(','));
  // BOM + CRLF so Excel opens UTF-8 cleanly
  const csv = '\uFEFF' + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const safeCat = category.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
  const filename = `order_${safeCat}_${String(orderId).slice(0, 8)}.csv`;

  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', `📎 ${category} — ${accounts.length} ID${accounts.length > 1 ? 's' : ''} (Excel-এ open করুন)`);
  fd.append('document', blob, filename);
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
}
