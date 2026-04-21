
-- ============ ENUMS ============
CREATE TYPE public.replacement_status AS ENUM ('pending', 'processing', 'resolved', 'rejected');
CREATE TYPE public.replacement_item_outcome AS ENUM ('pending', 'replaced', 'refunded', 'rejected', 'out_of_window', 'not_yours');
CREATE TYPE public.notification_kind AS ENUM (
  'replacement_filed',
  'id_replaced',
  'id_refunded',
  'id_rejected',
  'id_marked_bad',
  'order_placed',
  'stock_low',
  'system'
);

-- ============ REPLACEMENT REQUESTS ============
CREATE TABLE public.replacement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL,
  raw_input TEXT NOT NULL,
  parsed_uid_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  status public.replacement_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replacement_requests_buyer ON public.replacement_requests(buyer_id, created_at DESC);
CREATE INDEX idx_replacement_requests_status ON public.replacement_requests(status);

ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own replacement requests"
  ON public.replacement_requests FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Admins view all replacement requests"
  ON public.replacement_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage replacement requests"
  ON public.replacement_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ REPLACEMENT ITEMS ============
CREATE TABLE public.replacement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.replacement_requests(id) ON DELETE CASCADE,
  reported_uid TEXT NOT NULL,
  account_id UUID,
  order_id UUID,
  seller_id UUID,
  buyer_id UUID NOT NULL,
  in_window BOOLEAN NOT NULL DEFAULT false,
  window_hours INT,
  outcome public.replacement_item_outcome NOT NULL DEFAULT 'pending',
  outcome_reason TEXT,
  replacement_account_id UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replacement_items_request ON public.replacement_items(request_id);
CREATE INDEX idx_replacement_items_seller ON public.replacement_items(seller_id);
CREATE INDEX idx_replacement_items_buyer ON public.replacement_items(buyer_id);
CREATE INDEX idx_replacement_items_outcome ON public.replacement_items(outcome);

ALTER TABLE public.replacement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own replacement items"
  ON public.replacement_items FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Sellers view their replacement items"
  ON public.replacement_items FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY "Admins view all replacement items"
  ON public.replacement_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage replacement items"
  ON public.replacement_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind public.notification_kind NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  reference_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_all ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view all notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.replacement_items;

-- ============ PROFILES: add telegram_username for seller signup ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_username TEXT UNIQUE;

-- ============ updated_at trigger ============
CREATE TRIGGER update_replacement_requests_updated_at
  BEFORE UPDATE ON public.replacement_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FUNCTION: submit_replacement_request ============
