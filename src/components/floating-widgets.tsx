import { Link, useRouterState } from "@tanstack/react-router";
import { Gift, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCartPromoLines } from "@/lib/cart-promotions";
import { formatPrice } from "@/lib/products";
import { formatPrizeLabel, useWheelState } from "@/components/welcome-wheel";

/** Routes où les encarts seraient redondants avec le contenu de la page. */
const HIDDEN_ROUTES = ["/panier", "/checkout"];

function useHidden() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return HIDDEN_ROUTES.some((r) => pathname.startsWith(r));
}

/**
 * Rappel discret d'un gain de roue encore valable (statut "pending", non
 * expiré). L'état vient du serveur : le badge disparaît dès que le gain est
 * utilisé ou expiré. Aucun calcul de remise n'est fait ici.
 */
export function PendingRewardBadge() {
  const { data: state } = useWheelState();
  const hidden = useHidden();
  const pending = state?.pending?.[0];
  if (!pending || hidden) return null;

  return (
    <Link
      to="/panier"
      className="fixed bottom-4 right-4 z-40 inline-flex max-w-[85vw] items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
      aria-label={`Gain disponible : ${pending.label}. Aller au panier`}
    >
      <Gift className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
      <span className="truncate">
        {formatPrizeLabel(pending)} disponible
      </span>
    </Link>
  );
}

/**
 * Résumé flottant du panier : nombre d'articles + total, avec prix barré si
 * une promotion active s'applique. Le calcul réutilise le hook partagé.
 */
export function FloatingCartSummary() {
  const { items, count, subtotalCents, hydrated } = useCart();
  const { promoSubtotalCents, promoDiscountCents } = useCartPromoLines(
    items,
    subtotalCents,
  );
  const hidden = useHidden();
  if (!hydrated || count === 0 || hidden) return null;
  const hasPromo = promoDiscountCents > 0;

  return (
    <Link
      to="/panier"
      className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-3 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs backdrop-blur-sm transition-colors hover:bg-secondary"
      aria-label="Voir le panier"
    >
      <ShoppingBag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">
        {count} article{count > 1 ? "s" : ""}
      </span>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        {hasPromo && (
          <span className="text-muted-foreground line-through">
            {formatPrice(subtotalCents)}
          </span>
        )}
        <span>{formatPrice(hasPromo ? promoSubtotalCents : subtotalCents)}</span>
      </span>
    </Link>
  );
}
