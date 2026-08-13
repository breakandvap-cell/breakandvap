CREATE TYPE public.custom_mix_status AS ENUM ('draft', 'validated', 'added_to_cart', 'ordered');

CREATE TABLE public.custom_mixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  bottle_product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  nicotine_mg integer NOT NULL DEFAULT 0 CHECK (nicotine_mg >= 0 AND nicotine_mg <= 10),
  status public.custom_mix_status NOT NULL DEFAULT 'draft',
  price_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_mixes_owner_present CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_mixes TO authenticated;
GRANT ALL ON public.custom_mixes TO service_role;

ALTER TABLE public.custom_mixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own mixes"
  ON public.custom_mixes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all mixes"
  ON public.custom_mixes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.custom_mix_flavors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_mix_id uuid NOT NULL REFERENCES public.custom_mixes(id) ON DELETE CASCADE,
  flavor_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  percentage numeric NOT NULL CHECK (percentage >= 1 AND percentage <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (custom_mix_id, flavor_product_id)
);

CREATE INDEX custom_mix_flavors_mix_idx ON public.custom_mix_flavors(custom_mix_id);
CREATE INDEX custom_mixes_session_idx ON public.custom_mixes(session_id);
CREATE INDEX custom_mixes_user_idx ON public.custom_mixes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_mix_flavors TO authenticated;
GRANT ALL ON public.custom_mix_flavors TO service_role;

ALTER TABLE public.custom_mix_flavors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage flavors of their own mixes"
  ON public.custom_mix_flavors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_mixes m WHERE m.id = custom_mix_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_mixes m WHERE m.id = custom_mix_id AND m.user_id = auth.uid()));

CREATE POLICY "Admins can view all mix flavors"
  ON public.custom_mix_flavors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_custom_mixes_updated_at
  BEFORE UPDATE ON public.custom_mixes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_custom_mix_flavors_updated_at
  BEFORE UPDATE ON public.custom_mix_flavors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_custom_mix_flavor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cnt integer;
  brands text[];
  new_brand text;
BEGIN
  SELECT count(*) INTO cnt
  FROM public.custom_mix_flavors
  WHERE custom_mix_id = NEW.custom_mix_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF cnt >= 3 THEN
    RAISE EXCEPTION 'Un mix personnalisé ne peut contenir que 3 arômes maximum';
  END IF;

  SELECT brand INTO new_brand FROM public.products WHERE id = NEW.flavor_product_id;

  IF new_brand IS NULL OR new_brand NOT IN ('Alchimix', 'Mixologue') THEN
    RAISE EXCEPTION 'Seuls les arômes de marque Alchimix ou Mixologue sont autorisés';
  END IF;

  SELECT array_agg(DISTINCT p.brand) INTO brands
  FROM public.custom_mix_flavors f
  JOIN public.products p ON p.id = f.flavor_product_id
  WHERE f.custom_mix_id = NEW.custom_mix_id
    AND f.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF brands IS NOT NULL AND NOT (new_brand = ANY(brands) AND array_length(brands, 1) = 1) THEN
    RAISE EXCEPTION 'Tous les arômes d''un mix doivent appartenir à la même marque';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_custom_mix_flavors_validate
  BEFORE INSERT OR UPDATE ON public.custom_mix_flavors
  FOR EACH ROW EXECUTE FUNCTION public.validate_custom_mix_flavor();

CREATE OR REPLACE FUNCTION public.assert_custom_mix_complete(_mix_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  total numeric;
  cnt integer;
BEGIN
  SELECT count(*), COALESCE(sum(percentage), 0) INTO cnt, total
  FROM public.custom_mix_flavors WHERE custom_mix_id = _mix_id;

  IF cnt = 0 OR cnt > 3 THEN
    RAISE EXCEPTION 'Un mix doit contenir entre 1 et 3 arômes';
  END IF;

  IF total <> 100 THEN
    RAISE EXCEPTION 'La somme des pourcentages doit être exactement égale à 100';
  END IF;
END;
$$;