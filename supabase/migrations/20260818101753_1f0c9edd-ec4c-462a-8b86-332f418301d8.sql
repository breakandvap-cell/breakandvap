ALTER TABLE public.products ADD COLUMN IF NOT EXISTS liquid_color text;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_liquid_color_hex_chk;
ALTER TABLE public.products ADD CONSTRAINT products_liquid_color_hex_chk CHECK (liquid_color IS NULL OR liquid_color ~* '^#[0-9a-f]{6}$');