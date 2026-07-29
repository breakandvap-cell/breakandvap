CREATE TABLE public.supplier_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier text NOT NULL,
  invoice_number text NOT NULL,
  supplier_norm text GENERATED ALWAYS AS (lower(trim(supplier))) STORED,
  invoice_norm text GENERATED ALWAYS AS (lower(trim(invoice_number))) STORED,
  lines_total integer NOT NULL DEFAULT 0,
  updated_variants integer NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_invoices_unique
  ON public.supplier_invoices (supplier_norm, invoice_norm);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage supplier invoices"
  ON public.supplier_invoices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER supplier_invoices_set_updated_at
  BEFORE UPDATE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();