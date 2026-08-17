import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Familles autorisées dans le configurateur DIY (jamais mélangées).
 *  Attention : « Alchimix » est une GAMME de la marque LiquidLab,
 *  « Mixologue » est une marque sans gamme. */
export const MIX_BRANDS = ["Alchimix", "Mixologue"] as const;
export type MixBrand = (typeof MIX_BRANDS)[number];

/** Sous-catégorie qui rend un produit utilisable dans le configurateur. */
export const MIX_SUBCATEGORY = "Mon Mix";

/** Critères réels de sélection en base pour chaque famille affichée. */
export const MIX_FAMILY_CRITERIA: Record<
  MixBrand,
  { brand?: string; rangeName?: string }
> = {
  Alchimix: { rangeName: "Alchimix" },
  Mixologue: { brand: "Mixologue" },
};

const eq = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/** Détermine la famille DIY d'un produit (null si non éligible).
 *  Règle : subcategory = 'Mon Mix', puis gamme Alchimix ou marque Mixologue. */
export function mixFamilyOf(product: {
  brand?: string | null;
  range_name?: string | null;
  subcategory?: string | null;
}): MixBrand | null {
  if (!eq(product.subcategory ?? null, MIX_SUBCATEGORY)) return null;
  for (const family of MIX_BRANDS) {
    const c = MIX_FAMILY_CRITERIA[family];
    if (c.rangeName && !eq(product.range_name ?? null, c.rangeName)) continue;
    if (c.brand && !eq(product.brand ?? null, c.brand)) continue;
    return family;
  }
  return null;
}

/** Nombre maximum d'arômes dans un mix. */
export const MIX_MAX_FLAVORS = 3;
/** Taux de nicotine maximum autorisé (mg/ml). */
export const MIX_MAX_NICOTINE_MG = 10;

/** Contenance de référence des arômes vendus au flacon (vente directe boutique). */
export const MIX_FLAVOR_REFERENCE_VOLUME_ML = 500;

/** Format spécial « gros volume » : un seul arôme à 100 %, nicotine payante,
 *  vendu sans flacon vide (l'arôme et les boosters sont fournis séparément). */
export const MIX_BULK_VOLUME_ML = 500;

/** Prix par booster de nicotine sur le format 500 ml (paramétrable en admin). */
export const DEFAULT_MIX_BULK_BOOSTER_PRICE_CENTS = 100;

export function isBulkMixFormat(volumeMl: number | null | undefined): boolean {
  return Number(volumeMl) === MIX_BULK_VOLUME_ML;
}

/** Nombre entier de boosters correspondant à un taux atteignable. */
export function boostersForNicotineRate(
  volumeMl: number | null | undefined,
  rateMgPerMl: number,
  cfg: { boosterVolumeMl: number; boosterConcentrationMgPerMl: number },
): number {
  if (!volumeMl || volumeMl <= 0 || rateMgPerMl <= 0) return 0;
  const bv = cfg.boosterVolumeMl > 0 ? cfg.boosterVolumeMl : 10;
  const conc =
    cfg.boosterConcentrationMgPerMl > 0 ? cfg.boosterConcentrationMgPerMl : 20;
  const perBooster = (bv * conc) / volumeMl;
  if (perBooster <= 0) return 0;
  return Math.max(0, Math.round(rateMgPerMl / perBooster));
}

/** Prix d'un mix personnalisé : prix FIXE par contenance.
 *  Il ne dépend ni des arômes choisis, ni de leur nombre, ni des pourcentages.
 *  La nicotine est offerte, SAUF sur le format 500 ml où chaque booster est
 *  facturé (prix unitaire paramétrable en admin). */
export function computeMixTotalCents(args: {
  bottlePriceCents: number;
  boostersCount?: number;
  boosterUnitPriceCents?: number;
}): number {
  const boosters = Math.max(0, Math.round(args.boostersCount ?? 0));
  const unit = Math.max(0, Math.round(args.boosterUnitPriceCents ?? 0));
  return Math.round(args.bottlePriceCents) + boosters * unit;
}

/** Taux de nicotine réellement atteignables pour une contenance donnée.
 *  On ne peut ajouter qu'un nombre ENTIER de boosters, et il faut laisser
 *  de la place pour la base + les arômes (le flacon n'est jamais rempli
 *  uniquement de boosters). Les taux > MIX_MAX_NICOTINE_MG sont exclus. */
export function availableNicotineRates(
  volumeMl: number | null | undefined,
  cfg: { boosterVolumeMl: number; boosterConcentrationMgPerMl: number },
): number[] {
  if (!volumeMl || volumeMl <= 0) return [0];
  const bv = cfg.boosterVolumeMl > 0 ? cfg.boosterVolumeMl : 10;
  const conc =
    cfg.boosterConcentrationMgPerMl > 0 ? cfg.boosterConcentrationMgPerMl : 20;
  const nMax = Math.max(0, Math.ceil(volumeMl / bv) - 1);
  const rates: number[] = [];
  for (let n = 0; n <= nMax; n++) {
    const rate = Math.round(((n * bv * conc) / volumeMl) * 10) / 10;
    if (rate > MIX_MAX_NICOTINE_MG) break;
    if (!rates.includes(rate)) rates.push(rate);
  }
  return rates.length > 0 ? rates : [0];
}

