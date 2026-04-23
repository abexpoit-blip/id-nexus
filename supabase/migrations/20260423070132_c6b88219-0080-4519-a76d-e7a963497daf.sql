-- 1) Helper RPC: fetch order details + sold accounts for a given order
-- Used by dispatch-notification to send rich delivery messages over Telegram.
CREATE OR REPLACE FUNCTION public.bot_get_order_for_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_cat_name TEXT;
  v_accounts JSONB;
BEGIN
  SELECT o.id, o.buyer_id, o.category_id, o.quantity, o.unit_price_bdt, o.total_bdt,
         o.created_at, o.status, p.balance_bdt, p.telegram_chat_id, p.display_name, p.email
    INTO v_order
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.buyer_id
    WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  SELECT name INTO v_cat_name FROM public.categories WHERE id = v_order.category_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'uid', a.uid,
    'password', a.password,
    'two_fa', a.two_fa,
    'email', a.email,
    'email_password', a.email_password
  ) ORDER BY a.uid), '[]'::jsonb)
  INTO v_accounts
  FROM public.order_items oi
  JOIN public.accounts a ON a.id = oi.account_id
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'buyer_id', v_order.buyer_id,
    'telegram_chat_id', v_order.telegram_chat_id,
    'display_name', v_order.display_name,
    'email', v_order.email,
    'category', v_cat_name,
    'quantity', v_order.quantity,
    'unit_price', v_order.unit_price_bdt,
    'total', v_order.total_bdt,
    'new_balance', v_order.balance_bdt,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'accounts', v_accounts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bot_get_order_for_delivery(uuid) TO service_role;

-- 2) Patch place_order so it fires an "order_placed" notification (which triggers dispatch -> Telegram)
CREATE OR REPLACE FUNCTION public.place_order(p_category_id uuid, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer UUID := auth.uid();
  v_unit_price NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_balance NUMERIC(12,2);
  v_order_id UUID;
  v_locked_ids UUID[];
  v_account RECORD;
  v_cat_name TEXT;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 500 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  SELECT balance_bdt INTO v_balance FROM public.profiles WHERE id = v_buyer FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;

  SELECT price_bdt, name INTO v_unit_price, v_cat_name
    FROM public.categories WHERE id = p_category_id AND is_active = true;
  IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Category not available'; END IF;

  v_total := v_unit_price * p_quantity;
  IF v_balance < v_total THEN RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0001'; END IF;

  SELECT array_agg(id) INTO v_locked_ids
  FROM (
    SELECT id FROM public.accounts
    WHERE category_id = p_category_id AND status = 'available'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_quantity
  ) sub;

  IF v_locked_ids IS NULL OR array_length(v_locked_ids, 1) < p_quantity THEN
    RAISE EXCEPTION 'Not enough stock' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.orders (buyer_id, category_id, quantity, unit_price_bdt, total_bdt, status)
  VALUES (v_buyer, p_category_id, p_quantity, v_unit_price, v_total, 'completed')
  RETURNING id INTO v_order_id;

  FOR v_account IN
    UPDATE public.accounts
       SET status = 'sold', buyer_id = v_buyer, sold_at = now()
     WHERE id = ANY(v_locked_ids)
    RETURNING id, seller_id
  LOOP
    INSERT INTO public.order_items (order_id, account_id, seller_id, unit_price_bdt)
    VALUES (v_order_id, v_account.id, v_account.seller_id, v_unit_price);
  END LOOP;

  UPDATE public.profiles SET balance_bdt = balance_bdt - v_total WHERE id = v_buyer;

  INSERT INTO public.balance_ledger (user_id, amount_bdt, kind, reference_id, note, balance_after)
  VALUES (v_buyer, -v_total, 'purchase', v_order_id,
          format('Order %sx at ৳%s', p_quantity, v_unit_price), v_balance - v_total);

  -- NEW: order_placed notification → triggers dispatch-notification → Telegram delivery
  INSERT INTO public.notifications (user_id, kind, title, body, reference_id)
  VALUES (
    v_buyer, 'order_placed',
    format('Order placed: %s × %s', p_quantity, COALESCE(v_cat_name, 'item')),
    format('Total ৳%s deducted. Delivery in progress.', v_total),
    v_order_id
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'quantity', p_quantity,
    'unit_price', v_unit_price,
    'total', v_total,
    'new_balance', v_balance - v_total
  );
END;
$$;