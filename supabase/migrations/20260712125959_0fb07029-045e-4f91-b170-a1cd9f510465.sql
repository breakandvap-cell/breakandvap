
CREATE TABLE public.testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  is_featured BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.testimonials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read featured testimonials"
  ON public.testimonials FOR SELECT
  USING (is_featured = true);

CREATE POLICY "Admins manage testimonials"
  ON public.testimonials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER testimonials_set_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.testimonials (author_name, content, rating, sort_order) VALUES
  ('Julie M.', 'Accueil au top à la boutique du Creusot, conseils clairs et livraison rapide de ma commande en ligne. Je recommande !', 5, 1),
  ('Thomas R.', 'Cinq ans que je vape chez Break and Vap. Sélection de e-liquides toujours au poil et les nouveautés CBD sont vraiment de qualité.', 5, 2),
  ('Sophie L.', 'Équipe très pro à Montceau, ils prennent le temps d''expliquer. La commande arrive bien emballée en 48h.', 5, 3);
