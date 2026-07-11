CREATE POLICY "Product variants readable only for published products"
ON public.product_variants
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.is_published = true
  )
);
