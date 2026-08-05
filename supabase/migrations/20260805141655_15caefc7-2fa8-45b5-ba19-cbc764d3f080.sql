ALTER FUNCTION public.search_products(text) SET search_path = public;
ALTER FUNCTION public.set_country_of_origin() SET search_path = public;

ALTER VIEW public.products_brand_range_audit SET (security_invoker = on);

ALTER TABLE public.catalogue_produits_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalogue_produits_staging FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_produits_staging TO authenticated;
GRANT ALL ON public.catalogue_produits_staging TO service_role;
CREATE POLICY "Admins can manage staging catalogue"
  ON public.catalogue_produits_staging FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));