-- VPN brands table (groups categories by brand for display)
CREATE TABLE IF NOT EXISTS public.vpn_brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add brand link + duration to categories (nullable; only used by VPN kind)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS brand_id      UUID REFERENCES public.vpn_brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_categories_brand_id ON public.categories(brand_id);
CREATE INDEX IF NOT EXISTS idx_vpn_brands_active ON public.vpn_brands(is_active, sort_order);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_vpn_brands_updated_at ON public.vpn_brands;
CREATE TRIGGER trg_vpn_brands_updated_at
  BEFORE UPDATE ON public.vpn_brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.vpn_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active brands public read" ON public.vpn_brands;
CREATE POLICY "Active brands public read"
  ON public.vpn_brands FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage brands" ON public.vpn_brands;
CREATE POLICY "Admins manage brands"
  ON public.vpn_brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed 4 brands (idempotent via slug unique)
INSERT INTO public.vpn_brands (name, slug, description, sort_order)
VALUES
  ('NordVPN',    'nordvpn',    'Industry-leading VPN with double encryption.', 10),
  ('ExpressVPN', 'expressvpn', 'Fastest VPN with TrustedServer technology.',   20),
  ('Surfshark',  'surfshark',  'Unlimited devices, CleanWeb ad-blocker.',      30),
  ('ProtonVPN',  'protonvpn',  'Swiss-based, privacy-first VPN.',              40)
ON CONFLICT (slug) DO NOTHING;

-- Link existing seeded VPN categories to their brands (for previously seeded "NordVPN", "ExpressVPN" etc.)
UPDATE public.categories c
SET brand_id = b.id
FROM public.vpn_brands b
WHERE c.kind = 'vpn'
  AND c.brand_id IS NULL
  AND lower(c.slug) = lower(b.slug);

-- Admin RPC: upsert brand
CREATE OR REPLACE FUNCTION public.admin_upsert_vpn_brand(
  p_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_logo_url TEXT,
  p_description TEXT,
  p_is_active BOOLEAN,
  p_sort_order INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Name required'; END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN RAISE EXCEPTION 'Slug required'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.vpn_brands (name, slug, logo_url, description, is_active, sort_order)
    VALUES (p_name, lower(trim(p_slug)), p_logo_url, p_description,
            COALESCE(p_is_active, true), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.vpn_brands
       SET name = p_name,
           slug = lower(trim(p_slug)),
           logo_url = p_logo_url,
           description = p_description,
           is_active = COALESCE(p_is_active, is_active),
           sort_order = COALESCE(p_sort_order, sort_order),
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_vpn_brand(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  -- categories linked to this brand will have brand_id set NULL by FK
  DELETE FROM public.vpn_brands WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Extend admin_upsert_category to accept brand_id + duration_days
CREATE OR REPLACE FUNCTION public.admin_upsert_category(
  p_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_kind category_kind,
  p_price_bdt NUMERIC,
  p_description TEXT,
  p_is_active BOOLEAN,
  p_sort_order INTEGER,
  p_brand_id UUID DEFAULT NULL,
  p_duration_days INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Name required'; END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN RAISE EXCEPTION 'Slug required'; END IF;
  IF p_price_bdt IS NULL OR p_price_bdt < 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.categories
      (name, slug, kind, price_bdt, description, is_active, sort_order, brand_id, duration_days)
    VALUES
      (p_name, p_slug, p_kind, p_price_bdt, p_description,
       COALESCE(p_is_active, true), COALESCE(p_sort_order, 0), p_brand_id, p_duration_days)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.categories
       SET name = p_name,
           slug = p_slug,
           kind = p_kind,
           price_bdt = p_price_bdt,
           description = p_description,
           is_active = COALESCE(p_is_active, is_active),
           sort_order = COALESCE(p_sort_order, sort_order),
           brand_id = p_brand_id,
           duration_days = p_duration_days,
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;