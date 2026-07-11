
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS available_nicotine_mg integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS boosters_per_nicotine jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.product_variants
  ALTER COLUMN max_nicotine_mg DROP NOT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_nicotine_booster boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS products_single_nicotine_booster
  ON public.products ((is_nicotine_booster)) WHERE is_nicotine_booster = true;
