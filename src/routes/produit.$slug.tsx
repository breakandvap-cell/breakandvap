import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import {
  CATEGORY_LABELS,
  STOCK_LABELS,
  formatPrice,
  productBySlugQueryOptions,
} from "@/lib/products";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/produit/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(
      productBySlugQueryOptions(params.slug),
    );
    if (!product) throw notFound();
    return null;
  },
  head: ({ params, loaderData }) => {
    const title = loaderData
      ? `Produit — ${params.slug} | Break and Vap`
      : "Produit — Break and Vap";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Fiche produit détaillée : composition, taux, avertissements sanitaires et disponibilité.",
        },
      ],
    };
  },
  component: ProductDetail,
  errorComponent: ({ error, reset }) => {
    return (
      <div className="p-8 text-sm">
        <p className="text-destructive">Erreur : {error.message}</p>
        <button onClick={reset} className="mt-4 underline">
          Réessayer
        </button>
      </div>
    );
  },
  notFoundComponent: () => <ProductNotFound />,
});

function ProductNotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-3xl">Produit introuvable</h1>
        <p className="mt-3 text-muted-foreground">
          Ce produit n'existe plus ou n'est plus publié.
        </p>
        <Link
          to="/boutique"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au catalogue
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function ProductDetail() {
  const { slug } = Route.useParams();
  const router = useRouter();
  const { data: product } = useSuspenseQuery(productBySlugQueryOptions(slug));
  const cart = useCart();
  const [qty, setQty] = useState(1);
  if (!product) {
    // Guard for TS; loader already threw notFound.
    return <ProductNotFound />;
  }
  const stock = STOCK_LABELS[product.stock_status];
  const photo = product.photos?.[0];
  const isEliquide = product.category === "e_liquide";
  const isCbd = product.category === "cbd";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <button
          onClick={() => router.history.back()}
          className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </button>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border bg-secondary">
            {photo ? (
              <img
                src={photo}
                alt={product.name}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-sm text-muted-foreground">
                Sans visuel
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {CATEGORY_LABELS[product.category]}
              {product.subcategory ? ` · ${product.subcategory}` : ""}
            </span>
            <h1
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {product.name}
            </h1>

            <div className="mt-4 flex items-center gap-3">
              <span className="text-3xl font-semibold">
                {formatPrice(product.price_cents, product.currency)}
              </span>
              <span
                className={
                  "rounded-full px-2.5 py-1 text-xs font-medium " +
                  (stock.tone === "ok"
                    ? "bg-secondary text-secondary-foreground"
                    : stock.tone === "warn"
                      ? "bg-accent/15 text-accent-foreground"
                      : "bg-destructive/10 text-destructive")
                }
              >
                {stock.label}
              </span>
            </div>

            {product.description ? (
              <p className="mt-6 text-muted-foreground">{product.description}</p>
            ) : null}

            <dl className="mt-6 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm">
              {isCbd && product.cbd_percent !== null ? (
                <SpecRow label="Taux de CBD" value={`${product.cbd_percent}%`} />
              ) : null}
              {isCbd && product.thc_percent !== null ? (
                <SpecRow label="Taux de THC" value={`${product.thc_percent}%`} />
              ) : null}
              {isEliquide && product.nicotine_mg !== null ? (
                <SpecRow
                  label="Nicotine"
                  value={`${product.nicotine_mg} mg/ml`}
                />
              ) : null}
              <SpecRow label="Référence" value={product.slug} />
            </dl>

            {product.stock_status !== "out_of_stock" ? (
              <div className="mt-6 flex items-center gap-3">
                <div className="inline-flex items-center rounded-md border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 text-sm hover:bg-secondary"
                    aria-label="Diminuer la quantité"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQty((q) => Math.min(product.stock, q + 1))
                    }
                    className="px-3 py-2 text-sm hover:bg-secondary"
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => {
                    cart.add(
                      {
                        productId: product.id,
                        slug: product.slug,
                        name: product.name,
                        priceCents: product.price_cents,
                        photo: product.photos?.[0] ?? null,
                        maxStock: product.stock,
                      },
                      qty,
                    );
                    toast.success("Ajouté au panier", {
                      description: `${qty} × ${product.name}`,
                    });
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Ajouter au panier
                </button>
              </div>
            ) : (
              <button
                disabled
                className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground opacity-50"
              >
                Produit épuisé
              </button>
            )}

            {product.coa_url ? (
              <a
                href={product.coa_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <FileText className="h-4 w-4" /> Certificat d'analyse (COA)
              </a>
            ) : null}

            {product.health_warnings ? (
              <div className="mt-6 flex gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Avertissement sanitaire</p>
                  <p className="mt-1 text-destructive/90">
                    {product.health_warnings}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}