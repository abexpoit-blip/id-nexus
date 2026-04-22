-- Enums
CREATE TYPE public.payment_method AS ENUM ('bkash', 'nagad');
CREATE TYPE public.topup_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.withdraw_status AS ENUM ('pending', 'approved', 'paid', 'rejected');

-- Topup requests
CREATE TABLE public.topup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount_bdt NUMERIC(12,2) NOT NULL CHECK (amount_bdt > 0),
  method public.payment_method NOT NULL,
  sender_number TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  note TEXT,
  status public.topup_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_topup_user ON public.topup_requests(user_id, created_at DESC);
CREATE INDEX idx_topup_status ON public.topup_requests(status);
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own topups" ON public.topup_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all topups" ON public.topup_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage topups" ON public.topup_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_topup_updated BEFORE UPDATE ON public.topup_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Withdraw requests
CREATE TABLE public.withdraw_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount_bdt NUMERIC(12,2) NOT NULL CHECK (amount_bdt > 0),
  method public.payment_method NOT NULL,
  receiver_number TEXT NOT NULL,
  note TEXT,
  status public.withdraw_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  payout_txn_id TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wd_user ON public.withdraw_requests(user_id, created_at DESC);
CREATE INDEX idx_wd_status ON public.withdraw_requests(status);
ALTER TABLE public.withdraw_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own withdraws" ON public.withdraw_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all withdraws" ON public.withdraw_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage withdraws" ON public.withdraw_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_wd_updated BEFORE UPDATE ON public.withdraw_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Submit topup
CREATE OR REPLACE FUNCTION public.submit_topup_request(p_amount NUMERIC, p_method public.payment_method, p_sender_number TEXT, p_txn_id TEXT, p_note TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount < 50 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Amount must be between 50 and 1,000,000'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 5 THEN RAISE EXCEPTION 'Sender number required'; END IF;
  IF p_txn_id IS NULL OR length(trim(p_txn_id)) < 4 THEN RAISE EXCEPTION 'Transaction ID required'; END IF;
  INSERT INTO public.topup_requests(user_id, amount_bdt, method, sender_number, txn_id, note)
  VALUES (v_uid, p_amount, p_method, trim(p_sender_number), trim(p_txn_id), p_note)
  RETURNING id INTO v_id;
  -- Notify all admins
  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  SELECT ur.user_id, 'system', 'New top-up request',
    format('৳%s via %s · txn %s', p_amount, p_method, p_txn_id), v_id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

-- Approve topup
CREATE OR REPLACE FUNCTION public.admin_approve_topup(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  UPDATE public.topup_requests SET status = 'approved', admin_note = p_note,
    reviewed_by = v_admin, reviewed_at = now() WHERE id = p_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Top-up approved',
    format('৳%s added to your balance.', v_req.amount_bdt), v_req.id);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END; $$;

-- Reject topup
CREATE OR REPLACE FUNCTION public.admin_reject_topup(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID := auth.uid(); v_req RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_req FROM public.topup_requests WHERE id = p_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already %', v_req.status; END IF;
  UPDATE public.topup_requests SET status = 'rejected', admin_note = p_note,
    reviewed_by = v_admin, reviewed_at = now() WHERE id = p_id;
  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Top-up rejected',
    COALESCE(p_note, 'Your top-up request was rejected.'), v_req.id);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- Submit withdraw
CREATE OR REPLACE FUNCTION public.submit_withdraw_request(p_amount NUMERIC, p_method public.payment_method, p_receiver_number TEXT, p_note TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_id UUID; v_balance NUMERIC(12,2); v_pending NUMERIC(12,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid, 'seller') OR public.has_role(v_uid, 'admin')) THEN
    RAISE EXCEPTION 'Sellers only';
  END IF;
  IF p_amount IS NULL OR p_amount < 100 THEN RAISE EXCEPTION 'Minimum withdraw is 100'; END IF;
  IF p_receiver_number IS NULL OR length(trim(p_receiver_number)) < 5 THEN RAISE EXCEPTION 'Receiver number required'; END IF;

  SELECT balance_bdt INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  SELECT COALESCE(SUM(amount_bdt), 0) INTO v_pending FROM public.withdraw_requests
    WHERE user_id = v_uid AND status IN ('pending', 'approved');
  IF (v_balance - v_pending) < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance (balance %, pending %)', v_balance, v_pending;
  END IF;

  INSERT INTO public.withdraw_requests(user_id, amount_bdt, method, receiver_number, note)
  VALUES (v_uid, p_amount, p_method, trim(p_receiver_number), p_note) RETURNING id INTO v_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  SELECT ur.user_id, 'system', 'New withdraw request',
    format('৳%s to %s (%s)', p_amount, trim(p_receiver_number), p_method), v_id
  FROM public.user_roles ur WHERE ur.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

-- Admin pay withdraw (deduct + mark paid)
CREATE OR REPLACE FUNCTION public.admin_pay_withdraw(p_id UUID, p_payout_txn TEXT, p_note TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID := auth.uid(); v_req RECORD; v_new_balance NUMERIC(12,2);
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_req FROM public.withdraw_requests WHERE id = p_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'Already %', v_req.status; END IF;
  IF p_payout_txn IS NULL OR length(trim(p_payout_txn)) < 3 THEN RAISE EXCEPTION 'Payout txn id required'; END IF;

  UPDATE public.profiles SET balance_bdt = balance_bdt - v_req.amount_bdt
    WHERE id = v_req.user_id RETURNING balance_bdt INTO v_new_balance;
  IF v_new_balance < 0 THEN RAISE EXCEPTION 'Negative balance not allowed'; END IF;

  INSERT INTO public.balance_ledger(user_id, amount_bdt, kind, reference_id, note, balance_after)
  VALUES (v_req.user_id, -v_req.amount_bdt, 'withdraw', v_req.id,
    format('Withdraw paid · %s · payout %s', v_req.method, trim(p_payout_txn)), v_new_balance);

  UPDATE public.withdraw_requests SET status = 'paid', payout_txn_id = trim(p_payout_txn),
    admin_note = p_note, reviewed_by = v_admin, reviewed_at = now() WHERE id = p_id;

  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Withdraw paid',
    format('৳%s paid via %s · txn %s', v_req.amount_bdt, v_req.method, trim(p_payout_txn)), v_req.id);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END; $$;

-- Admin reject withdraw
CREATE OR REPLACE FUNCTION public.admin_reject_withdraw(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID := auth.uid(); v_req RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_req FROM public.withdraw_requests WHERE id = p_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'Already %', v_req.status; END IF;
  UPDATE public.withdraw_requests SET status = 'rejected', admin_note = p_note,
    reviewed_by = v_admin, reviewed_at = now() WHERE id = p_id;
  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_req.user_id, 'system', 'Withdraw rejected',
    COALESCE(p_note, 'Your withdraw request was rejected.'), v_req.id);
  RETURN jsonb_build_object('ok', true);
END; $$;