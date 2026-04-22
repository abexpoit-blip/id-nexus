
CREATE OR REPLACE FUNCTION public.admin_replace_with_category(
  p_item_id uuid,
  p_category_id uuid,
  p_reason text DEFAULT NULL,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_item RECORD;
  v_new_account_id UUID;
  v_new_account_uid TEXT;
  v_cat_name TEXT;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_item FROM public.replacement_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_item.outcome <> 'pending' THEN RAISE EXCEPTION 'Item already resolved'; END IF;

  SELECT name INTO v_cat_name FROM public.categories WHERE id = p_category_id AND is_active = true;
  IF v_cat_name IS NULL THEN RAISE EXCEPTION 'Category not found or inactive'; END IF;

  -- Pick oldest available from specified category
  SELECT a.id, a.uid INTO v_new_account_id, v_new_account_uid
    FROM public.accounts a
    WHERE a.category_id = p_category_id
      AND a.status = 'available'
      AND a.id IS DISTINCT FROM v_item.account_id
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts b
         WHERE b.uid = a.uid AND b.id <> a.id
           AND b.status IN ('sold', 'replacement_pending', 'replaced')
      )
    ORDER BY a.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

  IF v_new_account_id IS NULL THEN
    RAISE EXCEPTION 'No available stock in category "%"', v_cat_name;
  END IF;

  -- Mark old account as replaced (if exists)
  IF v_item.account_id IS NOT NULL THEN
    UPDATE public.accounts SET status = 'replaced' WHERE id = v_item.account_id;
  END IF;

  -- Assign new account to buyer
  UPDATE public.accounts
    SET status = 'sold', buyer_id = v_item.buyer_id, sold_at = now()
    WHERE id = v_new_account_id;

  -- Resolve the replacement item
  UPDATE public.replacement_items
    SET outcome = 'replaced',
        replacement_account_id = v_new_account_id,
        outcome_reason = COALESCE(p_reason, format('Replaced with %s ID', v_cat_name)),
        resolved_at = now(),
        resolved_by = v_admin
    WHERE id = p_item_id;

  -- Notify buyer
  INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
  VALUES (v_item.buyer_id, 'id_replaced',
    'ID replaced',
    COALESCE(p_message, format('Your reported UID %s has been replaced with a fresh %s ID.', v_item.reported_uid, v_cat_name)),
    v_item.request_id);

  -- Notify seller if exists
  IF v_item.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
    VALUES (v_item.seller_id, 'id_marked_bad',
      'One of your IDs was replaced',
      format('UID %s was marked bad and replaced with %s. Reason: %s',
        v_item.reported_uid, v_cat_name, COALESCE(p_reason, 'buyer reported')),
      v_item.request_id);
  END IF;

  -- Audit
  PERFORM public.log_audit_event(
    'replacement_approved', 'replacement_item', p_item_id,
    format('Replaced UID %s with %s ID (cross-category)', v_item.reported_uid, v_cat_name),
    jsonb_build_object(
      'action', 'replace_with_category',
      'reported_uid', v_item.reported_uid,
      'old_account_id', v_item.account_id,
      'new_account_id', v_new_account_id,
      'target_category', p_category_id,
      'target_category_name', v_cat_name,
      'buyer_id', v_item.buyer_id,
      'seller_id', v_item.seller_id,
      'reason', p_reason,
      'message', p_message
    )
  );

  RETURN jsonb_build_object('ok', true, 'action', 'replaced', 'new_account_uid', v_new_account_uid, 'category', v_cat_name);
END;
$$;
