import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STOCK_LABELS,
  formatPrice,
  productsQueryOptions,
  type ProductCategory,
  type ProductRow,
} from "@/lib/products";
import { SiteFooter, SiteHeader } from "@/components/site-header";

const searchSchema = z.object({
  categorie: z.enum(["cbd", "e_liquide", "accessoire"]).optional(),
});

export const Route = createFileRoute("/boutique")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({ categorie: search.categorie }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(productsQueryOptions(deps.categorie)),
  head: () => ({
    meta: [
      { title: "Boutique — CBD, e-liquides & accessoires | Break and Vap" },
      {
        name: "description",
        content:
          "Découvrez notre catalogue CBD, e-liquides et accessoires de vape. Fiches conformes, stocks à jour, expédition depuis la Bourgogne.",
      },
    ],
  }),
  component: BoutiquePage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">
      Impossible de charger le catalogue : {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Aucun produit trouvé.</div>
  ),
});

function BoutiquePage() {
  const { categorie } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: products } = useSuspenseQuery(productsQueryOptions(categorie));

  const setCategory = (next?: ProductCategory) =>
    navigate({ search: (prev) => ({ ...prev, categorie: next }) });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Catalogue
          </p>
          <h1 className="text-4xl leading-tight sm:text-5xl">
            Notre sélection
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Produits contrôlés et sélectionnés par les équipes de nos boutiques.
            Vente strictement réservée aux personnes majeures.
          </p>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <FilterPill active={!categorie} onClick={() => setCategory(undefined)}>
            Tout
          </FilterPill>
          {CATEGORY_ORDER.map((cat) => (
            <FilterPill
              key={cat}
              active={categorie === cat}
              onClick={() => setCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </FilterPill>
          ))}
        </div>

        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Aucun produit disponible dans cette catégorie pour le moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-4 py-1.5 text-sm transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function ProductCard({ product }: { product: ProductRow }) {
  const stock = STOCK_LABELS[product.stock_status];
  const photo = product.photos?.[0];

  return (
    <Link
      to="/produit/$slug"
      params={{ slug: product.slug }}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden bg-secondary">
        {photo ? (
          <img
            src={photo}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Sans visuel
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABELS[product.category]}
          </span>
          <StockBadge tone={stock.tone}>{stock.label}</StockBadge>
        </div>
        <h3
          className="text-base leading-snug"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {product.name}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-semibold">
            {formatPrice(product.price_cents, product.currency)}
          </span>
          <span className="text-xs text-muted-foreground group-hover:text-foreground">
            Voir →
          </span>
        </div>
      </div>
    </Link>
  );
}

function StockBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const style =
    tone === "ok"
      ? "bg-secondary text-secondary-foreground"
      : tone === "warn"
        ? "bg-accent/15 text-accent-foreground"
        : "bg-destructive/10 text-destructive";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style}`}>
      {children}
    </span>
  );
}