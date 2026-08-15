ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS custom_mix_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE public.custom_mix_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  brand text NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_nicotine_mg numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.custom_mix_recipes TO anon;
GRANT SELECT ON public.custom_mix_recipes TO authenticated;
GRANT ALL ON public.custom_mix_recipes TO service_role;

ALTER TABLE public.custom_mix_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recettes actives visibles publiquement"
  ON public.custom_mix_recipes FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Les gérants gèrent les recettes"
  ON public.custom_mix_recipes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_custom_mix_recipes_updated_at
  BEFORE UPDATE ON public.custom_mix_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();