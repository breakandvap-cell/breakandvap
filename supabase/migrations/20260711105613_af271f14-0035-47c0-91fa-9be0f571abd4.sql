
-- 1) New category values
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'accessoire_vape';
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'accessoire_cbd';

-- 2) Product variants table (for e-liquide volume/nicotine)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  max_nicotine_mg INTEGER NOT NULL CHECK (max_nicotine_mg >= 0 AND max_nicotine_mg <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, volume_ml)
);

GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Variants readable by everyone"
  ON public.product_variants FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert variants"
  ON public.product_variants FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update variants"
  ON public.product_variants FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete variants"
  ON public.product_variants FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER product_variants_set_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx
  ON public.product_variants(product_id);
