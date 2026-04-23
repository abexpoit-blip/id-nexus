-- 1) Self-claim admin (only the configured owner email can succeed)
CREATE OR REPLACE FUNCTION public.claim_admin_self()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_owner constant text := 'samexpoit@gmail.com';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF v_email IS NULL OR lower(v_email) <> lower(v_owner) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.log_audit_event(
    'role_self_claim',
    'user_role',
    v_uid,
    'Self-claimed admin role',
    jsonb_build_object('email', v_email)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_admin_self() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin_self() TO authenticated;

-- 2) Mark seller onboarding complete (writes to own profile row only)
CREATE OR REPLACE FUNCTION public.mark_seller_onboarded()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  UPDATE public.profiles
  SET buyer_settings = COALESCE(buyer_settings, '{}'::jsonb)
                       || jsonb_build_object('seller_onboarded_at', to_jsonb(now()))
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_seller_onboarded() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_seller_onboarded() TO authenticated;