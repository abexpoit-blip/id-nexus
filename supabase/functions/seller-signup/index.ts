import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { telegram_username, password, display_name } = await req.json();

    if (!telegram_username || !password) {
      return new Response(JSON.stringify({ error: 'telegram_username and password required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tg = String(telegram_username).trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(tg)) {
      return new Response(JSON.stringify({ error: 'Invalid Telegram username (3-32 chars, a-z, 0-9, _)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (String(password).length < 4) {
      return new Response(JSON.stringify({ error: 'Password too short (min 4)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Synthetic email so Supabase auth accepts it; user signs in with same creds via our edge fn or directly
    const email = `${tg}@seller.nexus-x.local`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || tg, telegram_username: tg, role: 'seller' },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || 'Signup failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { error: roleErr } = await admin.rpc('assign_seller_role_by_telegram', {
      p_user_id: created.user.id,
      p_telegram_username: tg,
    });
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, email, telegram_username: tg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});