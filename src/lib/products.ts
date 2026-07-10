import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductCategory = Database["public"]["Enums"]["product_category"];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  cbd: "CBD",
  e_liquide: "E-liquides",
  accessoire: "Accessoires",
};

export const CATEGORY_ORDER: ProductCategory[] = ["cbd", "e_liquide", "accessoire"];

export function formatPrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export const STOCK_LABELS: Record<
  Database["public"]["Enums"]["stock_status"],
  { label: string; tone: "ok" | "warn" | "bad" }
> = {
  in_stock: { label: "En stock", tone: "ok" },
  low_stock: { label: "Stock limité", tone: "warn" },
  out_of_stock: { label: "Épuisé", tone: "bad" },
};

export const productsQueryOptions = (category?: ProductCategory) =>
  queryOptions({
    queryKey: ["products", category ?? "all"] as const,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductRow[];
    },
  });

export const productBySlugQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ProductRow | null;
    },
  });