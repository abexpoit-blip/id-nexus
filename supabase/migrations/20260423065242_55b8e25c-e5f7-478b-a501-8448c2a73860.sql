
-- Categories list with stock counts (service-role only, callable via RPC)
CREATE OR REPLACE FUNCTION public.bot_get_categories()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  price_bdt numeric,
  available bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.name,
    c.price_bdt,
    COALESCE(SUM(CASE WHEN a.status = 'available' THEN 1 ELSE 0 END), 0)::bigint AS available
  FROM public.categories c
  LEFT JOIN public.accounts a ON a.category_id = c.id
  WHERE c.is_active = true
  GROUP BY c.id, c.slug, c.name, c.price_bdt, c.sort_order
  ORDER BY c.sort_order, c.name;
$$;

-- Profile snapshot for the bot
CREATE OR REPLACE FUNCTION public.bot_get_profile(p_telegram_chat_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_orders bigint;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE telegram_chat_id = p_telegram_chat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'telegram_not_linked';
  END IF;

  SELECT COUNT(*) INTO v_orders FROM public.orders WHERE buyer_id = v_profile.id;

  RETURN jsonb_build_object(
    'user_id', v_profile.id,
    'display_name', v_profile.display_name,
    'email', v_profile.email,
    'balance_bdt', v_profile.balance_bdt,
    'orders_count', v_orders
  );
END;
$$;

-- Buy a single account for a linked Telegram chat
CREATE OR REPLACE FUNCTION public.bot_buy_account(
  p_telegram_chat_id bigint,
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_cat public.categories%ROWTYPE;
  v_account public.accounts%ROWTYPE;
  v_order_id uuid;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_profile FROM public.profiles
    WHERE telegram_chat_id = p_telegram_chat_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'telegram_not_linked';
  END IF;

  IF v_profile.is_banned THEN
    RAISE EXCEPTION 'account_banned';
  END IF;

  SELECT * INTO v_cat FROM public.categories WHERE id = p_category_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found';
  END IF;

  IF v_profile.balance_bdt < v_cat.price_bdt THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  -- Pick one available account and lock it
  SELECT * INTO v_account FROM public.accounts
    WHERE category_id = p_category_id AND status = 'available'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'out_of_stock';
  END IF;

  -- Mark sold
  UPDATE public.accounts
    SET status = 'sold', buyer_id = v_profile.id, sold_at = now(), updated_at = now()
    WHERE id = v_account.id;

  -- Create order
  INSERT INTO public.orders (buyer_id, category_id, quantity, unit_price_bdt, total_bdt, status)
    VALUES (v_profile.id, v_cat.id, 1, v_cat.price_bdt, v_cat.price_bdt, 'completed')
    RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, account_id, seller_id, unit_price_bdt)
    VALUES (v_order_id, v_account.id, v_account.seller_id, v_cat.price_bdt);

  -- Deduct balance
  v_new_balance := v_profile.balance_bdt - v_cat.price_bdt;
  UPDATE public.profiles SET balance_bdt = v_new_balance, updated_at = now()
    WHERE id = v_profile.id;

  INSERT INTO public.balance_ledger (user_id, kind, amount_bdt, balance_after, reference_id, note)
    VALUES (v_profile.id, 'purchase', -v_cat.price_bdt, v_new_balance, v_order_id,
            'Telegram bot purchase: ' || v_cat.name);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'category', v_cat.name,
    'uid', v_account.uid,
    'password', v_account.password,
    'two_fa', v_account.two_fa,
    'email', v_account.email,
    'email_password', v_account.email_password,
    'price', v_cat.price_bdt,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bot_get_categories() TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_get_profile(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_buy_account(bigint, uuid) TO service_role;
