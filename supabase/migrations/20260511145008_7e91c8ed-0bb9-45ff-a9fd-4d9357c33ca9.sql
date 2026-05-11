DO $$ BEGIN
  CREATE TYPE notice_audience AS ENUM ('all','buyer','seller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notice_severity AS ENUM ('info','warning','success');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience notice_audience NOT NULL DEFAULT 'all',
  severity notice_severity NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notices_active ON public.notices(audience, is_active, created_at DESC);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notices" ON public.notices
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read active notices for them" ON public.notices
  FOR SELECT TO authenticated USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      audience = 'all'
      OR (audience = 'seller' AND has_role(auth.uid(), 'seller'))
      OR (audience = 'buyer'  AND NOT has_role(auth.uid(), 'seller'))
    )
  );