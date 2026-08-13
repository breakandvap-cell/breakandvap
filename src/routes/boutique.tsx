import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { activePromotionsQueryOptions } from "@/lib/promotions-pricing.query";
import { bestPromotionFor } from "@/lib/promotions-pricing";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  STOCK_LABELS,
  allVariantVolumesQueryOptions,
  variantPriceSummaryQueryOptions,
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
import { buildShopCollectionJsonLd } from "@/lib/shop-structured-data";
import { buildBreadcrumbJsonLd, HOME_CRUMB } from "@/lib/breadcrumb-jsonld";
import { CategoryTileFx } from "@/components/category-tile-fx";
import {
  ActiveFilterChips,
  FiltersPanelBody,
  MobileFiltersToggle,
  SortSelect,
  type FilterPatch,
} from "@/components/shop-filters";
import {
  applyShopFilters,
  buildFacets,
  groupProductsByRange,
  isSortValue,
  sortProducts,
  type SortValue,
  type ShopFilters,
} from "@/lib/product-search";
import { AppErrorBoundary } from "@/components/error-boundary";
import { CustomMixConfigurator } from "@/components/custom-mix-configurator";

type ShopSearch = z.infer<typeof searchSchema>;

const searchSchema = z.object({
  categorie: fallback(z.string(), "").default(""),
  sous_categorie: fallback(z.string(), "").default(""),
  tout: fallback(z.boolean(), false).default(false),
  q: fallback(z.string(), "").default(""),
  marques: fallback(z.string().array(), []).default([]),
  gammes: fallback(z.string().array(), []).default([]),
  gouts: fallback(z.string().array(), []).default([]),
  volumes: fallback(z.number().array(), []).default([]),
  en_stock: fallback(z.boolean(), false).default(false),
  // 0 = pas de borne définie
  prix_min: fallback(z.number(), 0).default(0),
  prix_max: fallback(z.number(), 0).default(0),
  tri: fallback(z.string(), "pertinence").default("pertinence"),
});

