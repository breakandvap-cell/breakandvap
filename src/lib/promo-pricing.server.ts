import type { ActivePromotion } from "@/lib/promotions-pricing";
import {
  bestPromotionFor,
  type PromotionTarget,
} from "@/lib/promotions-pricing";

type AdminClient = {
  from: (table: string) => {
    select: (cols: string) => Promise<{ data: unknown; error: unknown }> & {
      eq: (col: string, v: unknown) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

/**
 * Charge les promotions actives et la table de correspondance des catégories.
 * Utilisé côté serveur : le prix réduit n'est JAMAIS fourni par le client.
 */
export async function loadActivePromotions(
  admin: unknown,
): Promise<ActivePromotion[]> {
  const db = admin as AdminClient;
  const [{ data: promos }, { data: cats }] = await Promise.all([
    (db.from("promotions").select(
      "id, name, discount_type, discount_value, scope, scope_id, start_date, end_date",
    ) as unknown as { eq: (c: string, v: unknown) => Promise<{ data: unknown }> }).eq(
      "is_active",
      true,
    ),
    db.from("shop_categories").select("id, key"),
  ]);
  const keyById = new Map<string, string>(
    ((cats ?? []) as Array<{ id: string; key: string }>).map((c) => [c.id, c.key]),
  );
  return ((promos ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? ""),
    discount_type: p.discount_type as ActivePromotion["discount_type"],
    discount_value: Number(p.discount_value ?? 0),
    scope: p.scope as ActivePromotion["scope"],
    scope_id: (p.scope_id ?? null) as string | null,
    category_key: p.scope_id ? (keyById.get(String(p.scope_id)) ?? null) : null,
    start_date: String(p.start_date),
    end_date: (p.end_date ?? null) as string | null,
  }));
}

/** Prix unitaire remisé (promotion la plus avantageuse, sans cumul). */
export function applyBestPromotion(
  promotions: ActivePromotion[],
  target: PromotionTarget,
  unitPriceCents: number,
): number {
  return bestPromotionFor(promotions, target, unitPriceCents)?.finalCents ?? unitPriceCents;
}
