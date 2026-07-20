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

// -------- Types de booster de nicotine --------
// Le stockage est libre (text) : l'admin peut ajouter d'autres types plus tard.
// Ces presets alimentent les puces par défaut dans le formulaire et la fiche
// produit, mais un type inconnu s'affiche tel quel (majuscule d'attaque).
export const BOOSTER_TYPE_PRESETS = [
  { key: "normale", label: "Nicotine normale" },
  { key: "sel", label: "Sel de nicotine" },
  { key: "ice", label: "Ice" },
] as const;

export function normalizeBoosterTypeKey(input: string | null | undefined): string {
  const s = (input ?? "").trim().toLowerCase();
  if (!s) return "normale";
  return s;
}

export function boosterTypeLabel(key: string | null | undefined): string {
  const k = normalizeBoosterTypeKey(key);
  const preset = BOOSTER_TYPE_PRESETS.find((p) => p.key === k);
  if (preset) return preset.label;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export type BoosterProduct = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  currency: string;
  is_published: boolean;
  stock_status: Database["public"]["Enums"]["stock_status"];
  booster_type: string | null;
  created_at: string;
};

export const boosterProductsQueryOptions = () =>
  queryOptions({
    queryKey: ["booster-products-by-type"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, price_cents, currency, is_published, stock_status, booster_type, created_at",
        )
        .eq("is_nicotine_booster", true)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as BoosterProduct[];
    },
  });

/** Premier booster publié pour chaque type (ordonné par created_at ASC). */
export function boostersByType(
  list: BoosterProduct[] | null | undefined,
): Record<string, BoosterProduct> {
  const map: Record<string, BoosterProduct> = {};
  for (const b of list ?? []) {
    if (!b.is_published) continue;
    const key = normalizeBoosterTypeKey(b.booster_type);
    if (!map[key]) map[key] = b;
  }
  return map;
}

/** Types de booster comptant plusieurs produits publiés (pour alerter l'admin). */
export function duplicateBoosterTypes(
  list: BoosterProduct[] | null | undefined,
): Record<string, BoosterProduct[]> {
  const groups: Record<string, BoosterProduct[]> = {};
  for (const b of list ?? []) {
    if (!b.is_published) continue;
    const key = normalizeBoosterTypeKey(b.booster_type);
    (groups[key] ||= []).push(b);
  }
  const dups: Record<string, BoosterProduct[]> = {};
  for (const [k, v] of Object.entries(groups)) if (v.length > 1) dups[k] = v;
  return dups;
}

export type ProductFlavor = {
  name: string;
  stock: number;
  photo: string | null;
  sku: string | null;
  is_active: boolean;
};

export type QuantityTier = {
  min_qty: number;
  max_qty: number | null;
  price_cents: number;
};

/** Retourne le prix unitaire à appliquer pour une quantité donnée. */
export function pickTierPriceCents(
  basePriceCents: number,
  tiers: QuantityTier[] | null | undefined,
  quantity: number,
): number {
  if (!tiers || tiers.length === 0) return basePriceCents;
  let best = basePriceCents;
  for (const t of tiers) {
    if (quantity >= t.min_qty && (t.max_qty == null || quantity <= t.max_qty)) {
      best = t.price_cents;
    }
  }
  return best;
}

export function parseQuantityTiers(raw: unknown): QuantityTier[] {
  if (!Array.isArray(raw)) return [];
  const out: QuantityTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const min = (t as { min_qty?: unknown }).min_qty;
    const max = (t as { max_qty?: unknown }).max_qty;
    const price = (t as { price_cents?: unknown }).price_cents;
    if (typeof min !== "number" || typeof price !== "number") continue;
    out.push({
      min_qty: Math.max(1, Math.trunc(min)),
      max_qty:
        typeof max === "number" && Number.isFinite(max)
          ? Math.max(1, Math.trunc(max))
          : null,
      price_cents: Math.max(0, Math.trunc(price)),
    });
  }
  return out.sort((a, b) => a.min_qty - b.min_qty);
}

export function parseFlavors(raw: unknown): ProductFlavor[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductFlavor[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const name = (f as { name?: unknown }).name;
    const stock = (f as { stock?: unknown }).stock;
    const photo = (f as { photo?: unknown }).photo;
    const sku = (f as { sku?: unknown }).sku;
    const isActive = (f as { is_active?: unknown }).is_active;
    if (typeof name !== "string" || !name.trim()) continue;
    const s = typeof stock === "number" && Number.isFinite(stock)
      ? Math.max(0, Math.trunc(stock))
      : 0;
    out.push({
      name: name.trim(),
      stock: s,
      photo: typeof photo === "string" && photo.length > 0 ? photo : null,
      sku: typeof sku === "string" && sku.length > 0 ? sku : null,
      is_active: typeof isActive === "boolean" ? isActive : true,
    });
  }
  return out;
}

export function nicotineChoicesForVolume(volumeMl: number): readonly number[] {
  return volumeMl === 10 ? NICOTINE_STEPS_MG_10ML : NICOTINE_STEPS_MG_BOOSTER;
}

// Les helpers `boostersNeeded` / `computeVariantPrice` ont été supprimés :
// le nombre de boosters et le taux résultant sont calculés à la volée par
// `computeNicotineRateMgPerMl` (site-settings.functions.ts), et la colonne
// obsolète `product_variants.boosters_per_nicotine` n'est plus lue nulle part.

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
        .eq("is_active", true)
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
        .eq("is_active", true)
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

export type EmptyBottleCandidate = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  currency: string;
  volume_ml: number;
  stock: number;
  stock_status: Database["public"]["Enums"]["stock_status"];
  photos: string[] | null;
};

/** Toutes les références de flacons vides publiées du catalogue.
 *  Un « flacon vide » est un accessoire vape avec une contenance renseignée
 *  (`volume_ml > 0`) et en stock. Utilisé pour proposer plusieurs options
 *  au client dans la pop-up de dépassement de capacité de boosters. */
export const emptyBottleCandidatesQueryOptions = () =>
  queryOptions({
    queryKey: ["empty-bottle-candidates"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, price_cents, currency, volume_ml, stock, stock_status, photos",
        )
        .eq("category", "accessoire_vape")
        .eq("is_published", true)
        .gt("volume_ml", 0)
        .neq("stock_status", "out_of_stock")
        .order("volume_ml", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        ...p,
        photos: (p.photos ?? null) as string[] | null,
      })) as EmptyBottleCandidate[];
    },
  });