export const Route = createFileRoute("/boutique")({
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) => {
    context.queryClient.ensureQueryData(shopCategoriesQueryOptions());
    context.queryClient.ensureQueryData(shopSubcategoriesQueryOptions());
    context.queryClient.ensureQueryData(allVariantVolumesQueryOptions());
    const products = await context.queryClient.ensureQueryData(productsQueryOptions());
    return {
      items: products.slice(0, 60).map((p) => ({
        name: p.name,
        slug: p.slug,
        photo: p.photos?.[0] ?? null,
        priceCents: p.price_cents,
        currency: p.currency ?? "EUR",
        outOfStock: p.stock_status === "out_of_stock",
        brand: p.brand,
      })),
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Boutique — CBD, e-liquides & accessoires | Break and Vap" },
      {
        name: "description",
        content:
          "Découvrez notre catalogue CBD, e-liquides et accessoires de vape. Fiches conformes, stocks à jour, expédition depuis la Bourgogne.",
      },
      {
        property: "og:title",
        content: "Boutique CBD, e-liquides & accessoires — Break and Vap",
      },
      {
        property: "og:description",
        content:
          "Plus de 130 références CBD, e-liquides et accessoires de vape, sélectionnées par nos boutiques du Creusot et de Montceau-les-Mines.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://breakandvap.lovable.app/boutique" },
    ],
    links: [{ rel: "canonical", href: "https://breakandvap.lovable.app/boutique" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildBreadcrumbJsonLd([HOME_CRUMB, { name: "Boutique", path: "/boutique" }]),
        ),
      },
      ...(loaderData?.items?.length
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify(buildShopCollectionJsonLd(loaderData.items)),
            },
          ]
        : []),
    ],
  }),
  component: () => (
    <AppErrorBoundary boundary="boutique">
      <BoutiquePage />
    </AppErrorBoundary>
  ),
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
  const { data: variantVolumes } = useSuspenseQuery(allVariantVolumesQueryOptions());
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const filters: ShopFilters = {
    q: search.q,
    marques: search.marques,
    gammes: search.gammes,
    gouts: search.gouts,
    volumes: search.volumes,
    en_stock: search.en_stock,
    prix_min: search.prix_min > 0 ? search.prix_min : null,
    prix_max: search.prix_max > 0 ? search.prix_max : null,
  };
  const hasQuery = search.q.trim().length > 0;

  // Étape courante
  let stage: "categories" | "subcategories" | "products" = "categories";
  if (showAll || hasQuery) stage = "products";
  else if (activeCat && activeCatSubs.length > 0 && !activeSub) stage = "subcategories";
  else if (activeCat) stage = "products";
  // La sous-catégorie « Mon Mix » ouvre le configurateur DIY.
  const isCustomMix =
    !showAll && !hasQuery && activeSub?.slug === "mon-mix";

  // 1) Périmètre catégorie / sous-catégorie
  const scopedProducts = useMemo(
    () =>
      allProducts.filter((p) => {
        if (hasQuery && !showAll && !activeCat) return true;
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
      }),
    [allProducts, activeCat, activeSub, showAll, hasQuery],
  );

  // 2) Facettes calculées sur le périmètre, 3) filtres cumulés
  const facets = useMemo(
    () => buildFacets(scopedProducts, variantVolumes),
    [scopedProducts, variantVolumes],
  );
  const filteredProducts = useMemo(
    () => applyShopFilters(scopedProducts, filters, variantVolumes),
    [scopedProducts, filters, variantVolumes],
  );

  const sort: SortValue = isSortValue(search.tri) ? search.tri : "pertinence";
  const visibleProducts = useMemo(
    () => sortProducts(filteredProducts, sort, filters.q),
    [filteredProducts, sort, filters.q],
  );
  const setSort = (v: SortValue) =>
    navigate({ to: ".", search: (prev: ShopSearch) => ({ ...prev, tri: v }) });

  const { groups: rangeGroups, others: ungroupedProducts } = useMemo(
    () => groupProductsByRange(visibleProducts),
    [visibleProducts],
  );

  const goto = (opts: {
    categorie?: string;
    sous_categorie?: string;
    tout?: boolean;
  }) =>
    navigate({
      to: ".",
      search: (prev: ShopSearch) => ({
        ...prev,
        categorie: opts.categorie ?? "",
        sous_categorie: opts.sous_categorie ?? "",
        tout: opts.tout ?? false,
      }),
    });

  const patchFilters = (patch: FilterPatch) =>
    navigate({
      to: ".",
      search: (prev: ShopSearch) => ({
        ...prev,
        q: patch.q ?? prev.q,
        marques: patch.marques ?? prev.marques,
        gammes: patch.gammes ?? prev.gammes,
        gouts: patch.gouts ?? prev.gouts,
        volumes: patch.volumes ?? prev.volumes,
        en_stock: patch.en_stock ?? prev.en_stock,
        prix_min:
          patch.prix_min !== undefined ? (patch.prix_min ?? 0) : prev.prix_min,
        prix_max:
          patch.prix_max !== undefined ? (patch.prix_max ?? 0) : prev.prix_max,
      }),
    });

  const resetFilters = () =>
    navigate({
      to: ".",
      search: (prev: ShopSearch) => ({
        ...prev,
        q: "",
        marques: [],
        gammes: [],
        gouts: [],
        volumes: [],
        en_stock: false,
        prix_min: 0,
        prix_max: 0,
        tri: "pertinence",
      }),
    });

  const activeFilterCount =
    filters.marques.length +
    filters.gammes.length +
    filters.gouts.length +
    filters.volumes.length +
    (filters.en_stock ? 1 : 0) +
    (filters.prix_min != null || filters.prix_max != null ? 1 : 0);

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
          <CategoryTiles
            categories={categories}
            allProducts={allProducts}
            onPick={(k) => goto({ categorie: k })}
          />
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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <aside className="lg:w-64 lg:shrink-0">
              <MobileFiltersToggle
                open={filtersOpen}
                onToggle={() => setFiltersOpen((o) => !o)}
                count={activeFilterCount}
              />
              <div
                className={`${filtersOpen ? "mt-3 block" : "hidden"} rounded-lg border border-border bg-card p-4 lg:sticky lg:top-6 lg:mt-0 lg:block`}
              >
                <FiltersPanelBody
                  facets={facets}
                  filters={filters}
                  onChange={patchFilters}
                  onReset={resetFilters}
                  resultCount={filteredProducts.length}
                />
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {filteredProducts.length} produit
                    {filteredProducts.length > 1 ? "s" : ""}
                  </span>{" "}
                  correspondant{filteredProducts.length > 1 ? "s" : ""} à votre
                  sélection
                </p>
                <SortSelect value={sort} onChange={setSort} />
              </div>
              <ActiveFilterChips
                filters={filters}
                onChange={patchFilters}
                onReset={resetFilters}
              />
              {filteredProducts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                  Aucun produit ne correspond à votre recherche.
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-accent/60 hover:text-foreground"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {rangeGroups.map((g) => (
                    <section key={g.key}>
                      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                            {g.kind === "brand" ? "Marque" : "Gamme"}
                          </p>
                          <h2
                            className="text-xl sm:text-2xl"
                            style={{ fontFamily: "var(--font-serif)" }}
                          >
                            {g.title}
                          </h2>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {g.products.length} produits
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
                        {g.products.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            categoryName={
                              categories.find((c) => c.key === p.category)
                                ?.name ?? p.category
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}

                  {ungroupedProducts.length > 0 && (
                    <section>
                      {rangeGroups.length > 0 && (
                        <div className="mb-3 border-b border-border pb-2">
                          <h2
                            className="text-xl sm:text-2xl"
                            style={{ fontFamily: "var(--font-serif)" }}
                          >
                            Autres produits
                          </h2>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
                        {ungroupedProducts.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            categoryName={
                              categories.find((c) => c.key === p.category)
                                ?.name ?? p.category
                            }
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
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
  allProducts,
  onPick,
}: {
  categories: ShopCategory[];
  allProducts: ProductRow[];
  onPick: (key: string) => void;
}) {
  const visible = categories.filter(
    (c) => c.is_active && KNOWN_CATEGORY_KEYS.has(c.key),
  );
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
      {visible.map((c) => {
        const photos = allProducts
          .filter((p) => p.category === c.key && (p.photos?.length ?? 0) > 0)
          .map((p) => p.photos![0]);
        return (
        <button
          key={c.id}
          onClick={() => onPick(c.key)}
          className="group relative flex h-52 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-card text-left transition-transform hover:-translate-y-0.5 sm:h-64"
        >
          {c.image_url ? (
            <img
              src={c.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary to-background" />
          )}
          <CategoryTileFx
            variant={c.key as "cbd" | "e_liquide" | "accessoire_vape" | "accessoire_cbd"}
            photos={photos}
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
        );
      })}
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
      {subcategories.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.slug)}
          className="group relative flex h-40 flex-col justify-end overflow-hidden rounded-xl border border-border bg-card text-left transition-transform hover:-translate-y-0.5 sm:h-52"
        >
          {s.image_url ? (
            <img
              src={s.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              decoding="async"
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
  const { data: priceSummary } = useQuery(variantPriceSummaryQueryOptions());
  const { data: promotions } = useQuery(activePromotionsQueryOptions());
  const summary = priceSummary?.[product.id];
  const showFrom = (summary?.variantCount ?? 0) > 1 && summary?.minPriceCents != null;
  const displayCents = showFrom ? summary!.minPriceCents! : product.price_cents;
  const promo = bestPromotionFor(
    promotions,
    { productId: product.id, category: product.category },
    displayCents,
  );

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
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Sans visuel
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {categoryName}
          </span>
          <StockBadge tone={stock.tone}>{stock.label}</StockBadge>
        </div>
        <h3
          className="line-clamp-2 text-sm leading-snug sm:text-base"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {product.name}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 sm:pt-2">
          <span className="text-base font-semibold sm:text-lg">
            {showFrom && (
              <span className="mr-1 text-[11px] font-normal text-muted-foreground">
                à partir de
              </span>
            )}
            {promo ? (
              <>
                <span className="mr-1 text-xs font-normal text-muted-foreground line-through">
                  {formatPrice(promo.originalCents, product.currency)}
                </span>
                <span className="text-destructive">
                  {formatPrice(promo.finalCents, product.currency)}
                </span>
              </>
            ) : (
              formatPrice(displayCents, product.currency)
            )}
          </span>
          <span className="hidden text-xs text-muted-foreground group-hover:text-foreground sm:inline">
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
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${style}`}>
      {children}
    </span>
  );
}