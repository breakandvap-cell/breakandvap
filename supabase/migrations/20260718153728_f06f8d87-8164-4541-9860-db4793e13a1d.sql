
REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_stock(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_variant_stock(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_variant_stock(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_flavor_stock(uuid, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_flavor_stock(uuid, text, int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.decrement_product_stock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_product_stock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_variant_stock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_variant_stock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_flavor_stock(uuid, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_flavor_stock(uuid, text, int) TO service_role;
