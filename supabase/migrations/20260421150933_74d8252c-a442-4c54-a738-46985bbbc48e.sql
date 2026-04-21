
-- ENUMS
CREATE TYPE public.account_status AS ENUM ('available', 'sold', 'replacement_pending', 'replaced', 'bad', 'withheld');
CREATE TYPE public.order_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE public.ledger_kind AS ENUM ('topup', 'purchase', 'refund', 'withdraw', 'admin_adjustment', 'seller_payout');
CREATE TYPE public.category_kind AS ENUM ('fb_account', 'vpn');

-- CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind public.category_kind NOT NULL DEFAULT 'fb_account',
  description TEXT,
  price_bdt NUMERIC(12,2) NOT NULL CHECK (price_bdt >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anyone (logged in or not) can browse active categories
CREATE POLICY "Active categories are public"
ON public.categories FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins manage categories"
ON public.categories FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ACCOUNTS (FB ID inventory)
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  two_fa TEXT,
  email TEXT,
  email_password TEXT,
  extra JSONB,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.account_status NOT NULL DEFAULT 'available',
  buyer_id UUID REFERENCES auth.users(id),
  sold_at TIMESTAMPTZ,
  cost_bdt NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_accounts_category_status ON public.accounts (category_id, status);
CREATE INDEX idx_accounts_seller ON public.accounts (seller_id);
CREATE INDEX idx_accounts_buyer ON public.accounts (buyer_id) WHERE buyer_id IS NOT NULL;

CREATE TRIGGER update_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sellers see only their own; buyers see ones they bought; admins see all
CREATE POLICY "Sellers view own accounts"
ON public.accounts FOR SELECT
TO authenticated
USING (seller_id = auth.uid());

CREATE POLICY "Buyers view their purchased accounts"
ON public.accounts FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

CREATE POLICY "Admins view all accounts"
ON public.accounts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage accounts"
ON public.accounts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_bdt NUMERIC(12,2) NOT NULL CHECK (unit_price_bdt >= 0),
  total_bdt NUMERIC(12,2) NOT NULL CHECK (total_bdt >= 0),
  status public.order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_orders_buyer ON public.orders (buyer_id, created_at DESC);

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Buyers view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

CREATE POLICY "Admins view all orders"
ON public.orders FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  unit_price_bdt NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_items_order ON public.order_items (order_id);
CREATE INDEX idx_order_items_seller ON public.order_items (seller_id);

CREATE POLICY "Buyers view own order items"
ON public.order_items FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid()));

CREATE POLICY "Sellers view items of their accounts"
ON public.order_items FOR SELECT
TO authenticated
USING (seller_id = auth.uid());

CREATE POLICY "Admins view all order items"
ON public.order_items FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- BALANCE LEDGER (immutable)
CREATE TABLE public.balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_bdt NUMERIC(12,2) NOT NULL,
  kind public.ledger_kind NOT NULL,
  reference_id UUID,
  note TEXT,
  balance_after NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.balance_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ledger_user ON public.balance_ledger (user_id, created_at DESC);

