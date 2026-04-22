-- Add new columns to topup_requests
ALTER TABLE public.topup_requests
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website';

-- Index for cron cleanup query
CREATE INDEX IF NOT EXISTS idx_topup_approved_screenshot
  ON public.topup_requests (approved_at)
  WHERE screenshot_url IS NOT NULL AND status = 'approved';

-- Update submit_topup_request to require screenshot_url
CREATE OR REPLACE FUNCTION public.submit_topup_request(
  p_amount numeric,
  p_method payment_method,
  p_sender_number text,
  p_txn_id text,
  p_screenshot_url text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount < 50 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Amount must be between 50 and 1,000,000';
  END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 5 THEN
    RAISE EXCEPTION 'Sender number required';
  END IF;
  IF p_txn_id IS NULL OR length(trim(p_txn_id)) < 4 THEN
    RAISE EXCEPTION 'Transaction ID required';
  END IF;
  IF p_screenshot_url IS NULL OR length(trim(p_screenshot_url)) < 8 THEN
    RAISE EXCEPTION 'Screenshot is required';
  END IF;

  INSERT INTO public.topup_requests(user_id, amount_bdt, method, sender_number, txn_id, note, screenshot_url, source)
  VALUES (v_uid, p_amount, p_method, trim(p_sender_number), trim(p_txn_id), p_note, trim(p_screenshot_url), 'website')
  RETURNING id INTO v_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  SELECT ur.user_id, 'system', 'New top-up request',
    format('৳%s via %s · txn %s', p_amount, p_method, p_txn_id), v_id
  FROM public.user_roles ur WHERE ur.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

-- Update admin_approve_topup to set approved_at
CREATE OR REPLACE FUNCTION public.admin_approve_topup(p_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_admin UUID := auth.uid(); v_req RECORD; v_new_balance NUMERIC(12,2);
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_req FROM public.topup_requests WHERE id = p_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already %', v_req.status; END IF;

  UPDATE public.profiles SET balance_bdt = balance_bdt + v_req.amount_bdt
    WHERE id = v_req.user_id RETURNING balance_bdt INTO v_new_balance;

  INSERT INTO public.balance_ledger(user_id, amount_bdt, kind, reference_id, note, balance_after)
  VALUES (v_req.user_id, v_req.amount_bdt, 'topup', v_req.id,
    format('Top-up approved · %s · txn %s', v_req.method, v_req.txn_id), v_new_balance);

  UPDATE public.topup_requests
    SET status = 'approved', admin_note = p_note,
        reviewed_by = v_admin, reviewed_at = now(),
        approved_at = now()
    WHERE id = p_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Top-up approved',
    format('৳%s added to your balance.', v_req.amount_bdt), v_req.id);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$function$;

-- Bot-side submit (uses service role; identifies user by telegram_chat_id)
CREATE OR REPLACE FUNCTION public.bot_submit_topup_request(
  p_telegram_chat_id bigint,
  p_amount numeric,
  p_method payment_method,
  p_sender_number text,
  p_txn_id text,
  p_screenshot_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE telegram_chat_id = p_telegram_chat_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Telegram account not linked. Please link your account on the website first.';
  END IF;
  IF p_amount IS NULL OR p_amount < 50 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Amount must be between 50 and 1,000,000';
  END IF;
  IF p_screenshot_url IS NULL OR length(trim(p_screenshot_url)) < 8 THEN
    RAISE EXCEPTION 'Screenshot is required';
  END IF;

  INSERT INTO public.topup_requests(user_id, amount_bdt, method, sender_number, txn_id, screenshot_url, source)
  VALUES (v_user_id, p_amount, p_method, trim(p_sender_number), trim(p_txn_id), trim(p_screenshot_url), 'telegram_bot')
  RETURNING id INTO v_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  SELECT ur.user_id, 'system', 'New top-up request (Bot)',
    format('৳%s via %s · txn %s', p_amount, p_method, p_txn_id), v_id
  FROM public.user_roles ur WHERE ur.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'user_id', v_user_id);
END;
$function$;

-- Bot-side approve/reject by admin (identifies admin by telegram_chat_id)
CREATE OR REPLACE FUNCTION public.bot_admin_approve_topup(
  p_admin_chat_id bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_admin_id UUID; v_req RECORD; v_new_balance NUMERIC(12,2);
BEGIN
  SELECT id INTO v_admin_id FROM public.profiles WHERE telegram_chat_id = p_admin_chat_id;
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  SELECT * INTO v_req FROM public.topup_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already %', v_req.status; END IF;

  UPDATE public.profiles SET balance_bdt = balance_bdt + v_req.amount_bdt
    WHERE id = v_req.user_id RETURNING balance_bdt INTO v_new_balance;

  INSERT INTO public.balance_ledger(user_id, amount_bdt, kind, reference_id, note, balance_after)
  VALUES (v_req.user_id, v_req.amount_bdt, 'topup', v_req.id,
    format('Top-up approved (bot) · %s · txn %s', v_req.method, v_req.txn_id), v_new_balance);

  UPDATE public.topup_requests
    SET status = 'approved', reviewed_by = v_admin_id, reviewed_at = now(), approved_at = now(),
        admin_note = COALESCE(admin_note, 'Approved via Telegram bot')
    WHERE id = p_request_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Top-up approved',
    format('৳%s added to your balance.', v_req.amount_bdt), v_req.id);

  RETURN jsonb_build_object('ok', true, 'user_id', v_req.user_id, 'amount', v_req.amount_bdt, 'new_balance', v_new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bot_admin_reject_topup(
  p_admin_chat_id bigint,
  p_request_id uuid,
  p_note text DEFAULT 'Rejected via Telegram bot'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_admin_id UUID; v_req RECORD;
BEGIN
  SELECT id INTO v_admin_id FROM public.profiles WHERE telegram_chat_id = p_admin_chat_id;
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  SELECT * INTO v_req FROM public.topup_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already %', v_req.status; END IF;

  UPDATE public.topup_requests
    SET status = 'rejected', admin_note = p_note,
        reviewed_by = v_admin_id, reviewed_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Top-up rejected', p_note, v_req.id);

  RETURN jsonb_build_object('ok', true, 'user_id', v_req.user_id);
END;
$function$;

-- Helper for cron: list approved screenshots older than 6 hours
CREATE OR REPLACE FUNCTION public.list_expired_topup_screenshots()
RETURNS TABLE(id uuid, screenshot_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id, screenshot_url
  FROM public.topup_requests
  WHERE status = 'approved'
    AND screenshot_url IS NOT NULL
    AND approved_at IS NOT NULL
    AND approved_at < (now() - interval '6 hours');
$function$;

CREATE OR REPLACE FUNCTION public.clear_topup_screenshot(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.topup_requests SET screenshot_url = NULL WHERE id = p_id;
$function$;

-- Bot polling state + messages
CREATE TABLE IF NOT EXISTS public.telegram_bot_state (
  id INT PRIMARY KEY CHECK (id = 1),
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;
-- No policies: only service role can access

-- Per-chat conversation state for /deposit flow
CREATE TABLE IF NOT EXISTS public.telegram_bot_sessions (
  chat_id BIGINT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: only service role accesses