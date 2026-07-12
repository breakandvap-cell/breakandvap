import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  STOCK_LABELS,
  formatPrice,
  productsQueryOptions,
  type ProductRow,
} from "@/lib/products";
import {
  shopCategoriesQueryOptions,
  shopSubcategoriesQueryOptions,
  type ShopCategory,
  type ShopSubcategory,
} from "@/lib/categories.functions";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { CategoryTileFx } from "@/components/category-tile-fx";

const searchSchema = z.object({
  categorie: fallback(z.string(), "").default(""),
  sous_categorie: fallback(z.string(), "").default(""),
  tout: fallback(z.boolean(), false).default(false),
});

export const Route = createFileRoute("/boutique")({
  validateSearch: zodValidator(searchSchema),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(shopCategoriesQueryOptions());
    context.queryClient.ensureQueryData(shopSubcategoriesQueryOptions());
    context.queryClient.ensureQueryData(productsQueryOptions());
  },
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

const KNOWN_CATEGORY_KEYS = new Set([
  "cbd",
  "e_liquide",
  "accessoire_vape",
  "accessoire_cbd",
]);

function BoutiquePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: categories } = useSuspenseQuery(shopCategoriesQueryOptions());
  const { data: subcategories } = useSuspenseQuery(shopSubcategoriesQueryOptions());
  const { data: allProducts } = useSuspenseQuery(productsQueryOptions());

  const activeCat = categories.find(
    (c) => c.is_active && c.key === search.categorie,
  );
  const activeCatSubs = activeCat
    ? subcategories.filter((s) => s.category_id === activeCat.id && s.is_active)
    : [];
  const activeSub = activeCat
    ? activeCatSubs.find((s) => s.slug === search.sous_categorie)
    : undefined;

  const showAll = search.tout;

  // Étape courante
  let stage: "categories" | "subcategories" | "products" = "categories";
  if (showAll) stage = "products";
  else if (activeCat && activeCatSubs.length > 0 && !activeSub) stage = "subcategories";
  else if (activeCat) stage = "products";

  const filteredProducts = allProducts.filter((p) => {
    if (showAll) return true;
    if (activeCat) {
      if (!KNOWN_CATEGORY_KEYS.has(activeCat.key)) return false;
      if (p.category !== activeCat.key) return false;
      if (activeSub) {
        return (
          (p.subcategory ?? "").trim().toLowerCase() ===
          activeSub.name.trim().toLowerCase()
        );
      }
      return true;
    }
    return true;
  });

  const goto = (opts: {
    categorie?: string;
    sous_categorie?: string;
    tout?: boolean;
  }) =>
    navigate({
      to: ".",
      search: {
        categorie: opts.categorie ?? "",
        sous_categorie: opts.sous_categorie ?? "",
        tout: opts.tout ?? false,
      },
    });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Catalogue
          </p>
          <h1 className="text-4xl leading-tight sm:text-5xl">
            {stage === "categories"
              ? "Explorez nos catégories"
              : activeCat && stage === "subcategories"
                ? activeCat.name
                : activeSub
                  ? activeSub.name
                  : activeCat
                    ? activeCat.name
                    : "Tout le catalogue"}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            {stage === "categories"
              ? "Sélectionnez une famille pour parcourir la sélection, ou affichez l'ensemble du catalogue."
              : activeSub?.description ||
                activeCat?.description ||
                "Sélection contrôlée par les équipes de nos boutiques. Réservé aux personnes majeures."}
          </p>
        </div>

        <Breadcrumb
          activeCat={activeCat ?? null}
          activeSub={activeSub ?? null}
          showAll={showAll}
          onHome={() => goto({})}
          onCategory={(k) => goto({ categorie: k })}
        />

        <div className="mt-2 mb-8 flex flex-wrap items-center gap-3 text-xs">
          {!showAll && (
            <button
              onClick={() => goto({ tout: true })}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Voir tout le catalogue →
            </button>
          )}
          {showAll && (
            <button
              onClick={() => goto({})}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← Revenir aux catégories
            </button>
          )}
        </div>

        {stage === "categories" && (
          <CategoryTiles categories={categories} onPick={(k) => goto({ categorie: k })} />
        )}

        {stage === "subcategories" && activeCat && (
          <SubcategoryTiles
            subcategories={activeCatSubs}
            onPick={(slug) =>
              goto({ categorie: activeCat.key, sous_categorie: slug })
            }
          />
        )}

        {stage === "products" && (
          <>
            {filteredProducts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Aucun produit disponible pour le moment.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    categoryName={
                      categories.find((c) => c.key === p.category)?.name ??
                      p.category
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Breadcrumb({
  activeCat,
  activeSub,
  showAll,
  onHome,
  onCategory,
}: {
  activeCat: ShopCategory | null;
  activeSub: ShopSubcategory | null;
  showAll: boolean;
  onHome: () => void;
  onCategory: (key: string) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <button className="hover:text-foreground" onClick={onHome}>
        Boutique
      </button>
      {showAll && <span className="mx-1">›</span>}
      {showAll && <span className="text-foreground">Tout le catalogue</span>}
      {activeCat && (
        <>
          <span className="mx-1">›</span>
          <button
            className={activeSub ? "hover:text-foreground" : "text-foreground"}
            onClick={() => onCategory(activeCat.key)}
          >
            {activeCat.name}
          </button>
        </>
      )}
      {activeSub && (
        <>
          <span className="mx-1">›</span>
          <span className="text-foreground">{activeSub.name}</span>
        </>
      )}
    </nav>
  );
}

function CategoryTiles({
  categories,
  onPick,
}: {
  categories: ShopCategory[];
  onPick: (key: string) => void;
}) {
  const visible = categories.filter(
    (c) => c.is_active && KNOWN_CATEGORY_KEYS.has(c.key),
  );
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {visible.map((c) => (
        <button
          key={c.id}
          onClick={() => onPick(c.key)}
          className="group relative flex h-64 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-card text-left transition-transform hover:-translate-y-0.5"
        >
          {c.image_url ? (
            <img
              src={c.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary to-background" />
          )}
          <CategoryTileFx
            variant={c.key as "cbd" | "e_liquide" | "accessoire_vape" | "accessoire_cbd"}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
          <div className="relative z-10 m-3 rounded-xl bg-black/55 p-5 text-white backdrop-blur-sm ring-1 ring-white/10">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-80">
              Catégorie
            </p>
            <h2
              className="mt-1 text-2xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {c.name}
            </h2>
            {c.description && (
              <p className="mt-1 max-w-sm text-sm opacity-90 line-clamp-2">
                {c.description}
              </p>
            )}
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
              Découvrir →
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function SubcategoryTiles({
  subcategories,
  onPick,
}: {
  subcategories: ShopSubcategory[];
  onPick: (slug: string) => void;
}) {
  if (subcategories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Aucune sous-catégorie pour l'instant.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {subcategories.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.slug)}
          className="group relative flex h-52 flex-col justify-end overflow-hidden rounded-xl border border-border bg-card text-left transition-transform hover:-translate-y-0.5"
        >
          {s.image_url ? (
            <img
              src={s.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary to-background" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
          <div className="relative p-5 text-white">
            <h3
              className="text-xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {s.name}
            </h3>
            {s.description && (
              <p className="mt-1 text-xs opacity-90 line-clamp-2">
                {s.description}
              </p>
            )}
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium">
              Explorer →
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProductCard({
  product,
  categoryName,
}: {
  product: ProductRow;
  categoryName: string;
}) {
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
            {categoryName}
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