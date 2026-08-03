CREATE TABLE public.gammes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  marque text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX gammes_marque_nom_key ON public.gammes (lower(marque), lower(nom));

GRANT SELECT ON public.gammes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gammes TO authenticated;
GRANT ALL ON public.gammes TO service_role;

ALTER TABLE public.gammes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gammes are viewable by everyone"
  ON public.gammes FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert gammes"
  ON public.gammes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update gammes"
  ON public.gammes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete gammes"
  ON public.gammes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER gammes_set_updated_at
  BEFORE UPDATE ON public.gammes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products
  ADD COLUMN gamme_id uuid REFERENCES public.gammes(id) ON DELETE SET NULL;

CREATE INDEX products_gamme_id_idx ON public.products (gamme_id);

INSERT INTO public.gammes (nom, marque)
SELECT DISTINCT ON (lower(btrim(brand)), lower(btrim(product_range)))
       btrim(product_range), btrim(brand)
FROM public.products
WHERE btrim(COALESCE(product_range, '')) <> ''
  AND btrim(COALESCE(brand, '')) <> '';

UPDATE public.products p
SET gamme_id = g.id
FROM public.gammes g
WHERE lower(btrim(COALESCE(p.product_range, ''))) = lower(g.nom)
  AND lower(btrim(COALESCE(p.brand, ''))) = lower(g.marque);