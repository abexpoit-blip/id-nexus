
CREATE OR REPLACE FUNCTION public.bot_admin_replace_with_category(
  p_admin_chat_id bigint,
  p_item_id uuid,
  p_category_slug text,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id UUID;
  v_cat_id UUID;
  v_item RECORD;
  v_new_account_id UUID;
  v_new_account_uid TEXT;
  v_cat_name TEXT;
BEGIN
  SELECT id INTO v_admin_id FROM public.profiles WHERE telegram_chat_id = p_admin_chat_id;
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;

  SELECT id, name INTO v_cat_id, v_cat_name
    FROM public.categories
    WHERE slug = lower(trim(p_category_slug)) AND is_active = true;
  IF v_cat_id IS NULL THEN
    RAISE EXCEPTION 'Category slug "%" not found', p_category_slug;
  END IF;

  SELECT * INTO v_item FROM public.replacement_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_item.outcome <> 'pending' THEN RAISE EXCEPTION 'Item already resolved'; END IF;

  SELECT a.id, a.uid INTO v_new_account_id, v_new_account_uid
    FROM public.accounts a
    WHERE a.category_id = v_cat_id
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

  IF v_item.account_id IS NOT NULL THEN
    UPDATE public.accounts SET status = 'replaced' WHERE id = v_item.account_id;
  END IF;

  UPDATE public.accounts
    SET status = 'sold', buyer_id = v_item.buyer_id, sold_at = now()
    WHERE id = v_new_account_id;

  UPDATE public.replacement_items
    SET outcome = 'replaced',
        replacement_account_id = v_new_account_id,
        outcome_reason = format('Bot: replaced with %s ID', v_cat_name),
        resolved_at = now(),
        resolved_by = v_admin_id
    WHERE id = p_item_id;

  INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
  VALUES (v_item.buyer_id, 'id_replaced',
    'ID replaced',
    COALESCE(p_message, format('Your reported UID %s has been replaced with a fresh %s ID.', v_item.reported_uid, v_cat_name)),
    v_item.request_id);

  IF v_item.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
    VALUES (v_item.seller_id, 'id_marked_bad',
      'One of your IDs was replaced',
      format('UID %s was replaced with %s by admin (via Telegram).', v_item.reported_uid, v_cat_name),
      v_item.request_id);
  END IF;

  PERFORM public.log_audit_event(
    'replacement_approved', 'replacement_item', p_item_id,
    format('Bot: Replaced UID %s with %s ID', v_item.reported_uid, v_cat_name),
    jsonb_build_object('action', 'bot_replace_with_category', 'reported_uid', v_item.reported_uid,
      'new_account_id', v_new_account_id, 'category', v_cat_name)
  );

  RETURN jsonb_build_object('ok', true, 'new_uid', v_new_account_uid, 'category', v_cat_name);
END;
$$;
