
CREATE OR REPLACE FUNCTION public.get_public_stock_counts()
RETURNS TABLE (category_id UUID, available BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.category_id, count(*)::bigint AS available
  FROM public.accounts a
  JOIN public.categories c ON c.id = a.category_id
  WHERE a.status = 'available' AND c.is_active = true
  GROUP BY a.category_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_stock_counts() TO anon, authenticated;
