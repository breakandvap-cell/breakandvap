-- Références booster globales (une seule fois pour tout le site).
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS default_booster_normale_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_booster_sel_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_booster_ice_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- Auto-population : pour chaque type, prend le premier booster publié
-- correspondant (ordre : par date de création). Ne change rien si la valeur
-- est déjà renseignée.
UPDATE public.site_settings s
SET default_booster_normale_id = (
  SELECT id FROM public.products
   WHERE is_nicotine_booster = true
     AND lower(coalesce(booster_type, 'normale')) = 'normale'
     AND is_published = true
   ORDER BY created_at ASC LIMIT 1
)
WHERE s.singleton = true AND s.default_booster_normale_id IS NULL;

UPDATE public.site_settings s
SET default_booster_sel_id = (
  SELECT id FROM public.products
   WHERE is_nicotine_booster = true
     AND lower(coalesce(booster_type, '')) = 'sel'
     AND is_published = true
   ORDER BY created_at ASC LIMIT 1
)
WHERE s.singleton = true AND s.default_booster_sel_id IS NULL;

UPDATE public.site_settings s
SET default_booster_ice_id = (
  SELECT id FROM public.products
   WHERE is_nicotine_booster = true
     AND lower(coalesce(booster_type, '')) = 'ice'
     AND is_published = true
   ORDER BY created_at ASC LIMIT 1
)
WHERE s.singleton = true AND s.default_booster_ice_id IS NULL;

-- Ajoute la policy manquante côté anon (lecture publique déjà en place ; on
-- s'assure que les nouveaux champs sont bien accessibles). Rien à faire si la
-- policy `TO anon` existe déjà — elle porte sur toutes les colonnes.

-- Migration silencieuse : sur les e-liquides, nettoie les références par
-- variante qui pointaient vers un flacon vide encore présent au catalogue
-- (le système sait maintenant piocher automatiquement dans la liste globale).
-- On conserve uniquement les références qui pointent vers un produit inexistant
-- ou non publié afin de ne rien casser (théoriquement aucune).
UPDATE public.product_variants pv
SET empty_bottle_product_id = NULL
FROM public.products p
WHERE pv.empty_bottle_product_id = p.id
  AND p.category = 'accessoire_vape'
  AND coalesce(p.is_published, false) = true
  AND coalesce(p.volume_ml, 0) > 0;

-- Idem pour le repli au niveau produit.
UPDATE public.products e
SET empty_bottle_product_id = NULL
FROM public.products p
WHERE e.empty_bottle_product_id = p.id
  AND e.category = 'e_liquide'
  AND p.category = 'accessoire_vape'
  AND coalesce(p.is_published, false) = true
  AND coalesce(p.volume_ml, 0) > 0;