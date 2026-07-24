
CREATE TABLE public.supplier_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier TEXT NOT NULL,
  supplier_ref TEXT,
  supplier_label TEXT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK (supplier_ref IS NOT NULL OR supplier_label IS NOT NULL)
);

CREATE INDEX supplier_mappings_supplier_ref_idx
  ON public.supplier_mappings (lower(supplier), lower(supplier_ref));
CREATE INDEX supplier_mappings_supplier_label_idx
  ON public.supplier_mappings (lower(supplier), lower(supplier_label));
CREATE INDEX supplier_mappings_variant_idx
  ON public.supplier_mappings (variant_id);

CREATE UNIQUE INDEX supplier_mappings_supplier_ref_unique
  ON public.supplier_mappings (lower(supplier), lower(supplier_ref))
  WHERE supplier_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_mappings TO authenticated;
GRANT ALL ON public.supplier_mappings TO service_role;

ALTER TABLE public.supplier_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage supplier mappings"
  ON public.supplier_mappings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_supplier_mappings_updated_at
  BEFORE UPDATE ON public.supplier_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
