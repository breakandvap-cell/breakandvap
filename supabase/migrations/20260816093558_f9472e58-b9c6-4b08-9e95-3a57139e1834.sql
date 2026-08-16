ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS mix_bulk_booster_price_cents integer NOT NULL DEFAULT 100;

INSERT INTO public.products (slug, name, description, category, subcategory, price_cents, currency, stock, stock_status, is_published, volume_ml, brand)
SELECT 'format-500ml-arome-seul', 'Format 500 ml (arôme seul)',
       'Format 500 ml du configurateur Mon Mix : vendu avec l''arôme uniquement. La nicotine, si ajoutée, est fournie séparément.',
       'accessoire_vape', 'Mon Mix', 9000, 'EUR', 100, 'in_stock', true, 500, 'Break And Vap'
WHERE NOT EXISTS (
  SELECT 1 FROM public.products WHERE slug = 'format-500ml-arome-seul'
);