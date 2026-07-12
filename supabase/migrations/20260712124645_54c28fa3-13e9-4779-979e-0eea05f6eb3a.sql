
-- Categories principales de la boutique
CREATE TABLE public.shop_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_categories TO anon, authenticated;
GRANT ALL ON public.shop_categories TO service_role, authenticated;
ALTER TABLE public.shop_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read categories"
  ON public.shop_categories FOR SELECT
  USING (true);
CREATE POLICY "Admin insert categories"
  ON public.shop_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update categories"
  ON public.shop_categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete categories"
  ON public.shop_categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_shop_categories_updated_at
  BEFORE UPDATE ON public.shop_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sous-categories
CREATE TABLE public.shop_subcategories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.shop_categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);
GRANT SELECT ON public.shop_subcategories TO anon, authenticated;
GRANT ALL ON public.shop_subcategories TO service_role, authenticated;
ALTER TABLE public.shop_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read subcategories"
  ON public.shop_subcategories FOR SELECT
  USING (true);
CREATE POLICY "Admin insert subcategories"
  ON public.shop_subcategories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update subcategories"
  ON public.shop_subcategories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete subcategories"
  ON public.shop_subcategories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_shop_subcategories_updated_at
  BEFORE UPDATE ON public.shop_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed initial (idempotent grâce au ON CONFLICT sur `key`)
INSERT INTO public.shop_categories (key, name, description, sort_order) VALUES
  ('cbd', 'CBD', 'Fleurs, résines et gammes premium sélectionnées avec soin.', 1),
  ('e_liquide', 'E-liquides', 'Recettes françaises, tous formats et boosters de nicotine.', 2),
  ('accessoire_vape', 'Accessoires Vape', 'Cigarettes électroniques, résistances, batteries et flacons.', 3),
  ('accessoire_cbd', 'Accessoires CBD', 'Tout le nécessaire pour profiter pleinement de vos produits CBD.', 4)
ON CONFLICT (key) DO NOTHING;

-- Sous-categories initiales
DO $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM public.shop_categories WHERE key = 'e_liquide';
  IF cid IS NOT NULL THEN
    INSERT INTO public.shop_subcategories (category_id, slug, name, description, sort_order) VALUES
      (cid, 'frais-glace', 'Frais & Glacé', 'Menthol vif, fraîcheur polaire, notes glacées.', 1),
      (cid, 'fruite-exotique', 'Fruité & Exotique', 'Mangue, passion, ananas et voyages solaires.', 2),
      (cid, 'gourmand', 'Gourmand', 'Vanille, caramel, biscuit et desserts réconfortants.', 3),
      (cid, 'classique', 'Classique', 'Recettes tabac authentiques pour un vapotage sobre.', 4)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;

  SELECT id INTO cid FROM public.shop_categories WHERE key = 'cbd';
  IF cid IS NOT NULL THEN
    INSERT INTO public.shop_subcategories (category_id, slug, name, description, sort_order) VALUES
      (cid, 'accessoire', 'Accessoire', 'Papier, grinders et petits accessoires liés au CBD.', 1),
      (cid, 'cbd', 'CBD', 'Notre sélection CBD standard, fleurs et résines maison.', 2),
      (cid, 'venom', 'Venom', 'Gamme Venom : profils typés et intensités marquées.', 3),
      (cid, 'amazon', 'Amazon', 'Gamme Amazon : notes vertes et fraîcheur végétale.', 4)
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;
END$$;