CREATE POLICY "Users view own ledger"
ON public.balance_ledger FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins view all ledger"
ON public.balance_ledger FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- FUNCTION: seller_upload_accounts (dedupe + bulk insert)
-- =========================================
CREATE OR REPLACE FUNCTION public.seller_upload_accounts(
  p_category_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller UUID := auth.uid();
  v_is_seller BOOLEAN;
  v_inserted INT := 0;
  v_duplicates TEXT[] := ARRAY[]::TEXT[];
  v_invalid TEXT[] := ARRAY[]::TEXT[];
  v_row JSONB;
  v_uid TEXT;
  v_password TEXT;
  v_2fa TEXT;
  v_email TEXT;
  v_email_password TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_total INT := 0;
BEGIN
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must be seller or admin
  v_is_seller := public.has_role(v_seller, 'seller') OR public.has_role(v_seller, 'admin');
  IF NOT v_is_seller THEN
    RAISE EXCEPTION 'Only sellers can upload accounts';
  END IF;

  -- Category must exist & be active
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_total := v_total + 1;
    v_uid := trim(both FROM coalesce(v_row->>'uid', ''));
    v_password := coalesce(v_row->>'password', '');
    v_2fa := nullif(coalesce(v_row->>'two_fa', ''), '');
    v_email := nullif(coalesce(v_row->>'email', ''), '');
    v_email_password := nullif(coalesce(v_row->>'email_password', ''), '');

    -- Validate
    IF v_uid = '' OR v_password = '' OR length(v_uid) > 64 OR length(v_password) > 256 THEN
      v_invalid := array_append(v_invalid, v_uid);
      CONTINUE;
    END IF;

    -- In-batch dedupe
    IF v_uid = ANY(v_seen) THEN
      v_duplicates := array_append(v_duplicates, v_uid);
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_uid);

    -- Global dedupe
    IF EXISTS (SELECT 1 FROM public.accounts WHERE uid = v_uid) THEN
      v_duplicates := array_append(v_duplicates, v_uid);
      CONTINUE;
    END IF;

    INSERT INTO public.accounts (uid, password, two_fa, email, email_password, category_id, seller_id, status)
    VALUES (v_uid, v_password, v_2fa, v_email, v_email_password, p_category_id, v_seller, 'available');

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'inserted', v_inserted,
    'duplicates', to_jsonb(v_duplicates),
    'duplicate_count', array_length(v_duplicates, 1),
    'invalid', to_jsonb(v_invalid),
    'invalid_count', array_length(v_invalid, 1)
  );
END;
$$;

-- =========================================
-- FUNCTION: place_order (atomic buy)
-- =========================================
CREATE OR REPLACE FUNCTION public.place_order(
  p_category_id UUID,
  p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer UUID := auth.uid();
  v_unit_price NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_balance NUMERIC(12,2);
  v_available INT;
  v_order_id UUID;
  v_locked_ids UUID[];
  v_account RECORD;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 500 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  -- Lock buyer profile row to serialize purchases
  SELECT balance_bdt INTO v_balance
  FROM public.profiles
  WHERE id = v_buyer
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile missing';
  END IF;

  -- Get current price
  SELECT price_bdt INTO v_unit_price
  FROM public.categories
  WHERE id = p_category_id AND is_active = true;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'Category not available';
  END IF;

  v_total := v_unit_price * p_quantity;

  IF v_balance < v_total THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0001';
  END IF;

  -- Lock & pick accounts atomically
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

  -- Create order
  INSERT INTO public.orders (buyer_id, category_id, quantity, unit_price_bdt, total_bdt, status)
  VALUES (v_buyer, p_category_id, p_quantity, v_unit_price, v_total, 'completed')
  RETURNING id INTO v_order_id;

  -- Mark accounts as sold + insert order items
  FOR v_account IN
    UPDATE public.accounts
       SET status = 'sold', buyer_id = v_buyer, sold_at = now()
     WHERE id = ANY(v_locked_ids)
    RETURNING id, seller_id
  LOOP
    INSERT INTO public.order_items (order_id, account_id, seller_id, unit_price_bdt)
    VALUES (v_order_id, v_account.id, v_account.seller_id, v_unit_price);
  END LOOP;

  -- Deduct balance
  UPDATE public.profiles
     SET balance_bdt = balance_bdt - v_total
   WHERE id = v_buyer;

  -- Ledger row
  INSERT INTO public.balance_ledger (user_id, amount_bdt, kind, reference_id, note, balance_after)
  VALUES (v_buyer, -v_total, 'purchase', v_order_id, format('Order %sx at ৳%s', p_quantity, v_unit_price), v_balance - v_total);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'quantity', p_quantity,
    'unit_price', v_unit_price,
    'total', v_total,
    'new_balance', v_balance - v_total
  );
END;
$$;

-- Seed two FB ID categories for live testing
INSERT INTO public.categories (slug, name, kind, description, price_bdt, sort_order)
VALUES
  ('fb-61xxx', 'FB ID — 61xxx', 'fb_account', 'Standard ad accounts (61xxx series).', 120.00, 10),
  ('fb-1000xxx', 'FB ID — 1000xxx', 'fb_account', 'Premium agency-approved IDs (1000xxx series).', 180.00, 20);
