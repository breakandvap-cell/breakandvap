
DO $$ BEGIN
  CREATE TYPE public.nicotine_type AS ENUM ('normale', 'sel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS nicotine_type public.nicotine_type NOT NULL DEFAULT 'normale';
