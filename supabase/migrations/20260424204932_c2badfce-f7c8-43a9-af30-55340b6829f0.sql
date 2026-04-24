
-- ============================================================
-- 1. admin_adjust_balance: add/cut money with mandatory reason
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_new_balance NUMERIC(12,2);
  v_old_balance NUMERIC(12,2);
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Amount cannot be zero';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 chars)';
  END IF;

  IF abs(p_amount) > 10000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  SELECT balance_bdt, email, display_name
    INTO v_old_balance, v_user_email, v_user_name
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_old_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_new_balance := v_old_balance + p_amount;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Resulting balance would be negative (current: ৳%, adjustment: ৳%)', v_old_balance, p_amount;
  END IF;

  UPDATE public.profiles SET balance_bdt = v_new_balance, updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.balance_ledger (user_id, amount_bdt, kind, note, balance_after)
  VALUES (p_user_id, p_amount, 'admin_adjustment',
    format('Admin adjustment: %s', trim(p_reason)), v_new_balance);

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (p_user_id, 'system',
    CASE WHEN p_amount > 0 THEN 'Balance added by admin' ELSE 'Balance deducted by admin' END,
    format('৳%s %s. Reason: %s. New balance: ৳%s',
      abs(p_amount),
      CASE WHEN p_amount > 0 THEN 'added to' ELSE 'deducted from' END,
      trim(p_reason), v_new_balance));

  PERFORM public.log_audit_event(
    'admin_balance_adjustment', 'profile', p_user_id,
    format('Admin %s ৳%s for %s: %s',
      CASE WHEN p_amount > 0 THEN 'added' ELSE 'deducted' END,
      abs(p_amount), COALESCE(v_user_name, v_user_email, p_user_id::text), trim(p_reason)),
    jsonb_build_object(
      'user_id', p_user_id,
      'old_balance', v_old_balance,
      'amount', p_amount,
      'new_balance', v_new_balance,
      'reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance,
    'amount', p_amount
  );
END;
$$;

-- ============================================================
-- 2. admin_manage_role: grant or revoke role
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_manage_role(
  p_user_id UUID,
  p_role app_role,
  p_action TEXT  -- 'grant' or 'revoke'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Action must be grant or revoke';
  END IF;

  -- Prevent admin from revoking their own admin role
  IF p_action = 'revoke' AND p_role = 'admin' AND p_user_id = v_admin THEN
    RAISE EXCEPTION 'Cannot revoke your own admin role';
  END IF;

  SELECT email, display_name INTO v_user_email, v_user_name
    FROM public.profiles WHERE id = p_user_id;
  IF v_user_email IS NULL AND v_user_name IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_action = 'grant' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (p_user_id, 'system',
    format('Role %s: %s', p_action || 'ed', p_role),
    format('Your %s role has been %s by an admin.', p_role, p_action || 'ed'));

  PERFORM public.log_audit_event(
    'admin_role_change', 'user_role', p_user_id,
    format('Admin %s %s role for %s', p_action || 'ed', p_role,
      COALESCE(v_user_name, v_user_email, p_user_id::text)),
    jsonb_build_object(
      'user_id', p_user_id,
      'role', p_role,
      'action', p_action
    )
  );

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'role', p_role);
END;
$$;

-- ============================================================
-- 3. admin_overview_stats: dashboard KPIs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_revenue_today NUMERIC;
  v_revenue_7d NUMERIC;
  v_revenue_30d NUMERIC;
  v_pending_topups INT;
  v_pending_withdraws INT;
  v_pending_replacements INT;
  v_total_users INT;
  v_total_sellers INT;
  v_total_admins INT;
  v_today_signups INT;
  v_today_orders INT;
  v_today_order_revenue NUMERIC;
  v_total_balance NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Revenue from completed orders
  SELECT COALESCE(SUM(total_bdt), 0) INTO v_revenue_today
    FROM public.orders
    WHERE status = 'completed'
      AND created_at >= date_trunc('day', now());

  SELECT COALESCE(SUM(total_bdt), 0) INTO v_revenue_7d
    FROM public.orders
    WHERE status = 'completed'
      AND created_at >= now() - interval '7 days';

  SELECT COALESCE(SUM(total_bdt), 0) INTO v_revenue_30d
    FROM public.orders
    WHERE status = 'completed'
      AND created_at >= now() - interval '30 days';

  -- Pending counts
  SELECT count(*) INTO v_pending_topups
    FROM public.topup_requests WHERE status = 'pending';
  SELECT count(*) INTO v_pending_withdraws
    FROM public.withdraw_requests WHERE status = 'pending';
  SELECT count(*) INTO v_pending_replacements
    FROM public.replacement_items WHERE outcome = 'pending';

  -- User counts
  SELECT count(*) INTO v_total_users FROM public.profiles;
  SELECT count(DISTINCT user_id) INTO v_total_sellers
    FROM public.user_roles WHERE role = 'seller';
  SELECT count(DISTINCT user_id) INTO v_total_admins
    FROM public.user_roles WHERE role = 'admin';

  -- Today stats
  SELECT count(*) INTO v_today_signups
    FROM public.profiles WHERE created_at >= date_trunc('day', now());
  SELECT count(*), COALESCE(SUM(total_bdt), 0)
    INTO v_today_orders, v_today_order_revenue
    FROM public.orders
    WHERE created_at >= date_trunc('day', now()) AND status = 'completed';

  -- Total platform balance
  SELECT COALESCE(SUM(balance_bdt), 0) INTO v_total_balance FROM public.profiles;

  RETURN jsonb_build_object(
    'revenue_today', v_revenue_today,
    'revenue_7d', v_revenue_7d,
    'revenue_30d', v_revenue_30d,
    'pending_topups', v_pending_topups,
    'pending_withdraws', v_pending_withdraws,
    'pending_replacements', v_pending_replacements,
    'total_users', v_total_users,
    'total_sellers', v_total_sellers,
    'total_admins', v_total_admins,
    'today_signups', v_today_signups,
    'today_orders', v_today_orders,
    'today_order_revenue', v_today_order_revenue,
    'total_platform_balance', v_total_balance
  );
END;
$$;

-- ============================================================
-- 4. admin_search_users: search users for management
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_search_users(p_query TEXT DEFAULT '')
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  display_name TEXT,
  balance_bdt NUMERIC,
  is_banned BOOLEAN,
  created_at TIMESTAMPTZ,
  roles TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email,
    p.display_name,
    p.balance_bdt,
    p.is_banned,
    p.created_at,
    COALESCE(ARRAY(
      SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id ORDER BY ur.role
    ), ARRAY[]::TEXT[]) AS roles
  FROM public.profiles p
  WHERE p_query = ''
    OR p.email ILIKE '%' || p_query || '%'
    OR p.display_name ILIKE '%' || p_query || '%'
    OR p.id::text ILIKE '%' || p_query || '%'
  ORDER BY p.created_at DESC
  LIMIT 50;
END;
$$;
