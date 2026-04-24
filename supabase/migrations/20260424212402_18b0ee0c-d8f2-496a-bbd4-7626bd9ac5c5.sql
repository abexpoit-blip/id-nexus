INSERT INTO storage.buckets (id, name, public)
VALUES ('vpn-logos', 'vpn-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read vpn logos" ON storage.objects;
CREATE POLICY "Public read vpn logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vpn-logos');

DROP POLICY IF EXISTS "Admins upload vpn logos" ON storage.objects;
CREATE POLICY "Admins upload vpn logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vpn-logos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update vpn logos" ON storage.objects;
CREATE POLICY "Admins update vpn logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vpn-logos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete vpn logos" ON storage.objects;
CREATE POLICY "Admins delete vpn logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vpn-logos' AND public.has_role(auth.uid(), 'admin'));