CREATE OR REPLACE FUNCTION public.submit_replacement_request(p_raw_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer UUID := auth.uid();
  v_request_id UUID;
  v_token TEXT;
  v_uids TEXT[] := ARRAY[]::TEXT[];
  v_uid TEXT;
  v_matched INT := 0;
  v_account RECORD;
  v_order RECORD;
  v_window_hours INT;
  v_in_window BOOLEAN;
  v_outcome public.replacement_item_outcome;
  v_seller_notify_set UUID[] := ARRAY[]::UUID[];
  v_seller_id UUID;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_raw_input IS NULL OR length(trim(p_raw_input)) = 0 THEN
    RAISE EXCEPTION 'Empty input';
  END IF;

  IF length(p_raw_input) > 100000 THEN
    RAISE EXCEPTION 'Input too large';
  END IF;

  -- Parse: extract numeric tokens >= 5 digits as UID candidates
  FOR v_token IN
    SELECT DISTINCT m[1]
    FROM regexp_matches(p_raw_input, '(\d{5,})', 'g') AS m
  LOOP
    v_uids := array_append(v_uids, v_token);
  END LOOP;

  IF array_length(v_uids, 1) IS NULL THEN
    RAISE EXCEPTION 'No UIDs detected in input';
  END IF;

  -- Create request
  INSERT INTO public.replacement_requests (buyer_id, raw_input, parsed_uid_count)
  VALUES (v_buyer, p_raw_input, array_length(v_uids, 1))
  RETURNING id INTO v_request_id;

  -- For each UID, try to match against buyer's purchased accounts
  FOREACH v_uid IN ARRAY v_uids LOOP
    SELECT a.id, a.seller_id, oi.order_id
      INTO v_account
      FROM public.accounts a
      LEFT JOIN public.order_items oi ON oi.account_id = a.id
      WHERE a.uid = v_uid AND a.buyer_id = v_buyer
      LIMIT 1;

    IF v_account.id IS NULL THEN
      INSERT INTO public.replacement_items
        (request_id, reported_uid, buyer_id, outcome, outcome_reason, in_window)
      VALUES
        (v_request_id, v_uid, v_buyer, 'not_yours', 'UID not found in your purchases', false);
      CONTINUE;
    END IF;

    -- Get the order to determine window
    SELECT id, quantity, created_at INTO v_order
      FROM public.orders
      WHERE id = v_account.order_id AND buyer_id = v_buyer;

    IF v_order.id IS NULL THEN
      INSERT INTO public.replacement_items
        (request_id, reported_uid, account_id, seller_id, buyer_id, outcome, outcome_reason, in_window)
      VALUES
        (v_request_id, v_uid, v_account.id, v_account.seller_id, v_buyer, 'not_yours', 'Order not found', false);
      CONTINUE;
    END IF;

    -- Window rule: 2h if qty <= 10 else 6h
    v_window_hours := CASE WHEN v_order.quantity <= 10 THEN 2 ELSE 6 END;
    v_in_window := (now() - v_order.created_at) <= make_interval(hours => v_window_hours);
    v_outcome := CASE WHEN v_in_window THEN 'pending' ELSE 'out_of_window' END;

    INSERT INTO public.replacement_items
      (request_id, reported_uid, account_id, order_id, seller_id, buyer_id,
       in_window, window_hours, outcome, outcome_reason)
    VALUES
      (v_request_id, v_uid, v_account.id, v_order.id, v_account.seller_id, v_buyer,
       v_in_window, v_window_hours, v_outcome,
       CASE WHEN v_in_window THEN NULL ELSE format('Reported %s hours after purchase (window %sh)',
         round(extract(epoch FROM (now() - v_order.created_at))/3600, 1), v_window_hours) END);

    v_matched := v_matched + 1;

    -- Track seller for notification
    IF v_in_window AND v_account.seller_id IS NOT NULL
       AND NOT (v_account.seller_id = ANY(v_seller_notify_set)) THEN
      v_seller_notify_set := array_append(v_seller_notify_set, v_account.seller_id);
    END IF;
  END LOOP;

  UPDATE public.replacement_requests
    SET matched_count = v_matched,
        status = CASE WHEN v_matched > 0 THEN 'processing' ELSE 'rejected' END
    WHERE id = v_request_id;

  -- Notify sellers in-app
  FOREACH v_seller_id IN ARRAY v_seller_notify_set LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
    VALUES (
      v_seller_id,
      'replacement_filed',
      'New replacement request',
      format('A buyer reported issues with %s of your IDs. Check seller dashboard.',
        (SELECT count(*) FROM public.replacement_items
         WHERE request_id = v_request_id AND seller_id = v_seller_id AND in_window)),
      v_request_id
    );
  END LOOP;

  -- Notify all admins
  INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
  SELECT ur.user_id, 'replacement_filed', 'New replacement request',
    format('Buyer filed %s UIDs (%s matched, %s in window)',
      array_length(v_uids,1), v_matched,
      (SELECT count(*) FROM public.replacement_items WHERE request_id = v_request_id AND in_window)),
    v_request_id
  FROM public.user_roles ur WHERE ur.role = 'admin';

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'parsed', array_length(v_uids,1),
    'matched', v_matched,
    'sellers_notified', array_length(v_seller_notify_set, 1)
  );
END;
$$;

