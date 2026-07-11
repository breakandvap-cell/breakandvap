-- 1) Colonnes additionnelles sur les variantes.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS max_boosters integer;

-- 2) Corriger la contrainte de cohérence des catégories : elle ne connaissait
--    plus les nouvelles valeurs de l'enum (accessoire_vape / accessoire_cbd).
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_fields;
ALTER TABLE public.products ADD CONSTRAINT products_category_fields CHECK (
  (category = 'cbd' AND nicotine_mg IS NULL)
  OR (category = 'e_liquide' AND cbd_percent IS NULL AND thc_percent IS NULL)
  OR (category IN ('accessoire','accessoire_vape','accessoire_cbd')
      AND nicotine_mg IS NULL AND cbd_percent IS NULL AND thc_percent IS NULL)
);

-- 3) Seed du "Flacon vide 200 ml" utilisé comme alternative dans la fiche produit.
INSERT INTO public.products (
  name, slug, category, description,
  price_cents, currency, stock, stock_status, is_published, photos
)
SELECT
  'Flacon vide 200 ml', 'flacon-vide-200ml', 'accessoire_vape',
  'Flacon vide 200 ml pour diluer votre e-liquide avec des boosters de nicotine supplémentaires.',
  190, 'EUR', 100, 'in_stock', true, ARRAY[]::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.products WHERE slug = 'flacon-vide-200ml'
);
