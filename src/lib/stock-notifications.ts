import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nombre de clients en attente d'une alerte de réapprovisionnement, par
 * produit. Réservé à l'admin (RLS : lecture globale pour le rôle admin).
 */
export function pendingRestockCountsQueryOptions(productIds: string[]) {
  const ids = [...productIds].sort();
  return queryOptions({
    queryKey: ["admin", "restock-pending", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("stock_notifications")
        .select("product_id")
        .eq("status", "pending")
        .in("product_id", ids);
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.product_id] = (counts[row.product_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}