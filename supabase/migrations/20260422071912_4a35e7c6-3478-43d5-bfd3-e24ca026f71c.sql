-- 1. Buyer settings JSON on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS buyer_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Telegram delivery status enum
DO $$ BEGIN
  CREATE TYPE public.telegram_delivery_status AS ENUM ('pending', 'sending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Per-order delivery tracking
CREATE TABLE IF NOT EXISTS public.telegram_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  status public.telegram_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_buyer ON public.telegram_deliveries(buyer_id, updated_at DESC);

ALTER TABLE public.telegram_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers view own deliveries" ON public.telegram_deliveries;
CREATE POLICY "Buyers view own deliveries"
  ON public.telegram_deliveries FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Buyers insert own deliveries" ON public.telegram_deliveries;
CREATE POLICY "Buyers insert own deliveries"
  ON public.telegram_deliveries FOR INSERT
  TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Buyers update own deliveries" ON public.telegram_deliveries;
CREATE POLICY "Buyers update own deliveries"
  ON public.telegram_deliveries FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all deliveries" ON public.telegram_deliveries;
CREATE POLICY "Admins view all deliveries"
  ON public.telegram_deliveries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_telegram_deliveries_updated_at ON public.telegram_deliveries;
CREATE TRIGGER update_telegram_deliveries_updated_at
  BEFORE UPDATE ON public.telegram_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();