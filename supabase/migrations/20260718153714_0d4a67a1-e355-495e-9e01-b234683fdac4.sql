
-- Atomic stock decrement RPCs to prevent overselling and low-stock threshold column.

CREATE OR REPLACE FUNCTION public.decrement_product_stock(_id uuid, _qty int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_stock integer;
BEGIN
  UPDATE public.products
    SET stock = stock - _qty,
        stock_status = CASE
          WHEN stock - _qty <= 0 THEN 'out_of_stock'::stock_status
          WHEN stock - _qty < 10 THEN 'low_stock'::stock_status
          ELSE 'in_stock'::stock_status
        END,
        updated_at = now()
    WHERE id = _id AND stock >= _qty
    RETURNING stock INTO new_stock;
  RETURN new_stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_product_stock(_id uuid, _qty int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_stock integer;
BEGIN
  UPDATE public.products
    SET stock = stock + _qty,
        stock_status = CASE
          WHEN stock + _qty <= 0 THEN 'out_of_stock'::stock_status
          WHEN stock + _qty < 10 THEN 'low_stock'::stock_status
          ELSE 'in_stock'::stock_status
        END,
        updated_at = now()
    WHERE id = _id
    RETURNING stock INTO new_stock;
  RETURN new_stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_variant_stock(_id uuid, _qty int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_stock integer;
BEGIN
  UPDATE public.product_variants
    SET stock = stock - _qty,
        updated_at = now()
    WHERE id = _id AND stock >= _qty
    RETURNING stock INTO new_stock;
  RETURN new_stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_variant_stock(_id uuid, _qty int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_stock integer;
BEGIN
  UPDATE public.product_variants
    SET stock = stock + _qty,
        updated_at = now()
    WHERE id = _id
    RETURNING stock INTO new_stock;
  RETURN new_stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_flavor_stock(_product_id uuid, _flavor text, _qty int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arr jsonb;
  new_arr jsonb := '[]'::jsonb;
  entry jsonb;
  cur_stock integer;
  new_stock integer := NULL;
  found boolean := false;
BEGIN
  SELECT flavors INTO arr FROM public.products WHERE id = _product_id FOR UPDATE;
  IF arr IS NULL OR jsonb_typeof(arr) <> 'array' THEN RETURN NULL; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(arr) LOOP
    IF found = false AND lower(entry->>'name') = lower(_flavor) THEN
      cur_stock := COALESCE((entry->>'stock')::int, 0);
      IF cur_stock < _qty THEN RETURN NULL; END IF;
      new_stock := cur_stock - _qty;
      entry := jsonb_set(entry, '{stock}', to_jsonb(new_stock));
      found := true;
    END IF;
    new_arr := new_arr || entry;
  END LOOP;
  IF NOT found THEN RETURN NULL; END IF;
  UPDATE public.products SET flavors = new_arr, updated_at = now() WHERE id = _product_id;
  RETURN new_stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_flavor_stock(_product_id uuid, _flavor text, _qty int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arr jsonb;
  new_arr jsonb := '[]'::jsonb;
  entry jsonb;
  cur_stock integer;
BEGIN
  SELECT flavors INTO arr FROM public.products WHERE id = _product_id FOR UPDATE;
  IF arr IS NULL OR jsonb_typeof(arr) <> 'array' THEN RETURN; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(arr) LOOP
    IF lower(entry->>'name') = lower(_flavor) THEN
      cur_stock := COALESCE((entry->>'stock')::int, 0);
      entry := jsonb_set(entry, '{stock}', to_jsonb(cur_stock + _qty));
    END IF;
    new_arr := new_arr || entry;
  END LOOP;
  UPDATE public.products SET flavors = new_arr, updated_at = now() WHERE id = _product_id;
END;
$$;

-- Low-stock digest tracking (one row per project, per product notification timestamp)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS low_stock_notified_at timestamptz;
