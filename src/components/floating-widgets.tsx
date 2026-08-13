import { Link, useRouterState } from "@tanstack/react-router";
import { Gift, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCartPromoLines } from "@/lib/cart-promotions";
import { useCookieConsent } from "@/lib/cookie-consent";
import { formatPrice } from "@/lib/products";
import type { PromotionApplication } from "@/lib/promotions-pricing";
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
      <Gift className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="truncate">
        {formatPrizeLabel(pending)} disponible
      </span>
    </Link>
  );
}

function formatPromoLabel(promo: PromotionApplication | null | undefined) {
  if (!promo || promo.discountCents <= 0) return null;
  const { promotion } = promo;
  if (promotion.discount_type === "percentage") {
    return `-${promotion.discount_value}% (${promotion.name})`;
  }
  return `-${formatPrice(Math.round(promotion.discount_value * 100))} (${promotion.name})`;
}

/**
 * Résumé flottant du panier : bulle ronde verte avec icône caddie + badge
 * quantité, et sous la bulle un texte compact avec le total et la promo
 * appliquée. Le calcul réutilise le hook partagé et se met à jour en temps réel.
 */
export function FloatingCartSummary() {
  const { items, count, subtotalCents, hydrated } = useCart();
  const { lines, promoSubtotalCents, promoDiscountCents } = useCartPromoLines(
    items,
    subtotalCents,
  );
  const hidden = useHidden();
  const { bannerOpen } = useCookieConsent();
  if (!hydrated || count === 0 || hidden) return null;
  const hasPromo = promoDiscountCents > 0;

  const dominantLine = hasPromo
    ? lines
        .filter((l) => l.promo && l.promo.discountCents > 0)
        .sort((a, b) => (b.promo?.discountCents ?? 0) - (a.promo?.discountCents ?? 0))[0]
    : null;
  const promoLabel = dominantLine ? formatPromoLabel(dominantLine.promo) : null;

  return (
    <Link
      to="/panier"
      className={`fixed left-4 z-40 flex flex-col items-center gap-2 transition-[bottom] ${
        bannerOpen ? "bottom-[7.5rem]" : "bottom-4"
      }`}
      aria-label="Voir le panier"
    >
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95">
        <ShoppingCart className="h-6 w-6" aria-hidden />
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
          {count}
        </span>
      </span>
      <span className="rounded-xl border border-border bg-card/95 px-2.5 py-1.5 text-[11px] leading-tight backdrop-blur-sm">
        <span className="block text-center font-medium text-foreground">
          {count} article{count > 1 ? "s" : ""}
        </span>
        <span className="block text-center text-foreground">
          {hasPromo ? (
            <>
              <span className="text-muted-foreground line-through">
                {formatPrice(subtotalCents)}
              </span>{" "}
              <span className="font-medium">{formatPrice(promoSubtotalCents)}</span>
            </>
          ) : (
            <span className="font-medium">{formatPrice(subtotalCents)}</span>
          )}
        </span>
        {hasPromo && promoLabel && (
          <span className="block text-center text-accent">{promoLabel}</span>
        )}
      </span>
    </Link>
  );
}
