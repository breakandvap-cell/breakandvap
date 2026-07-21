
-- Passage de la clé d'unicité (produit, contenance) à (produit, contenance, type de nicotine)
ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_product_id_volume_ml_key;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_product_id_volume_ml_type_key
  UNIQUE (product_id, volume_ml, nicotine_type);

-- Duplique chaque variante e-liquide avec boosters (max_boosters > 0)
-- pour offrir les 3 types (normale/sel/ice) au client. On ne recopie que
-- lorsque la combinaison (produit, contenance, type) n'existe pas encore.
INSERT INTO public.product_variants (
  product_id, volume_ml, price_cents, stock, max_nicotine_mg,
  available_nicotine_mg, boosters_per_nicotine, nicotine_type,
  photo_url, max_boosters, sku, is_active, quantity_tiers,
  empty_bottle_product_id
)
SELECT
  v.product_id,
  v.volume_ml,
  v.price_cents,
  v.stock,
  v.max_nicotine_mg,
  v.available_nicotine_mg,
  v.boosters_per_nicotine,
  t.new_type,
  v.photo_url,
  v.max_boosters,
  CASE
    WHEN v.sku IS NULL OR length(v.sku) = 0 THEN NULL
    ELSE v.sku || '-' || upper(t.new_type)
  END,
  v.is_active,
  v.quantity_tiers,
  v.empty_bottle_product_id
FROM public.product_variants v
JOIN public.products p ON p.id = v.product_id
CROSS JOIN (VALUES ('sel'), ('ice')) AS t(new_type)
WHERE p.category = 'e_liquide'
  AND COALESCE(v.max_boosters, 0) > 0
  AND v.is_active = true
  AND lower(coalesce(v.nicotine_type, 'normale')) = 'normale'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants v2
    WHERE v2.product_id = v.product_id
      AND v2.volume_ml = v.volume_ml
      AND lower(coalesce(v2.nicotine_type, 'normale')) = t.new_type
  );
