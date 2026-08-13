DROP POLICY IF EXISTS "Variants readable for published products" ON public.product_variants;

CREATE POLICY "Public can read active variants of published products"
ON public.product_variants
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.is_published = true
  )
);