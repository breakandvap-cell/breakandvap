ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS flavors jsonb NOT NULL DEFAULT '[]'::jsonb;