-- ============ FUNCTION: admin_resolve_replacement_item ============
CREATE OR REPLACE FUNCTION public.admin_resolve_replacement_item(
  p_item_id UUID,
  p_action TEXT,        -- 'replace' | 'refund' | 'reject'
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_item RECORD;
  v_new_account_id UUID;
  v_unit_price NUMERIC(12,2);
  v_buyer_balance NUMERIC(12,2);
  v_category UUID;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_item FROM public.replacement_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  IF v_item.outcome NOT IN ('pending') THEN
    RAISE EXCEPTION 'Item already resolved';
  END IF;

  IF p_action = 'replace' THEN
    -- Find category from original account
    SELECT category_id INTO v_category FROM public.accounts WHERE id = v_item.account_id;

    -- Lock a fresh available account in same category
    SELECT id INTO v_new_account_id
      FROM public.accounts
      WHERE category_id = v_category AND status = 'available'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

    IF v_new_account_id IS NULL THEN
      RAISE EXCEPTION 'No replacement stock available in this category';
    END IF;

    -- Mark old account as bad/replaced
    UPDATE public.accounts SET status = 'replaced' WHERE id = v_item.account_id;

    -- Mark new account as sold to buyer
    UPDATE public.accounts
      SET status = 'sold', buyer_id = v_item.buyer_id, sold_at = now()
      WHERE id = v_new_account_id;

    UPDATE public.replacement_items
      SET outcome = 'replaced',
          replacement_account_id = v_new_account_id,
          outcome_reason = COALESCE(p_reason, 'Replaced with fresh ID'),
          resolved_at = now(),
          resolved_by = v_admin
      WHERE id = p_item_id;

    INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
    VALUES (v_item.buyer_id, 'id_replaced', 'ID replaced',
      format('Your reported UID %s has been replaced with a fresh ID.', v_item.reported_uid),
      v_item.request_id);

    IF v_item.seller_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
      VALUES (v_item.seller_id, 'id_marked_bad', 'One of your IDs was replaced',
        format('UID %s was marked bad and replaced. Reason: %s',
          v_item.reported_uid, COALESCE(p_reason, 'buyer reported')),
        v_item.request_id);
    END IF;

  ELSIF p_action = 'refund' THEN
    SELECT unit_price_bdt INTO v_unit_price
      FROM public.order_items WHERE account_id = v_item.account_id LIMIT 1;
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Original price not found';
    END IF;

    UPDATE public.profiles SET balance_bdt = balance_bdt + v_unit_price
      WHERE id = v_item.buyer_id
      RETURNING balance_bdt INTO v_buyer_balance;

    INSERT INTO public.balance_ledger (user_id, amount_bdt, kind, reference_id, note, balance_after)
    VALUES (v_item.buyer_id, v_unit_price, 'refund', v_item.request_id,
      format('Refund for bad UID %s', v_item.reported_uid), v_buyer_balance);

    UPDATE public.accounts SET status = 'bad' WHERE id = v_item.account_id;

    UPDATE public.replacement_items
      SET outcome = 'refunded',
          outcome_reason = COALESCE(p_reason, 'Refunded to buyer balance'),
          resolved_at = now(), resolved_by = v_admin
      WHERE id = p_item_id;

    INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
    VALUES (v_item.buyer_id, 'id_refunded', 'Refund issued',
      format('৳%s refunded for UID %s.', v_unit_price, v_item.reported_uid),
      v_item.request_id);

    IF v_item.seller_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
      VALUES (v_item.seller_id, 'id_marked_bad', 'One of your IDs was refunded',
        format('UID %s was refunded to buyer. Reason: %s',
          v_item.reported_uid, COALESCE(p_reason, 'buyer reported')),
        v_item.request_id);
    END IF;

  ELSIF p_action = 'reject' THEN
    UPDATE public.replacement_items
      SET outcome = 'rejected',
          outcome_reason = COALESCE(p_reason, 'Rejected by admin'),
          resolved_at = now(), resolved_by = v_admin
      WHERE id = p_item_id;

    INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
    VALUES (v_item.buyer_id, 'id_rejected', 'Replacement rejected',
      format('Your report for UID %s was rejected. %s',
        v_item.reported_uid, COALESCE(p_reason, '')),
      v_item.request_id);
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action);
END;
$$;

-- ============ FUNCTION: seller_signup_with_telegram (called by edge fn) ============
CREATE OR REPLACE FUNCTION public.assign_seller_role_by_telegram(
  p_user_id UUID,
  p_telegram_username TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Save telegram username on profile
  UPDATE public.profiles
    SET telegram_username = p_telegram_username
    WHERE id = p_user_id;

  -- Upgrade buyer -> seller
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'buyer';
  INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'seller')
    ON CONFLICT DO NOTHING;
END;
$$;
