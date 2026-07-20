ALTER TABLE public.order_items
  ALTER COLUMN nicotine_mg TYPE numeric(4,1)
  USING nicotine_mg::numeric;