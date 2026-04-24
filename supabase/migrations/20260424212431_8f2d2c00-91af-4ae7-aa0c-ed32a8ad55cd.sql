-- Replace broad public SELECT with name-prefixed read so listing is not exposed.
DROP POLICY IF EXISTS "Public read vpn logos" ON storage.objects;

-- Allow public read only of files under "brands/" path; admins can still see all.
CREATE POLICY "Public read vpn logo files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'vpn-logos'
    AND (storage.foldername(name))[1] = 'brands'
  );

CREATE POLICY "Admins read all vpn logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vpn-logos' AND public.has_role(auth.uid(), 'admin'));