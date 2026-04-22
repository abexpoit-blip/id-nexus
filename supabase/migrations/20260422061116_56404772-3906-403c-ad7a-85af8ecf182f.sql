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
    -- Find category + UID from original account
    SELECT category_id, uid INTO v_category, v_old_account_uid
      FROM public.accounts WHERE id = v_item.account_id;

    -- Lock a fresh available account in same category whose UID does NOT
    -- collide with any other live (available/sold/replacement_pending) account
    -- — this prevents picking a replacement whose UID is already in active stock
    -- or already owned by another buyer.
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

    -- Defensive double-check: ensure new UID isn't the same as the bad one
    IF v_new_account_uid = v_old_account_uid THEN
      RAISE EXCEPTION 'Replacement UID matches the reported bad UID — refusing to swap';
    END IF;

    -- Defensive: count collisions of new UID among already-sold accounts
    SELECT count(*) INTO v_collision_count
      FROM public.accounts
      WHERE uid = v_new_account_uid
        AND id <> v_new_account_id
        AND status IN ('sold', 'replacement_pending');
    IF v_collision_count > 0 THEN
      RAISE EXCEPTION 'Selected replacement UID % already exists in sold stock — duplicate blocked', v_new_account_uid;
    END IF;

    -- Mark old account as replaced
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
$function$;