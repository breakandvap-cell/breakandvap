DROP POLICY IF EXISTS "Variants readable by everyone" ON public.product_variants;
DROP POLICY IF EXISTS "Product variants readable only for published products" ON public.product_variants;

CREATE POLICY "Variants readable for published products"
ON public.product_variants
FOR SELECT
TO public
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.is_published = true));

CREATE POLICY "Admins read all variants"
ON public.product_variants
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));