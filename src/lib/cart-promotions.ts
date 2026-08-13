import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { activePromotionsQueryOptions } from "@/lib/promotions-pricing.query";
import { bestPromotionFor } from "@/lib/promotions-pricing";
import { useNow } from "@/lib/use-now";
import type { CartItem } from "@/lib/cart";

/**
 * Applique les promotions actives (meilleure remise, sans cumul) aux lignes du
 * panier. Utilisé par /panier et /checkout pour un calcul strictement identique
 * à celui des pages produit/boutique. Le serveur recalcule tout à la commande.
 */
export function useCartPromoLines(items: CartItem[], subtotalCents: number) {
  const { data: promotions } = useQuery(activePromotionsQueryOptions());
  // Recalcul périodique : une promo qui démarre ou expire pendant la visite
  // doit se refléter immédiatement dans le panier et la bulle flottante.
  const now = useNow();
  const productIds = Array.from(new Set(items.map((i) => i.productId))).sort();
  const { data: categoryById } = useQuery({
    queryKey: ["cart-product-categories", productIds.join(",")] as const,
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, category")
        .in("id", productIds);
      if (error) throw new Error(error.message);
      return Object.fromEntries(
        (data ?? []).map((p) => [p.id as string, p.category as string]),
      ) as Record<string, string>;
    },
  });

  const lines = items.map((it) => {
    const promo = bestPromotionFor(
      promotions,
      { productId: it.productId, category: categoryById?.[it.productId] ?? "" },
      it.priceCents,
      now,
    );
    const unit = promo?.finalCents ?? it.priceCents;
    return { item: it, unit, original: it.priceCents, promo };
  });
  const promoSubtotalCents = lines.reduce((s, l) => s + l.unit * l.item.quantity, 0);
  const promoDiscountCents = subtotalCents - promoSubtotalCents;

  return { lines, promoSubtotalCents, promoDiscountCents };
}
