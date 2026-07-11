import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import {
  CATEGORY_LABELS,
  NICOTINE_STEPS_MG_10ML,
  NICOTINE_STEPS_MG_BOOSTER,
  STOCK_LABELS,
  formatPrice,
  productBySlugQueryOptions,
  productVariantsQueryOptions,
  nicotineBoosterQueryOptions,
  computeVariantPrice,
  boostersNeeded,
  parseFlavors,
  type ProductFlavor,
  type ProductRow,
} from "@/lib/products";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/produit/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(
      productBySlugQueryOptions(params.slug),
    );
    if (!product) throw notFound();
    if (product.category === "e_liquide") {
      await Promise.all([
        context.queryClient.ensureQueryData(
          productVariantsQueryOptions(product.id),
        ),
        context.queryClient.ensureQueryData(nicotineBoosterQueryOptions()),
      ]);
    }
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
  const isEliquide = product.category === "e_liquide";
  const isCbd = product.category === "cbd";
  if (isEliquide) {
    return (
      <EliquideDetail
        product={product}
        qty={qty}
        setQty={setQty}
        cart={cart}
        router={router}
      />
    );
  }
  const stock = STOCK_LABELS[product.stock_status];
  const photo = product.photos?.[0];
  const flavors = parseFlavors(product.flavors);
  const hasFlavors = flavors.length > 0;
  const [flavor, setFlavor] = useState<string | null>(() => {
    const first = flavors.find((f) => f.stock > 0);
    return first?.name ?? null;
  });
  const selectedFlavor = hasFlavors
    ? flavors.find((f) => f.name === flavor) ?? null
    : null;
  const flavorOK = !hasFlavors || (selectedFlavor !== null && selectedFlavor.stock > 0);
  const maxStock = hasFlavors
    ? Math.min(product.stock, selectedFlavor?.stock ?? 0)
    : product.stock;

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
                {hasFlavors && (
                  <FlavorPicker
                    flavors={flavors}
                    selected={flavor}
                    onSelect={setFlavor}
                  />
                )}
              </div>
            ) : null}

            {product.stock_status !== "out_of_stock" ? (
              <div className="mt-4 flex items-center gap-3">
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
                      setQty((q) => Math.min(maxStock, q + 1))
                    }
                    className="px-3 py-2 text-sm hover:bg-secondary"
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>
                <button
                  disabled={!flavorOK}
                  onClick={() => {
                    if (!flavorOK) return;
                    const displayName = hasFlavors && flavor
                      ? `${product.name} — ${flavor}`
                      : product.name;
                    cart.add(
                      {
                        key: hasFlavors && flavor
                          ? `${product.id}:flavor:${flavor}`
                          : product.id,
                        productId: product.id,
                        slug: product.slug,
                        name: displayName,
                        flavor: hasFlavors ? flavor : null,
                        priceCents: product.price_cents,
                        photo: product.photos?.[0] ?? null,
                        maxStock,
                      },
                      qty,
                    );
                    toast.success("Ajouté au panier", {
                      description: `${qty} × ${displayName}`,
                    });
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {hasFlavors && !flavor ? "Choisir un goût" : "Ajouter au panier"}
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

function EliquideDetail({
  product,
  qty,
  setQty,
  cart,
  router,
}: {
  product: ProductRow;
  qty: number;
  setQty: (fn: (q: number) => number) => void;
  cart: ReturnType<typeof useCart>;
  router: ReturnType<typeof useRouter>;
}) {
  const { data: variants } = useSuspenseQuery(
    productVariantsQueryOptions(product.id),
  );
  const { data: booster } = useSuspenseQuery(nicotineBoosterQueryOptions());
  const photo = product.photos?.[0];
  const flavors = useMemo(() => parseFlavors(product.flavors), [product.flavors]);
  const hasFlavors = flavors.length > 0;
  const [flavor, setFlavor] = useState<string | null>(() => {
    const first = flavors.find((f) => f.stock > 0);
    return first?.name ?? null;
  });
  const selectedFlavor = hasFlavors
    ? flavors.find((f) => f.name === flavor) ?? null
    : null;
  const flavorOK = !hasFlavors || (selectedFlavor !== null && selectedFlavor.stock > 0);

  const availableVolumes = useMemo(
    () => [...variants].sort((a, b) => a.volume_ml - b.volume_ml),
    [variants],
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => {
      const firstInStock = availableVolumes.find((v) => v.stock > 0);
      return firstInStock?.id ?? availableVolumes[0]?.id ?? null;
    },
  );
  const [nicotine, setNicotine] = useState<number | null>(null);

  const variant =
    availableVolumes.find((v) => v.id === selectedVariantId) ?? null;
  const nicotineChoices = useMemo(() => {
    if (!variant) return NICOTINE_STEPS_MG_BOOSTER;
    return variant.volume_ml === 10
      ? NICOTINE_STEPS_MG_10ML
      : NICOTINE_STEPS_MG_BOOSTER;
  }, [variant]);
  const allowedForVariant = useMemo(
    () => new Set<number>(variant?.available_nicotine_mg ?? []),
    [variant],
  );
  const nicotineOK =
    nicotine !== null && variant !== null && allowedForVariant.has(nicotine);

  const boosterPrice =
    booster && booster.is_published ? booster.price_cents : null;
  const displayPrice = useMemo(() => {
    if (!variant) return null;
    const nic = nicotine ?? 0;
    return computeVariantPrice(variant, nic, boosterPrice);
  }, [variant, nicotine, boosterPrice]);
  const boostersCount =
    variant && nicotine !== null && variant.volume_ml !== 10
      ? boostersNeeded(variant, nicotine)
      : 0;

  const effectiveStock = variant
    ? hasFlavors
      ? Math.min(variant.stock, selectedFlavor?.stock ?? 0)
      : variant.stock
    : 0;

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

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-semibold">
                {variant && displayPrice !== null
                  ? formatPrice(displayPrice, product.currency)
                  : availableVolumes.length > 0
                  ? `à partir de ${formatPrice(
                      Math.min(...availableVolumes.map((v) => v.price_cents)),
                      product.currency,
                    )}`
                  : formatPrice(product.price_cents, product.currency)}
              </span>
              {variant && boostersCount > 0 && boosterPrice !== null && (
                <span className="text-xs text-muted-foreground">
                  ({formatPrice(variant.price_cents, product.currency)} base + {boostersCount} × {formatPrice(boosterPrice, product.currency)} booster)
                </span>
              )}
            </div>

            {product.description ? (
              <p className="mt-6 text-muted-foreground">{product.description}</p>
            ) : null}

            {availableVolumes.length === 0 ? (
              <div className="mt-6 rounded-md border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                Ce e-liquide n'a pas encore de variantes de volume disponibles.
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Volume du flacon
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableVolumes.map((v) => {
                      const outOfStock = v.stock <= 0;
                      const selected = v.id === selectedVariantId;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => {
                            setSelectedVariantId(v.id);
                            setNicotine((n) => {
                              if (n === null) return n;
                              const allowed = new Set<number>(
                                v.available_nicotine_mg ?? [],
                              );
                              return allowed.has(n) ? n : null;
                            });
                          }}
                          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          } ${outOfStock ? "line-through opacity-50" : ""}`}
                        >
                          {v.volume_ml} ml
                          {outOfStock && " (épuisé)"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Taux de nicotine souhaité
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {nicotineChoices.map((mg) => {
                      const disabled = !variant || !allowedForVariant.has(mg);
                      const selected = nicotine === mg;
                      return (
                        <button
                          key={mg}
                          type="button"
                          disabled={disabled}
                          onClick={() => setNicotine(mg)}
                          title={
                            disabled
                              ? `Indisponible en ${variant?.volume_ml ?? "?"} ml`
                              : undefined
                          }
                          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          } ${disabled ? "opacity-40" : ""}`}
                        >
                          {mg} mg
                        </button>
                      );
                    })}
                  </div>
                  {variant && nicotine !== null && !nicotineOK && (
                    <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                      Ce taux de {nicotine} mg n'est pas disponible en{" "}
                      {variant.volume_ml} ml pour ce produit. Optez pour un
                      flacon plus grand, ou complétez avec un{" "}
                      <Link
                        to="/boutique"
                        search={{ categorie: "accessoire_vape" as const }}
                        className="underline"
                      >
                        flacon vide (Accessoires Vape)
                      </Link>
                      .
                    </div>
                  )}
                </div>
              </div>
            )}

            {variant && variant.stock > 0 ? (
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
                      setQty((q) => Math.min(variant.stock, q + 1))
                    }
                    className="px-3 py-2 text-sm hover:bg-secondary"
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>
                <button
                  disabled={nicotine === null || !nicotineOK}
                  onClick={() => {
                    if (nicotine === null || !nicotineOK) return;
                    const displayName = `${product.name} — ${variant.volume_ml} ml, ${nicotine} mg`;
                    const unitPrice = computeVariantPrice(variant, nicotine, boosterPrice);
                    cart.add(
                      {
                        key: `${product.id}:${variant.id}:${nicotine}`,
                        productId: product.id,
                        variantId: variant.id,
                        volumeMl: variant.volume_ml,
                        nicotineMg: nicotine,
                        slug: product.slug,
                        name: displayName,
                        priceCents: unitPrice,
                        photo: product.photos?.[0] ?? null,
                        maxStock: variant.stock,
                      },
                      qty,
                    );
                    toast.success("Ajouté au panier", {
                      description: `${qty} × ${displayName}`,
                    });
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {nicotine === null
                    ? "Choisir un taux de nicotine"
                    : "Ajouter au panier"}
                </button>
              </div>
            ) : variant ? (
              <button
                disabled
                className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground opacity-50"
              >
                Volume épuisé
              </button>
            ) : null}

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
function FlavorPicker({
  flavors,
  selected,
  onSelect,
}: {
  flavors: ProductFlavor[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="w-full">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Goût
      </p>
      <div className="flex flex-wrap gap-2">
        {flavors.map((f) => {
          const outOfStock = f.stock <= 0;
          const isSelected = f.name === selected;
          return (
            <button
              key={f.name}
              type="button"
              disabled={outOfStock}
              onClick={() => onSelect(f.name)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              } ${outOfStock ? "line-through opacity-50" : ""}`}
            >
              {f.name}
              {outOfStock && " (épuisé)"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
