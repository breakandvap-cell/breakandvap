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

// Volumes gérés côté admin et boutique. 10 ml = prêt-à-l'emploi, sans booster.
// 50/100/200 ml = base + boosters de nicotine ajoutés.
export const VOLUME_OPTIONS_ML = [10, 50, 100, 200] as const;
// Taux de nicotine proposés pour un flacon 10 ml (déjà dosé).
export const NICOTINE_STEPS_MG_10ML = [0, 3, 6, 9, 10, 11, 12, 16, 20] as const;
// Taux atteignables via ajout de boosters sur les volumes 50/100/200 ml.
export const NICOTINE_STEPS_MG_BOOSTER = [0, 3, 6, 9] as const;
// Ancienne constante (compat rétro : maximum atteignable avec boosters).
export const NICOTINE_STEPS_MG = NICOTINE_STEPS_MG_BOOSTER;

export type ProductFlavor = { name: string; stock: number; photo: string | null };

export function parseFlavors(raw: unknown): ProductFlavor[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductFlavor[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const name = (f as { name?: unknown }).name;
    const stock = (f as { stock?: unknown }).stock;
    const photo = (f as { photo?: unknown }).photo;
    if (typeof name !== "string" || !name.trim()) continue;
    const s = typeof stock === "number" && Number.isFinite(stock)
      ? Math.max(0, Math.trunc(stock))
      : 0;
    out.push({
      name: name.trim(),
      stock: s,
      photo: typeof photo === "string" && photo.length > 0 ? photo : null,
    });
  }
  return out;
}

export function nicotineChoicesForVolume(volumeMl: number): readonly number[] {
  return volumeMl === 10 ? NICOTINE_STEPS_MG_10ML : NICOTINE_STEPS_MG_BOOSTER;
}

/** Nombre de boosters requis pour atteindre `nicotineMg` sur cette variante. */
export function boostersNeeded(
  variant: Pick<ProductVariantRow, "boosters_per_nicotine">,
  nicotineMg: number,
): number {
  if (!nicotineMg) return 0;
  const raw = variant.boosters_per_nicotine as Record<string, number> | null;
  if (!raw) return 0;
  const v = raw[String(nicotineMg)];
  return typeof v === "number" && v > 0 ? v : 0;
}

/** Prix final = prix de base de la variante + (boosters × prix booster). */
export function computeVariantPrice(
  variant: Pick<ProductVariantRow, "price_cents" | "boosters_per_nicotine" | "volume_ml">,
  nicotineMg: number,
  boosterUnitPriceCents: number | null,
): number {
  if (variant.volume_ml === 10) return variant.price_cents;
  const n = boostersNeeded(variant, nicotineMg);
  if (!n || !boosterUnitPriceCents) return variant.price_cents;
  return variant.price_cents + n * boosterUnitPriceCents;
}

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

/** Récupère le produit marqué comme "Booster de nicotine" (référence unique
 *  utilisée pour calculer le prix des e-liquides avec boosters). */
export const nicotineBoosterQueryOptions = () =>
  queryOptions({
    queryKey: ["nicotine-booster-product"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price_cents, currency, is_published, stock_status")
        .eq("is_nicotine_booster", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });

/** Récupère un produit par son id (utilisé pour charger le booster ou le
 *  flacon vide explicitement associés à un e-liquide). */
export const productByIdQueryOptions = (id: string | null | undefined) =>
  queryOptions({
    queryKey: ["product-by-id", id ?? "none"] as const,
    enabled: Boolean(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, price_cents, currency, is_published, stock_status, stock, photos",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });