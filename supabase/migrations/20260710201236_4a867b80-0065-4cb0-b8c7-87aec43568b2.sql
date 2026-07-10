
-- Compteur annuel de factures (verrouillé pour garantir la séquence sans trou)
CREATE TABLE public.invoice_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_counters TO authenticated;
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read invoice_counters" ON public.invoice_counters
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Table des factures
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  year integer NOT NULL,
  sequence integer NOT NULL,
  number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  tax_rate numeric(5,2) NOT NULL,
  tax_cents integer NOT NULL CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  seller jsonb NOT NULL,
  buyer jsonb NOT NULL,
  items jsonb NOT NULL,
  pdf_path text,
  pdf_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, sequence)
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients read own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = invoices.order_id AND o.user_id = auth.uid()
  ));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC atomique : crée la facture d'une commande avec un numéro séquentiel
-- Le compteur est incrémenté dans la même transaction que l'insertion : gap-free.
CREATE OR REPLACE FUNCTION public.create_invoice_for_order(
  _order_id uuid,
  _subtotal_cents integer,
  _tax_rate numeric,
  _tax_cents integer,
  _total_cents integer,
  _currency text,
  _seller jsonb,
  _buyer jsonb,
  _items jsonb
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.invoices;
  yr integer := extract(year from now())::integer;
  seq integer;
  num text;
  row public.invoices;
BEGIN
  SELECT * INTO existing FROM public.invoices WHERE order_id = _order_id;
  IF FOUND THEN
    RETURN existing;
  END IF;

  INSERT INTO public.invoice_counters(year, last_number)
    VALUES (yr, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_number = public.invoice_counters.last_number + 1,
          updated_at = now()
    RETURNING last_number INTO seq;

  num := 'FACT-' || yr::text || '-' || lpad(seq::text, 4, '0');

  INSERT INTO public.invoices(
    order_id, year, sequence, number,
    subtotal_cents, tax_rate, tax_cents, total_cents, currency,
    seller, buyer, items
  )
  VALUES (
    _order_id, yr, seq, num,
    _subtotal_cents, _tax_rate, _tax_cents, _total_cents, _currency,
    _seller, _buyer, _items
  )
  RETURNING * INTO row;

  RETURN row;
END;
$$;
