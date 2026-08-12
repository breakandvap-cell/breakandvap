import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscountType, PromotionScope } from "@/lib/promotions.functions";
import type { ActivePromotion } from "@/lib/promotions-pricing";

/** Lecture publique des promotions actives (policy `TO anon`). */
export const activePromotionsQueryOptions = () =>
  queryOptions({
    queryKey: ["active-promotions"] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<ActivePromotion[]> => {
      const [{ data: promos, error }, { data: cats }] = await Promise.all([
        supabase
          .from("promotions")
          .select(
            "id, name, discount_type, discount_value, scope, scope_id, start_date, end_date",
          )
          .eq("is_active", true),
        supabase.from("shop_categories").select("id, key"),
      ]);
      if (error) throw new Error(error.message);
      const keyById = new Map<string, string>(
        (cats ?? []).map((c) => [c.id as string, c.key as string]),
      );
      return (promos ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        discount_type: p.discount_type as DiscountType,
        discount_value: Number(p.discount_value),
        scope: p.scope as PromotionScope,
        scope_id: (p.scope_id ?? null) as string | null,
        category_key: p.scope_id ? (keyById.get(p.scope_id as string) ?? null) : null,
        start_date: p.start_date as string,
        end_date: (p.end_date ?? null) as string | null,
      }));
    },
  });
