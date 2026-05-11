
-- Tighten notices RLS: force RLS and ensure anon cannot read or write
ALTER TABLE public.notices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notices FROM anon;
REVOKE ALL ON public.notices FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;

-- Drop any legacy/dead policies if they exist (no-ops if absent)
DROP POLICY IF EXISTS "Public can read notices" ON public.notices;
DROP POLICY IF EXISTS "Anyone can read notices" ON public.notices;
DROP POLICY IF EXISTS "notices_select_all" ON public.notices;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.notices;

-- Recreate canonical policies (idempotent)
DROP POLICY IF EXISTS "Admins manage notices" ON public.notices;
CREATE POLICY "Admins manage notices"
ON public.notices
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated can read active notices for them" ON public.notices;
CREATE POLICY "Authenticated read active notices for audience"
ON public.notices
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    audience = 'all'::public.notice_audience
    OR (audience = 'seller'::public.notice_audience AND public.has_role(auth.uid(), 'seller'::public.app_role))
    OR (audience = 'buyer'::public.notice_audience AND NOT public.has_role(auth.uid(), 'seller'::public.app_role))
  )
);
