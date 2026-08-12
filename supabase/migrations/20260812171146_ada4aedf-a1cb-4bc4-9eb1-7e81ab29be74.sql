CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE public.promotion_scope AS ENUM ('site', 'category', 'product');
CREATE TYPE public.wheel_type AS ENUM ('welcome', 'general');
CREATE TYPE public.wheel_spin_status AS ENUM ('pending', 'used', 'expired');

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_type public.discount_type NOT NULL,
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  scope public.promotion_scope NOT NULL DEFAULT 'site',
  scope_id uuid,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Promotions actives visibles publiquement" ON public.promotions
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Les gérants gèrent les promotions" ON public.promotions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wheel_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_type public.wheel_type NOT NULL,
  label text NOT NULL,
  discount_type public.discount_type NOT NULL,
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wheel_prizes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wheel_prizes TO authenticated;
GRANT ALL ON public.wheel_prizes TO service_role;
ALTER TABLE public.wheel_prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lots actifs visibles publiquement" ON public.wheel_prizes
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Les gérants gèrent les lots" ON public.wheel_prizes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wheel_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wheel_type public.wheel_type NOT NULL,
  prize_id uuid REFERENCES public.wheel_prizes(id) ON DELETE SET NULL,
  discount_amount_cents integer NOT NULL DEFAULT 0,
  status public.wheel_spin_status NOT NULL DEFAULT 'pending',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wheel_spins_user_idx ON public.wheel_spins (user_id, status);

GRANT SELECT ON public.wheel_spins TO authenticated;
GRANT ALL ON public.wheel_spins TO service_role;
ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chacun voit ses tirages" ON public.wheel_spins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Les gérants voient tous les tirages" ON public.wheel_spins
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER promotions_set_updated_at BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wheel_prizes_set_updated_at BEFORE UPDATE ON public.wheel_prizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wheel_spins_set_updated_at BEFORE UPDATE ON public.wheel_spins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS welcome_wheel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS general_wheel_enabled boolean NOT NULL DEFAULT false;