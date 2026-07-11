
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS booster_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empty_bottle_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_booster_product_id ON public.products(booster_product_id);
CREATE INDEX IF NOT EXISTS idx_products_empty_bottle_product_id ON public.products(empty_bottle_product_id);
