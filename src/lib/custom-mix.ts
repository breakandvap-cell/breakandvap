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

/** Contenance de référence des arômes vendus au flacon (prix catalogue). */
export const MIX_FLAVOR_REFERENCE_VOLUME_ML = 500;

/** Contribution d'un arôme au prix d'un mix, au prorata :
 *  (pourcentage / 100) × volume_flacon × (prix_500ml / 500).
 *  La nicotine occupe du volume mais reste offerte (0 €). */
export function mixFlavorContributionCents(
  flavorPrice500Cents: number,
  percentage: number,
  bottleVolumeMl: number,
): number {
  if (!Number.isFinite(flavorPrice500Cents) || !Number.isFinite(percentage)) return 0;
  if (!bottleVolumeMl || bottleVolumeMl <= 0) return 0;
  return (
    (percentage / 100) *
    bottleVolumeMl *
    (flavorPrice500Cents / MIX_FLAVOR_REFERENCE_VOLUME_ML)
  );
}

/** Prix complet d'un mix : flacon vide + arômes au prorata (nicotine offerte). */
export function computeMixTotalCents(args: {
  bottlePriceCents: number;
  bottleVolumeMl: number;
  parts: Array<{ price500Cents: number; percentage: number }>;
}): number {
  const flavors = args.parts.reduce(
    (sum, p) =>
      sum + mixFlavorContributionCents(p.price500Cents, p.percentage, args.bottleVolumeMl),
    0,
  );
  return Math.round(args.bottlePriceCents + flavors);
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

export type MixRecipe = {
  id: string;
  name: string;
  description: string;
  brand: MixBrand;
  /** Noms d'arômes attendus + pourcentage. Résolus dynamiquement si présents. */
  parts: { flavorName: string; percentage: number }[];
  suggestedNicotineMg: number;
};

/** Recettes populaires proposées en un clic. Elles s'activent automatiquement
 *  dès que les arômes correspondants existent en base pour la marque. */
export const MIX_RECIPES: MixRecipe[] = [
  {
    id: "fruits-rouges-glaces",
    name: "Fruits rouges glacés",
    description: "Le classique gourmand rafraîchi par une pointe de menthe.",
    brand: "Alchimix",
    parts: [
      { flavorName: "Fraise", percentage: 50 },
      { flavorName: "Framboise", percentage: 30 },
      { flavorName: "Menthe", percentage: 20 },
    ],
    suggestedNicotineMg: 6,
  },
  {
    id: "tropical-sunset",
    name: "Tropical Sunset",
    description: "Mangue solaire, ananas juteux et fruit de la passion.",
    brand: "Alchimix",
    parts: [
      { flavorName: "Mangue", percentage: 40 },
      { flavorName: "Ananas", percentage: 40 },
      { flavorName: "Fruit de la passion", percentage: 20 },
    ],
    suggestedNicotineMg: 3,
  },
  {
    id: "gourmand-vanille",
    name: "Gourmand vanillé",
    description: "Vanille crémeuse et caramel, pour une vape dessert.",
    brand: "Mixologue",
    parts: [
      { flavorName: "Vanille", percentage: 60 },
      { flavorName: "Caramel", percentage: 40 },
    ],
    suggestedNicotineMg: 6,
  },
  {
    id: "menthe-polaire",
    name: "Menthe polaire",
    description: "Fraîcheur intense, simple et efficace.",
    brand: "Mixologue",
    parts: [
      { flavorName: "Menthe", percentage: 70 },
      { flavorName: "Eucalyptus", percentage: 30 },
    ],
    suggestedNicotineMg: 10,
  },
];
