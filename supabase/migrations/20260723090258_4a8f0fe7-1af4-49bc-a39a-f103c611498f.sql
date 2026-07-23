ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS product_range text;

CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products (lower(brand)) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_brand_range_idx ON public.products (lower(brand), lower(product_range)) WHERE product_range IS NOT NULL;