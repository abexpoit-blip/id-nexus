
-- 1) Audit logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  actor_email TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs (event_type);
CREATE INDEX idx_audit_logs_actor_id ON public.audit_logs (actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No direct INSERT/UPDATE/DELETE from clients; only via SECURITY DEFINER triggers/functions

-- 2) Internal helper to insert a log row (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_summary TEXT,
  p_details JSONB DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  END IF;
  INSERT INTO public.audit_logs (actor_id, actor_email, event_type, entity_type, entity_id, summary, details)
  VALUES (v_actor, v_email, p_event_type, p_entity_type, p_entity_id, p_summary, p_details);
END;
$$;

-- 3) Trigger: log price/active changes on categories
CREATE OR REPLACE FUNCTION public.trg_audit_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event(
      'category_created', 'category', NEW.id,
      format('Category "%s" created at ৳%s', NEW.name, NEW.price_bdt),
      jsonb_build_object('name', NEW.name, 'slug', NEW.slug, 'price_bdt', NEW.price_bdt, 'is_active', NEW.is_active)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.price_bdt IS DISTINCT FROM OLD.price_bdt THEN
      PERFORM public.log_audit_event(
        'price_change', 'category', NEW.id,
        format('Price for "%s" changed: ৳%s → ৳%s', NEW.name, OLD.price_bdt, NEW.price_bdt),
        jsonb_build_object('name', NEW.name, 'old_price', OLD.price_bdt, 'new_price', NEW.price_bdt)
      );
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      PERFORM public.log_audit_event(
        'category_toggled', 'category', NEW.id,
        format('Category "%s" %s', NEW.name, CASE WHEN NEW.is_active THEN 'activated' ELSE 'deactivated' END),
        jsonb_build_object('name', NEW.name, 'is_active', NEW.is_active)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_categories_changes
AFTER INSERT OR UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_categories();

-- 4) Patch seller_upload_accounts to log stock uploads
CREATE OR REPLACE FUNCTION public.seller_upload_accounts(p_category_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seller UUID := auth.uid();
  v_is_seller BOOLEAN;
  v_inserted INT := 0;
  v_duplicates TEXT[] := ARRAY[]::TEXT[];
  v_invalid TEXT[] := ARRAY[]::TEXT[];
  v_over_limit INT := 0;
  v_row JSONB;
  v_uid TEXT;
  v_password TEXT;
  v_2fa TEXT;
  v_email TEXT;
  v_email_password TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_total INT := 0;
  v_daily_limit INT;
  v_already_today INT;
  v_remaining INT;
  v_cat_name TEXT;
BEGIN
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_seller := public.has_role(v_seller, 'seller') OR public.has_role(v_seller, 'admin');
  IF NOT v_is_seller THEN
    RAISE EXCEPTION 'Only sellers can upload accounts';
  END IF;

  SELECT name INTO v_cat_name FROM public.categories WHERE id = p_category_id AND is_active = true;
  IF v_cat_name IS NULL THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  IF public.has_role(v_seller, 'admin') THEN
    v_remaining := 1000000;
  ELSE
    v_daily_limit := public.get_seller_daily_limit(v_seller);
    v_already_today := public.get_seller_today_uploaded(v_seller);
    v_remaining := GREATEST(v_daily_limit - v_already_today, 0);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_total := v_total + 1;
    v_uid := trim(both FROM coalesce(v_row->>'uid', ''));
    v_password := coalesce(v_row->>'password', '');
    v_2fa := nullif(coalesce(v_row->>'two_fa', ''), '');
    v_email := nullif(coalesce(v_row->>'email', ''), '');
    v_email_password := nullif(coalesce(v_row->>'email_password', ''), '');

    IF v_uid = '' OR v_password = '' OR length(v_uid) > 64 OR length(v_password) > 256 THEN
      v_invalid := array_append(v_invalid, v_uid);
      CONTINUE;
    END IF;

    IF v_uid = ANY(v_seen) THEN
      v_duplicates := array_append(v_duplicates, v_uid);
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_uid);

    IF EXISTS (SELECT 1 FROM public.accounts WHERE uid = v_uid) THEN
      v_duplicates := array_append(v_duplicates, v_uid);
      CONTINUE;
    END IF;

    IF v_inserted >= v_remaining THEN
      v_over_limit := v_over_limit + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.accounts (uid, password, two_fa, email, email_password, category_id, seller_id, status)
    VALUES (v_uid, v_password, v_2fa, v_email, v_email_password, p_category_id, v_seller, 'available');

    v_inserted := v_inserted + 1;
  END LOOP;

  -- Log stock upload event
  IF v_inserted > 0 THEN
    PERFORM public.log_audit_event(
      'stock_upload', 'category', p_category_id,
      format('Seller uploaded %s IDs to "%s" (%s submitted)', v_inserted, v_cat_name, v_total),
      jsonb_build_object(
        'category_name', v_cat_name,
        'submitted', v_total,
        'inserted', v_inserted,
        'duplicates', COALESCE(array_length(v_duplicates,1),0),
        'invalid', COALESCE(array_length(v_invalid,1),0),
        'over_limit_skipped', v_over_limit
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'inserted', v_inserted,
    'duplicates', to_jsonb(v_duplicates),
    'duplicate_count', COALESCE(array_length(v_duplicates, 1), 0),
    'invalid', to_jsonb(v_invalid),
    'invalid_count', COALESCE(array_length(v_invalid, 1), 0),
    'over_limit_skipped', v_over_limit,
    'daily_limit', v_daily_limit,
    'already_today', v_already_today,
    'remaining_after', GREATEST(v_remaining - v_inserted, 0)
  );
END;
$function$;

-- 5) Patch admin_resolve_replacement_item to log
CREATE OR REPLACE FUNCTION public.admin_resolve_replacement_item(p_item_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin UUID := auth.uid();
  v_item RECORD;
  v_new_account_id UUID;
  v_new_account_uid TEXT;
  v_old_account_uid TEXT;
  v_unit_price NUMERIC(12,2);
  v_buyer_balance NUMERIC(12,2);
  v_category UUID;
  v_collision_count INT;
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
    SELECT category_id, uid INTO v_category, v_old_account_uid
      FROM public.accounts WHERE id = v_item.account_id;

    SELECT a.id, a.uid INTO v_new_account_id, v_new_account_uid
      FROM public.accounts a
      WHERE a.category_id = v_category
        AND a.status = 'available'
        AND a.id <> v_item.account_id
        AND NOT EXISTS (
          SELECT 1 FROM public.accounts b
           WHERE b.uid = a.uid
             AND b.id <> a.id
             AND b.status IN ('sold', 'replacement_pending', 'replaced')
        )
      ORDER BY a.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

    IF v_new_account_id IS NULL THEN
      RAISE EXCEPTION 'No replacement stock available in this category (or all available rows have UID collisions)';
    END IF;

    IF v_new_account_uid = v_old_account_uid THEN
      RAISE EXCEPTION 'Replacement UID matches the reported bad UID — refusing to swap';
    END IF;

    SELECT count(*) INTO v_collision_count
      FROM public.accounts
      WHERE uid = v_new_account_uid
        AND id <> v_new_account_id
        AND status IN ('sold', 'replacement_pending');
    IF v_collision_count > 0 THEN
      RAISE EXCEPTION 'Selected replacement UID % already exists in sold stock — duplicate blocked', v_new_account_uid;
    END IF;

    UPDATE public.accounts SET status = 'replaced' WHERE id = v_item.account_id;

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

    PERFORM public.log_audit_event(
      'replacement_approved', 'replacement_item', p_item_id,
      format('Replaced UID %s with fresh ID', v_item.reported_uid),
      jsonb_build_object('action', 'replace', 'reported_uid', v_item.reported_uid,
        'old_account_id', v_item.account_id, 'new_account_id', v_new_account_id,
        'buyer_id', v_item.buyer_id, 'seller_id', v_item.seller_id, 'reason', p_reason)
    );

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

    PERFORM public.log_audit_event(
      'replacement_approved', 'replacement_item', p_item_id,
      format('Refunded ৳%s for UID %s', v_unit_price, v_item.reported_uid),
      jsonb_build_object('action', 'refund', 'reported_uid', v_item.reported_uid,
        'amount', v_unit_price, 'buyer_id', v_item.buyer_id, 'seller_id', v_item.seller_id, 'reason', p_reason)
    );

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

    PERFORM public.log_audit_event(
      'replacement_approved', 'replacement_item', p_item_id,
      format('Rejected replacement for UID %s', v_item.reported_uid),
      jsonb_build_object('action', 'reject', 'reported_uid', v_item.reported_uid,
        'buyer_id', v_item.buyer_id, 'reason', p_reason)
    );
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action);
END;
$function$;
