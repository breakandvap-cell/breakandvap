import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Marques autorisées dans le configurateur DIY (jamais mélangées). */
export const MIX_BRANDS = ["Alchimix", "Mixologue"] as const;
export type MixBrand = (typeof MIX_BRANDS)[number];

/** Nombre maximum d'arômes dans un mix. */
export const MIX_MAX_FLAVORS = 3;
/** Taux de nicotine maximum autorisé (mg/ml). */
export const MIX_MAX_NICOTINE_MG = 10;

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
        .select("id, name, slug, brand, price_cents, currency, photos, stock_status")
        .in("brand", [...MIX_BRANDS])
        .eq("is_published", true)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      const map: Record<MixBrand, MixFlavorOption[]> = {
        Alchimix: [],
        Mixologue: [],
      };
      for (const p of (data ?? []) as MixFlavorOption[]) {
        const brand = p.brand as MixBrand | null;
        if (brand && map[brand]) map[brand].push(p);
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
