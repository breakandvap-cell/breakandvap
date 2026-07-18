-- 1. SKU unique par variante + désactivation + prix dégressif par palier
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quantity_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Unicité globale du SKU (case-insensitive) — permet NULL pour l'existant.
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_unique_idx
  ON public.product_variants (lower(sku)) WHERE sku IS NOT NULL;

-- 2. Snapshot SKU sur les lignes de commande pour la traçabilité comptable.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_sku text;
