import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductCategory = Database["public"]["Enums"]["product_category"];
export type ProductVariantRow =
  Database["public"]["Tables"]["product_variants"]["Row"];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  cbd: "CBD",
  e_liquide: "E-liquides",
  accessoire_vape: "Accessoires Vape",
  accessoire_cbd: "Accessoires CBD",
  // Ancienne catégorie conservée pour la compatibilité de l'enum.
  accessoire: "Accessoires",
};

// Catégories exposées dans l'UI (l'ancienne « accessoire » est masquée).
export const CATEGORY_ORDER: ProductCategory[] = [
  "cbd",
  "e_liquide",
  "accessoire_vape",
  "accessoire_cbd",
];

export const NICOTINE_STEPS_MG = [0, 3, 6, 9] as const;
export const VOLUME_OPTIONS_ML = [50, 100, 200] as const;

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

export const productVariantsQueryOptions = (productId: string | undefined) =>
  queryOptions({
    queryKey: ["product-variants", productId ?? "none"] as const,
    enabled: Boolean(productId),
    queryFn: async () => {
      if (!productId) return [] as ProductVariantRow[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("volume_ml", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductVariantRow[];
    },
  });

// Cherche les variantes des e-liquides listés, pour afficher un « à partir de »
// sur les cartes catalogue sans requête par produit.
export const variantsForProductsQueryOptions = (productIds: string[]) =>
  queryOptions({
    queryKey: ["product-variants-many", [...productIds].sort()] as const,
    enabled: productIds.length > 0,
    queryFn: async () => {
      if (productIds.length === 0) return {} as Record<string, ProductVariantRow[]>;
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .in("product_id", productIds)
        .order("volume_ml", { ascending: true });
      if (error) throw new Error(error.message);
      const map: Record<string, ProductVariantRow[]> = {};
      for (const v of data ?? []) {
        (map[v.product_id] ||= []).push(v as ProductVariantRow);
      }
      return map;
    },
  });