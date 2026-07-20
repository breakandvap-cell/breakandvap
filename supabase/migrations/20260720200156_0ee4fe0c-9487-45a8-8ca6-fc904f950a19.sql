ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS empty_bottle_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;