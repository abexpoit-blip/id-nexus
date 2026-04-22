CREATE TYPE public.seller_application_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.seller_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  telegram_username TEXT,
  reason TEXT,
  status public.seller_application_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicant views own application" ON public.seller_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Applicant creates own application" ON public.seller_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view all applications" ON public.seller_applications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage applications" ON public.seller_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_seller_applications_updated
BEFORE UPDATE ON public.seller_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.submit_seller_application(p_telegram_username TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_uid UUID := auth.uid(); v_email TEXT; v_name TEXT; v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_telegram_username IS NULL OR length(trim(p_telegram_username)) < 3 THEN
    RAISE EXCEPTION 'Telegram username required';
  END IF;
  SELECT email, display_name INTO v_email, v_name FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.seller_applications (user_id, email, display_name, telegram_username, reason)
  VALUES (v_uid, v_email, v_name, trim(p_telegram_username), p_reason)
  ON CONFLICT (user_id) DO UPDATE
    SET telegram_username = EXCLUDED.telegram_username,
        reason = EXCLUDED.reason,
        status = CASE WHEN seller_applications.status = 'rejected' THEN 'pending'::seller_application_status
                      ELSE seller_applications.status END,
        updated_at = now()
  RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  SELECT ur.user_id, 'system', 'New seller application',
    format('%s (@%s) wants to become a seller', COALESCE(v_name, v_email), trim(p_telegram_username)), v_id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$func$;

CREATE OR REPLACE FUNCTION public.admin_approve_seller_application(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_admin UUID := auth.uid(); v_app RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_app FROM public.seller_applications WHERE id = p_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'Already %', v_app.status; END IF;
  UPDATE public.profiles SET telegram_username = v_app.telegram_username WHERE id = v_app.user_id;
  DELETE FROM public.user_roles WHERE user_id = v_app.user_id AND role = 'buyer';
  INSERT INTO public.user_roles (user_id, role) VALUES (v_app.user_id, 'seller') ON CONFLICT DO NOTHING;
  UPDATE public.seller_applications
    SET status = 'approved', reviewed_by = v_admin, reviewed_at = now(), admin_note = p_note
    WHERE id = p_id;
  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_app.user_id, 'system', 'Seller application approved',
    'You can now access the Seller Dashboard. Welcome aboard!', p_id);
  RETURN jsonb_build_object('ok', true);
END;
$func$;

CREATE OR REPLACE FUNCTION public.admin_reject_seller_application(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_admin UUID := auth.uid(); v_app RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_app FROM public.seller_applications WHERE id = p_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'Already %', v_app.status; END IF;
  UPDATE public.seller_applications
    SET status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), admin_note = p_note
    WHERE id = p_id;
  INSERT INTO public.notifications(user_id, kind, title, body, reference_id)
  VALUES (v_app.user_id, 'system', 'Seller application rejected',
    COALESCE(p_note, 'Your seller application was rejected. You can re-apply later.'), p_id);
  RETURN jsonb_build_object('ok', true);
END;
$func$;

CREATE OR REPLACE FUNCTION public.get_my_seller_application()
RETURNS public.seller_applications LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $func$
  SELECT * FROM public.seller_applications WHERE user_id = auth.uid() LIMIT 1;
$func$;