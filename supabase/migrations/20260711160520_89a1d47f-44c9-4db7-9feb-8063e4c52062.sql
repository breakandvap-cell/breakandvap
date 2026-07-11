
-- Lever l'exclusivité "un seul booster"
DROP INDEX IF EXISTS public.products_single_nicotine_booster;
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_single_nicotine_booster;

-- 1) Type de nicotine des variantes → text libre
ALTER TABLE public.product_variants
  ALTER COLUMN nicotine_type DROP DEFAULT;
ALTER TABLE public.product_variants
  ALTER COLUMN nicotine_type TYPE text USING nicotine_type::text;
ALTER TABLE public.product_variants
  ALTER COLUMN nicotine_type SET DEFAULT 'normale';
UPDATE public.product_variants
  SET nicotine_type = 'normale'
  WHERE nicotine_type IS NULL OR btrim(nicotine_type) = '';
DROP TYPE IF EXISTS public.nicotine_type;

-- 2) Colonne booster_type sur products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS booster_type text;
COMMENT ON COLUMN public.products.booster_type IS
  'Clé du type de booster (normale, sel, ice, …). Renseigné uniquement quand is_nicotine_booster=true.';
CREATE INDEX IF NOT EXISTS idx_products_booster_type
  ON public.products (booster_type)
  WHERE is_nicotine_booster = true;

-- 3) Migration des boosters existants
UPDATE public.products
  SET booster_type = 'normale'
  WHERE id = 'a2a8b453-45d4-43f4-8d00-66170ad3bb4a';
UPDATE public.products
  SET is_nicotine_booster = true, booster_type = 'sel'
  WHERE id = 'cc051139-b363-4545-96de-f7195a64c436';

-- 4) Brouillon Ice
INSERT INTO public.products (
  slug, name, description, category, price_cents, currency,
  stock, stock_status, is_published, photos,
  is_nicotine_booster, booster_type
)
SELECT
  'booster-nicotine-ice-20mg',
  'Booster Nicotine Ice 20mg',
  'Booster de nicotine effet frais (Ice) 20 mg/ml, 10 ml. Brouillon à compléter (prix, stock, photos).',
  'accessoire_vape', 190, 'EUR',
  0, 'out_of_stock', false, ARRAY[]::text[],
  true, 'ice'
WHERE NOT EXISTS (
  SELECT 1 FROM public.products WHERE slug = 'booster-nicotine-ice-20mg'
);
