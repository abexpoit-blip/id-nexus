CREATE OR REPLACE FUNCTION public.admin_save_brand_credit(
  p_developer_name TEXT,
  p_developer_url TEXT,
  p_parent_brand TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT value INTO v_old FROM public.app_settings WHERE key = 'brand_credit';

  v_new := jsonb_build_object(
    'developer_name', NULLIF(trim(p_developer_name), ''),
    'developer_url',  NULLIF(trim(p_developer_url),  ''),
    'parent_brand',   NULLIF(trim(p_parent_brand),   '')
  );

  INSERT INTO public.app_settings (key, value, updated_by, updated_at)
  VALUES ('brand_credit', v_new, v_uid, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  PERFORM public.log_audit_event(
    'brand_credit_updated',
    'app_settings',
    NULL,
    'Brand credit updated',
    jsonb_build_object('old', COALESCE(v_old, '{}'::jsonb), 'new', v_new)
  );

  RETURN jsonb_build_object('ok', true, 'value', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_brand_credit(TEXT, TEXT, TEXT) TO authenticated;