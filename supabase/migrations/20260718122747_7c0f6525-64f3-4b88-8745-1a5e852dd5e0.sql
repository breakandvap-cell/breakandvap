
-- Table site_settings : configuration globale du site.
-- Une seule ligne, forcée par une contrainte CHECK (singleton = TRUE).
CREATE TABLE public.site_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
  booster_volume_ml NUMERIC(5,2) NOT NULL DEFAULT 10,
  booster_concentration_mg_per_ml NUMERIC(6,2) NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton_true CHECK (singleton = TRUE),
  CONSTRAINT site_settings_booster_volume_positive CHECK (booster_volume_ml > 0),
  CONSTRAINT site_settings_booster_concentration_positive CHECK (booster_concentration_mg_per_ml > 0)
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Lecture publique : c'est un paramètre d'affichage (dosage booster).
CREATE POLICY "site_settings public read"
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- Seuls les admins peuvent créer / modifier.
CREATE POLICY "site_settings admin write"
  ON public.site_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at (fonction déjà existante).
CREATE TRIGGER site_settings_set_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Seed initial : 10 ml @ 20 mg/ml = 200 mg / booster.
INSERT INTO public.site_settings (singleton, booster_volume_ml, booster_concentration_mg_per_ml)
VALUES (TRUE, 10, 20)
ON CONFLICT (singleton) DO NOTHING;
