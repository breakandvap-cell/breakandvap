import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GammeRow = {
  id: string;
  nom: string;
  marque: string;
};

/** Gammes rattachées à une marque (tri alphabétique). */
export const gammesByBrandQueryOptions = (brand: string) => {
  const marque = brand.trim();
  return queryOptions({
    queryKey: ["gammes", marque.toLowerCase()] as const,
    enabled: marque.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gammes")
        .select("id, nom, marque")
        .ilike("marque", marque)
        .order("nom", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as GammeRow[];
    },
  });
};

/** Crée une gamme rattachée à la marque du produit en cours d'édition. */
export async function createGamme(input: {
  nom: string;
  marque: string;
}): Promise<GammeRow> {
  const nom = input.nom.trim();
  const marque = input.marque.trim();
  if (!nom) throw new Error("Le nom de la gamme est obligatoire.");
  if (!marque) throw new Error("Sélectionnez d'abord une marque.");
  const { data: existing } = await supabase
    .from("gammes")
    .select("id, nom, marque")
    .ilike("marque", marque)
    .ilike("nom", nom)
    .maybeSingle();
  if (existing) return existing as GammeRow;
  const { data, error } = await supabase
    .from("gammes")
    .insert({ nom, marque })
    .select("id, nom, marque")
    .single();
  if (error) throw new Error(error.message);
  return data as GammeRow;
}
