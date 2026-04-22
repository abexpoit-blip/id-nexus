
CREATE TABLE public.seller_upload_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  category_id UUID,
  category_name TEXT,
  file_name TEXT,
  rows_in_file INTEGER NOT NULL DEFAULT 0,
  rows_sent INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  duplicates_in_stock INTEGER NOT NULL DEFAULT 0,
  duplicates_in_file INTEGER NOT NULL DEFAULT 0,
  duplicates_already_replaced INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  over_limit_skipped INTEGER NOT NULL DEFAULT 0,
  skip_duplicates_setting BOOLEAN NOT NULL DEFAULT true,
  server_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_seller_upload_audits_seller_created
  ON public.seller_upload_audits (seller_id, created_at DESC);

ALTER TABLE public.seller_upload_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view own audits"
ON public.seller_upload_audits
FOR SELECT
TO authenticated
USING (seller_id = auth.uid());

CREATE POLICY "Sellers insert own audits"
ON public.seller_upload_audits
FOR INSERT
TO authenticated
WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Admins view all audits"
ON public.seller_upload_audits
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
