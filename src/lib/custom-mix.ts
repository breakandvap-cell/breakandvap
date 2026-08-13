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
