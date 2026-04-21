
-- 1. app_settings (singleton-style key/value)
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App settings public read"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins manage app settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value)
VALUES ('default_seller_daily_limit', '500'::jsonb);

-- 2. seller_daily_limits (per-seller override)
CREATE TABLE public.seller_daily_limits (
  seller_id UUID PRIMARY KEY,
  daily_limit INT NOT NULL CHECK (daily_limit >= 0 AND daily_limit <= 100000),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.seller_daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view own limit"
  ON public.seller_daily_limits FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY "Admins view all limits"
  ON public.seller_daily_limits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage limits"
  ON public.seller_daily_limits FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_seller_daily_limits_updated
BEFORE UPDATE ON public.seller_daily_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Helper: count today's uploads for a seller
CREATE OR REPLACE FUNCTION public.get_seller_today_uploaded(_seller_id UUID)
RETURNS INT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::int
  FROM public.accounts
  WHERE seller_id = _seller_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- 4. Helper: get effective daily limit for a seller
CREATE OR REPLACE FUNCTION public.get_seller_daily_limit(_seller_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_default INT;
BEGIN
  SELECT daily_limit INTO v_limit
  FROM public.seller_daily_limits WHERE seller_id = _seller_id;

  IF v_limit IS NOT NULL THEN
    RETURN v_limit;
  END IF;

  SELECT (value)::int INTO v_default
  FROM public.app_settings WHERE key = 'default_seller_daily_limit';

  RETURN COALESCE(v_default, 500);
END;
$$;

-- 5. Drop & recreate seller_upload_accounts with daily-cap enforcement
DROP FUNCTION IF EXISTS public.seller_upload_accounts(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.seller_upload_accounts(p_category_id uuid, p_rows jsonb)
RETURNS jsonb
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
BEGIN
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_seller := public.has_role(v_seller, 'seller') OR public.has_role(v_seller, 'admin');
  IF NOT v_is_seller THEN
    RAISE EXCEPTION 'Only sellers can upload accounts';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Daily cap (admins bypass)
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
$$;

-- 6. Admin: set/clear seller daily limit
CREATE OR REPLACE FUNCTION public.admin_set_seller_limit(
  p_seller_id UUID, p_daily_limit INT, p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_daily_limit < 0 OR p_daily_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;

  INSERT INTO public.seller_daily_limits (seller_id, daily_limit, note, updated_by)
  VALUES (p_seller_id, p_daily_limit, p_note, auth.uid())
  ON CONFLICT (seller_id) DO UPDATE
    SET daily_limit = EXCLUDED.daily_limit,
        note = EXCLUDED.note,
        updated_by = auth.uid(),
        updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_seller_limit(p_seller_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  DELETE FROM public.seller_daily_limits WHERE seller_id = p_seller_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7. Admin: set global default limit
CREATE OR REPLACE FUNCTION public.admin_set_default_daily_limit(p_limit INT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_limit < 0 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_by)
  VALUES ('default_seller_daily_limit', to_jsonb(p_limit), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = to_jsonb(p_limit),
        updated_by = auth.uid(),
        updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 8. Admin: upsert category
CREATE OR REPLACE FUNCTION public.admin_upsert_category(
  p_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_kind category_kind,
  p_price_bdt NUMERIC,
  p_description TEXT,
  p_is_active BOOLEAN,
  p_sort_order INT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name required';
  END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Slug required';
  END IF;
  IF p_price_bdt IS NULL OR p_price_bdt < 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.categories (name, slug, kind, price_bdt, description, is_active, sort_order)
    VALUES (p_name, p_slug, p_kind, p_price_bdt, p_description, COALESCE(p_is_active, true), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.categories
       SET name = p_name,
           slug = p_slug,
           kind = p_kind,
           price_bdt = p_price_bdt,
           description = p_description,
           is_active = COALESCE(p_is_active, is_active),
           sort_order = COALESCE(p_sort_order, sort_order),
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Category not found';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 9. Admin: aggregate stock view via function
CREATE OR REPLACE FUNCTION public.admin_stock_overview()
RETURNS TABLE(
  category_id UUID,
  category_name TEXT,
  price_bdt NUMERIC,
  is_active BOOLEAN,
  available BIGINT,
  sold BIGINT,
  bad BIGINT,
  total BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.price_bdt,
    c.is_active,
    COALESCE(SUM(CASE WHEN a.status = 'available' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN a.status = 'sold' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN a.status = 'bad' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(COUNT(a.id), 0)::bigint
  FROM public.categories c
  LEFT JOIN public.accounts a ON a.category_id = c.id
  WHERE public.has_role(auth.uid(), 'admin')
  GROUP BY c.id, c.name, c.price_bdt, c.is_active, c.sort_order
  ORDER BY c.sort_order ASC, c.name ASC;
$$;

-- 10. Seller: own stock summary
CREATE OR REPLACE FUNCTION public.seller_stock_overview()
RETURNS TABLE(
  category_id UUID,
  category_name TEXT,
  available BIGINT,
  sold BIGINT,
  bad BIGINT,
  total BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    COALESCE(SUM(CASE WHEN a.status = 'available' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN a.status = 'sold' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN a.status = 'bad' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(COUNT(a.id), 0)::bigint
  FROM public.categories c
  LEFT JOIN public.accounts a ON a.category_id = c.id AND a.seller_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
  GROUP BY c.id, c.name, c.sort_order
  ORDER BY c.sort_order ASC, c.name ASC;
$$;
