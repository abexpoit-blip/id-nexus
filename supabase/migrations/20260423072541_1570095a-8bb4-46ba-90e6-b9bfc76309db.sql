-- 1. Add 'binance' to payment_method enum
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'binance';

-- 2. Seed default payment_accounts and min_deposit settings (idempotent)
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'payment_accounts',
  jsonb_build_object(
    'bkash',   jsonb_build_object('number', '01971814603', 'label', 'Bkash (Send Money only)', 'note', 'পারসোনাল নম্বর — শুধু সেন্ড মানি করবেন'),
    'nagad',   jsonb_build_object('number', '01971814603', 'label', 'Nagad (Send Money only)', 'note', 'পারসোনাল নম্বর — শুধু সেন্ড মানি করবেন'),
    'binance', jsonb_build_object('number', '488586141',   'label', 'Binance Pay ID',          'note', 'Binance ID দিয়ে USDT পাঠান')
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'min_deposit',
  jsonb_build_object('bkash', 10, 'nagad', 10, 'binance', 120),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 3. Admin RPC to save payment accounts + min deposits
CREATE OR REPLACE FUNCTION public.admin_save_payment_accounts(
  p_accounts JSONB,
  p_min_deposit JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_old_accounts JSONB;
  v_old_min JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT value INTO v_old_accounts FROM public.app_settings WHERE key = 'payment_accounts';
  SELECT value INTO v_old_min      FROM public.app_settings WHERE key = 'min_deposit';

  INSERT INTO public.app_settings (key, value, updated_by, updated_at)
  VALUES ('payment_accounts', p_accounts, v_uid, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  INSERT INTO public.app_settings (key, value, updated_by, updated_at)
  VALUES ('min_deposit', p_min_deposit, v_uid, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  PERFORM public.log_audit_event(
    'payment_accounts_updated', 'app_settings', NULL,
    'Payment accounts / min deposits updated',
    jsonb_build_object(
      'old_accounts', COALESCE(v_old_accounts, '{}'::jsonb),
      'new_accounts', p_accounts,
      'old_min', COALESCE(v_old_min, '{}'::jsonb),
      'new_min', p_min_deposit
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_payment_accounts(JSONB, JSONB) TO authenticated;

-- 4. Helper: get min deposit for a method (defaults if missing)
CREATE OR REPLACE FUNCTION public.get_min_deposit(p_method public.payment_method)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_settings JSONB; v_val NUMERIC;
BEGIN
  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'min_deposit';
  IF v_settings IS NULL THEN
    RETURN CASE p_method WHEN 'binance' THEN 120 ELSE 10 END;
  END IF;
  v_val := (v_settings->>p_method::text)::numeric;
  IF v_val IS NULL THEN
    RETURN CASE p_method WHEN 'binance' THEN 120 ELSE 10 END;
  END IF;
  RETURN v_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_min_deposit(public.payment_method) TO authenticated, anon;