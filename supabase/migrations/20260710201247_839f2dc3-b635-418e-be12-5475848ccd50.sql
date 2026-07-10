
REVOKE EXECUTE ON FUNCTION public.create_invoice_for_order(uuid, integer, numeric, integer, integer, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_order(uuid, integer, numeric, integer, integer, text, jsonb, jsonb, jsonb) TO service_role;