/** Affichage FR d'un taux de mix : "0 mg", "3,3 mg". */
export function formatMixNicotine(mg: number): string {
  const r = Math.round(mg * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",")} mg`;
}

export type MixFlavorOption = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  range_name?: string | null;
  subcategory?: string | null;
  price_cents: number;
  currency: string;
  photos: string[] | null;
  stock_status: Database["public"]["Enums"]["stock_status"];
};

/** Arômes publiés des marques DIY, groupés par marque.
 *  Une marque sans produit publié reste présente avec une liste vide :
 *  l'UI affiche alors « Bientôt disponible ». */
export const mixFlavorsByBrandQueryOptions = () =>
  queryOptions({
    queryKey: ["custom-mix-flavors"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, brand, range_name, subcategory, price_cents, currency, photos, stock_status",
        )
        .eq("subcategory", MIX_SUBCATEGORY)
        .eq("is_published", true)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      const map: Record<MixBrand, MixFlavorOption[]> = {
        Alchimix: [],
        Mixologue: [],
      };
      for (const p of (data ?? []) as MixFlavorOption[]) {
        const family = mixFamilyOf(p);
        if (family) map[family].push(p);
      }
      return map;
    },
  });

/** Flacons vides utilisables comme contenant d'un mix personnalisé. */
export const mixBottlesQueryOptions = () =>
  queryOptions({
    queryKey: ["custom-mix-bottles"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price_cents, currency, volume_ml, stock_status, photos")
        .eq("category", "accessoire_vape")
        .eq("is_published", true)
        .gt("volume_ml", 0)
        .neq("stock_status", "out_of_stock")
        .order("volume_ml", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

/** Identifiant de session invité, stable et persistant (localStorage). */
export function getMixSessionId(): string {
  const KEY = "bnv_mix_session";
  if (typeof window === "undefined") return "server-session-none";
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 8) {
      id = `mix_${crypto.randomUUID()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `mix_fallback_${Math.random().toString(36).slice(2)}0000000`;
  }
}

/** Couleur générique du liquide par marque (aucune couleur en base). */
export const MIX_BRAND_COLORS: Record<MixBrand, { from: string; to: string }> = {
  Alchimix: { from: "#7ad1ff", to: "#1f7ae0" },
  Mixologue: { from: "#ffd27a", to: "#e0761f" },
};

/** Logos de marque affichés sur l'enseigne du bar (étape 3).
 *  Laisser vide tant que le visuel officiel n'est pas fourni :
 *  l'interface affiche alors un emplacement « Logo … » en attente. */
export const MIX_BRAND_LOGOS: Record<MixBrand, string | null> = {
  Alchimix: null,
  Mixologue: null,
};

/** Part du flacon réellement occupée par les boosters de nicotine (0 → 1). */
export function nicotineVolumeRatio(
  volumeMl: number | null | undefined,
  boostersCount: number,
  cfg: { boosterVolumeMl: number },
): number {
  if (!volumeMl || volumeMl <= 0) return 0;
  const bv = cfg.boosterVolumeMl > 0 ? cfg.boosterVolumeMl : 10;
  return Math.max(0, Math.min(1, (boostersCount * bv) / volumeMl));
}

/** Couleur d'un arôme dans le flacon : teinte dérivée de la marque + index. */
export function flavorFillColor(brand: MixBrand | null, index: number): string {
  const hues: Record<MixBrand, number[]> = {
    Alchimix: [200, 168, 262],
    Mixologue: [38, 12, 96],
  };
  const list = brand ? hues[brand] : [140, 168, 96];
  const h = list[index % list.length] ?? 140;
  return `hsl(${h} 78% 58%)`;
}

export type MixRecipePart = { flavor_product_id: string; percentage: number };

export type MixRecipeRow = {
  id: string;
  name: string;
  description: string;
  brand: MixBrand;
  parts: MixRecipePart[];
  suggested_nicotine_mg: number;
  sort_order: number;
  is_active: boolean;
};

/** Recettes populaires pilotées depuis l'espace gérant (/admin/mon-mix). */
export const mixRecipesQueryOptions = () =>
  queryOptions({
    queryKey: ["custom-mix-recipes"] as const,
    queryFn: async (): Promise<MixRecipeRow[]> => {
      const { data, error } = await supabase
        .from("custom_mix_recipes")
        .select("id, name, description, brand, parts, suggested_nicotine_mg, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? "",
        brand: (MIX_BRANDS as readonly string[]).includes(r.brand)
          ? (r.brand as MixBrand)
          : "Alchimix",
        parts: Array.isArray(r.parts) ? (r.parts as unknown as MixRecipePart[]) : [],
        suggested_nicotine_mg: Number(r.suggested_nicotine_mg) || 0,
        sort_order: r.sort_order ?? 0,
        is_active: r.is_active,
      }));
    },
  });
