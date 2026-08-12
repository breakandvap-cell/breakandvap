import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscountType, PromotionScope } from "@/lib/promotions.functions";

/** Promotion normalisée pour le calcul de prix côté client ET serveur. */
export type ActivePromotion = {
  id: string;
  name: string;
  discount_type: DiscountType;
  /** Pourcentage (0-100) ou montant fixe en euros. */
  discount_value: number;
  scope: PromotionScope;
  /** shop_categories.id pour scope=category, products.id pour scope=product. */
  scope_id: string | null;
  /** Clé de catégorie produit (product_category) résolue pour scope=category. */
  category_key: string | null;
  start_date: string;
  end_date: string | null;
};

export type PromotionTarget = {
  productId: string;
  /** Valeur de l'enum product_category du produit. */
  category: string;
};

export function isPromotionLive(p: ActivePromotion, now = new Date()): boolean {
  const start = new Date(p.start_date).getTime();
  if (Number.isFinite(start) && now.getTime() < start) return false;
  if (p.end_date) {
    const end = new Date(p.end_date).getTime();
    if (Number.isFinite(end) && now.getTime() > end) return false;
  }
  return true;
}

export function promotionMatches(p: ActivePromotion, t: PromotionTarget): boolean {
  if (p.scope === "site") return true;
  if (p.scope === "product") return !!p.scope_id && p.scope_id === t.productId;
  if (p.scope === "category") return !!p.category_key && p.category_key === t.category;
  return false;
}

/** Montant de la remise (en centimes) pour un prix donné. */
export function promotionDiscountCents(p: ActivePromotion, priceCents: number): number {
  if (priceCents <= 0) return 0;
  const raw =
    p.discount_type === "percentage"
      ? Math.round((priceCents * p.discount_value) / 100)
      : Math.round(p.discount_value * 100);
  return Math.max(0, Math.min(priceCents, raw));
}

export type PromotionApplication = {
  promotion: ActivePromotion;
  originalCents: number;
  discountCents: number;
  finalCents: number;
};

/**
 * Retourne la promotion la plus avantageuse pour le client parmi celles qui
 * couvrent le produit. Aucun cumul : une seule promotion s'applique.
 */
export function bestPromotionFor(
  promotions: ActivePromotion[] | null | undefined,
  target: PromotionTarget,
  priceCents: number,
  now = new Date(),
): PromotionApplication | null {
  let best: PromotionApplication | null = null;
  for (const p of promotions ?? []) {
    if (!isPromotionLive(p, now)) continue;
    if (!promotionMatches(p, target)) continue;
    const discountCents = promotionDiscountCents(p, priceCents);
    if (discountCents <= 0) continue;
    if (!best || discountCents > best.discountCents) {
      best = {
        promotion: p,
        originalCents: priceCents,
        discountCents,
        finalCents: priceCents - discountCents,
      };
    }
  }
  return best;
}

/** Prix promotionnel (ou prix d'origine si aucune promo ne s'applique). */
export function promotionalPriceCents(
  promotions: ActivePromotion[] | null | undefined,
  target: PromotionTarget,
  priceCents: number,
  now = new Date(),
): number {
  return bestPromotionFor(promotions, target, priceCents, now)?.finalCents ?? priceCents;
}

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
