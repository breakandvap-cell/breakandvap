import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/products";

export const Route = createFileRoute("/panier")({
  head: () => ({
    meta: [
      { title: "Panier | Break and Vap" },
      { name: "description", content: "Récapitulatif de votre panier avant validation." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotalCents, setQuantity, remove, hydrated } = useCart();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1
          className="text-4xl leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Votre panier
        </h1>

        {!hydrated ? (
          <p className="mt-8 text-sm text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <EmptyCart />
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {items.map((item) => (
                <li key={item.key} className="flex gap-4 p-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
                    {item.photo ? (
                      <img
                        src={item.photo}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <Link
                      to="/produit/$slug"
                      params={{ slug: item.slug }}
                      className="text-sm font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    {(item.volumeMl || item.nicotineMg != null || item.flavor) && (
                      <span className="text-[11px] text-muted-foreground">
                        {item.volumeMl ? `${item.volumeMl} ml` : ""}
                        {item.volumeMl && item.nicotineMg != null ? " · " : ""}
                        {item.nicotineMg != null ? `${item.nicotineMg} mg` : ""}
                        {item.flavor
                          ? `${item.volumeMl || item.nicotineMg != null ? " · " : ""}${item.flavor}`
                          : ""}
                      </span>
                    )}
                    <span className="mt-1 text-xs text-muted-foreground">
                      {formatPrice(item.priceCents)} l'unité
                    </span>
                    {item.boostersCount && item.boostersCount > 0 &&
                    item.boosterUnitPriceCents != null &&
                    item.baseUnitPriceCents != null ? (
                      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        <div>Prix flacon : {formatPrice(item.baseUnitPriceCents)}</div>
                        <div>
                          Boosters : {item.boostersCount} ×{" "}
                          {formatPrice(item.boosterUnitPriceCents)} ={" "}
                          {formatPrice(item.boostersCount * item.boosterUnitPriceCents)}
                        </div>
                        <div className="text-foreground">
                          Total ligne :{" "}
                          {formatPrice(item.priceCents * item.quantity)}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="inline-flex items-center rounded-md border border-border">
                        <button
                          onClick={() =>
                            setQuantity(item.key, item.quantity - 1)
                          }
                          className="px-2 py-1 hover:bg-secondary"
                          aria-label="Diminuer"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            setQuantity(item.key, item.quantity + 1)
                          }
                          disabled={item.quantity >= item.maxStock}
                          className="px-2 py-1 hover:bg-secondary disabled:opacity-40"
                          aria-label="Augmenter"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => remove(item.key)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Retirer
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold">
                    {formatPrice(item.priceCents * item.quantity)}
                  </div>
                </li>
              ))}
            </ul>

            <aside className="h-fit rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">Récapitulatif</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sous-total</dt>
                  <dd className="font-medium">{formatPrice(subtotalCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Livraison</dt>
                  <dd className="text-muted-foreground">Calculée à l'étape suivante</dd>
                </div>
              </dl>
              <div className="mt-6 flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-semibold">
                  {formatPrice(subtotalCents)}
                </span>
              </div>
              <Link
                to="/checkout"
                className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Passer la commande
              </Link>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Vente réservée aux personnes majeures. La nicotine crée une forte
                dépendance.
              </p>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="mt-10 rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-4 text-sm text-muted-foreground">
        Votre panier est vide.
      </p>
      <Link
        to="/boutique"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Découvrir le catalogue
      </Link>
    </div>
  );
}