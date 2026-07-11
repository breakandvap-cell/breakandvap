
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS base_price_cents integer,
  ADD COLUMN IF NOT EXISTS boosters_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booster_unit_price_cents integer,
  ADD COLUMN IF NOT EXISTS nicotine_mg integer,
  ADD COLUMN IF NOT EXISTS volume_ml integer,
  ADD COLUMN IF NOT EXISTS flavor text;
