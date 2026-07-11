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
  productByIdQueryOptions,
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
  const flavors = useMemo(
    () => parseFlavors(product?.flavors),
    [product?.flavors],
  );
  const [flavor, setFlavor] = useState<string | null>(() => {
    const first = flavors.find((f) => f.stock > 0);
    return first?.name ?? null;
  });
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
  const hasFlavors = flavors.length > 0;
  const selectedFlavor = hasFlavors
    ? flavors.find((f) => f.name === flavor) ?? null
    : null;
  const flavorOK = !hasFlavors || (selectedFlavor !== null && selectedFlavor.stock > 0);
  const maxStock = hasFlavors
    ? Math.min(product.stock, selectedFlavor?.stock ?? 0)
    : product.stock;
  const photo = selectedFlavor?.photo ?? product.photos?.[0] ?? null;

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
                        photo: selectedFlavor?.photo ?? product.photos?.[0] ?? null,
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
  // Fallback : si la table product_variants n'a pas de mapping
  // boosters_per_nicotine, on suppose la règle standard 1 booster = 3 mg.
  const boostersFor = useMemo(() => {
    return (mg: number) => {
      if (!variant || variant.volume_ml === 10 || mg <= 0) return 0;
      const n = boostersNeeded(variant, mg);
      if (n > 0) return n;
      return Math.ceil(mg / 3);
    };
  }, [variant]);
  const displayPrice = useMemo(() => {
    if (!variant) return null;
    const nic = nicotine ?? 0;
    const n = boostersFor(nic);
    if (variant.volume_ml === 10 || !n || !boosterPrice) return variant.price_cents;
    return variant.price_cents + n * boosterPrice;
  }, [variant, nicotine, boosterPrice, boostersFor]);
  const boostersCount =
    variant && nicotine !== null ? boostersFor(nicotine) : 0;

  const effectiveStock = variant
    ? hasFlavors
      ? Math.min(variant.stock, selectedFlavor?.stock ?? 0)
      : variant.stock
    : 0;

  // Photo dynamique : la variante prime, puis le goût, sinon photo principale.
  const photo =
    (variant as { photo_url?: string | null } | null)?.photo_url ??
    selectedFlavor?.photo ??
    product.photos?.[0] ??
    null;

  // Capacité physique du flacon : au-delà, le taux reste sélectionnable mais
  // on affiche une alerte + une alternative cliquable.
  const variantCapacity =
    variant && typeof (variant as { max_boosters?: number | null }).max_boosters === "number"
      ? (variant as { max_boosters: number }).max_boosters
      : null;
  const exceedsCapacity =
    variant !== null &&
    variant.volume_ml !== 10 &&
    variantCapacity !== null &&
    boostersCount > variantCapacity;
  const achievableMg = useMemo(() => {
    if (!variant || variantCapacity === null) return null;
    const bpn = (variant.boosters_per_nicotine as Record<string, number> | null) ?? {};
    const feasible = (variant.available_nicotine_mg ?? [])
      .filter((mg) => mg === 0 || (bpn[String(mg)] ?? 0) <= variantCapacity);
    return feasible.length > 0 ? Math.max(...feasible) : 0;
  }, [variant, variantCapacity]);
  const alternative200 = useMemo(() => {
    if (!exceedsCapacity || nicotine === null) return null;
    const v200 = availableVolumes.find(
      (v) =>
        v.volume_ml === 200 &&
        v.id !== variant?.id &&
        (v.available_nicotine_mg ?? []).includes(nicotine),
    );
    if (!v200) return null;
    const cap = (v200 as { max_boosters?: number | null }).max_boosters ?? null;
    const needed =
      ((v200.boosters_per_nicotine as Record<string, number> | null) ?? {})[
        String(nicotine)
      ] ?? 0;
    if (cap !== null && needed > cap) return null;
    return v200;
  }, [exceedsCapacity, nicotine, availableVolumes, variant]);

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

            {variant && (
              <p className="mt-2 text-xs text-muted-foreground">
                Flacon {variant.volume_ml} ml :{" "}
                {formatPrice(variant.price_cents, product.currency)}
                {boostersCount > 0 && boosterPrice !== null ? (
                  <>
                    {" "}
                    + {boostersCount} booster{boostersCount > 1 ? "s" : ""}
                    {nicotine !== null ? ` (${nicotine} mg)` : ""} ×{" "}
                    {formatPrice(boosterPrice, product.currency)} ={" "}
                    <strong className="text-foreground">
                      {formatPrice(
                        variant.price_cents + boostersCount * boosterPrice,
                        product.currency,
                      )}
                    </strong>
                  </>
                ) : nicotine !== null && nicotine === 0 && variant.volume_ml !== 10 ? (
                  <> · sans booster</>
                ) : null}
              </p>
            )}

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
                          {v.nicotine_type === "sel" ? " · sel de nicotine" : ""}
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
                      const nBoost =
                        variant && variant.volume_ml !== 10 && mg > 0
                          ? boostersFor(mg)
                          : 0;
                      const surcharge =
                        nBoost > 0 && boosterPrice !== null
                          ? nBoost * boosterPrice
                          : 0;
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
                          className={`flex min-w-[64px] flex-col items-center rounded-md border px-3 py-2 text-sm leading-tight transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          } ${disabled ? "opacity-40" : ""}`}
                        >
                          <span>{mg} mg</span>
                          {surcharge > 0 ? (
                            <span className="mt-0.5 text-[10px] font-medium text-accent-foreground/80">
                              +{formatPrice(surcharge, product.currency)}
                            </span>
                          ) : null}
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
                  {variant && nicotine !== null && nicotineOK && exceedsCapacity && (
                    <div className="mt-3 space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                      <p>
                        Ce flacon de <strong>{variant.volume_ml} ml</strong> ne
                        peut contenir que <strong>{variantCapacity}</strong>{" "}
                        booster{(variantCapacity ?? 0) > 1 ? "s" : ""}, soit un
                        maximum réel de{" "}
                        <strong>{achievableMg ?? 0} mg</strong> de nicotine, et
                        non <strong>{nicotine} mg</strong>.
                      </p>
                      {alternative200 ? (
                        <button
                          type="button"
                          onClick={() => setSelectedVariantId(alternative200.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-500/30"
                        >
                          Passer à un flacon de 200 ml à la place
                        </button>
                      ) : (
                        <p>
                          Ou complétez avec un{" "}
                          <Link
                            to="/produit/$slug"
                            params={{ slug: "flacon-vide-200ml" }}
                            className="underline"
                          >
                            flacon vide 200 ml supplémentaire (1,90 €)
                          </Link>{" "}
                          pour diluer davantage votre e-liquide.
                        </p>
                      )}
                    </div>
                  )}
                  {variant &&
                    nicotine !== null &&
                    nicotineOK &&
                    !exceedsCapacity &&
                    variant.volume_ml !== 10 &&
                    boostersCount > 0 &&
                    boosterPrice !== null && (
                      <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                        <p className="text-foreground">
                          {nicotine} mg de nicotine sur ce flacon de{" "}
                          {variant.volume_ml} ml ={" "}
                          <strong>{boostersCount}</strong> booster
                          {boostersCount > 1 ? "s" : ""} ×{" "}
                          {formatPrice(boosterPrice, product.currency)} ={" "}
                          <strong>
                            {formatPrice(
                              boostersCount * boosterPrice,
                              product.currency,
                            )}
                          </strong>
                        </p>
                        <p className="mt-1">
                          Prix flacon :{" "}
                          {formatPrice(variant.price_cents, product.currency)} ·
                          Boosters :{" "}
                          {formatPrice(
                            boostersCount * boosterPrice,
                            product.currency,
                          )}{" "}
                          · Total unitaire :{" "}
                          <strong className="text-foreground">
                            {formatPrice(
                              variant.price_cents + boostersCount * boosterPrice,
                              product.currency,
                            )}
                          </strong>
                        </p>
                      </div>
                    )}
                </div>

                {hasFlavors && (
                  <FlavorPicker
                    flavors={flavors}
                    selected={flavor}
                    onSelect={setFlavor}
                  />
                )}
              </div>
            )}

            {variant && effectiveStock > 0 ? (
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
                      setQty((q) => Math.min(effectiveStock, q + 1))
                    }
                    className="px-3 py-2 text-sm hover:bg-secondary"
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>
                <button
                  disabled={nicotine === null || !nicotineOK || !flavorOK}
                  onClick={() => {
                    if (nicotine === null || !nicotineOK || !flavorOK) return;
                    const flavorSuffix = hasFlavors && flavor ? `, ${flavor}` : "";
                    const displayName = `${product.name} — ${variant.volume_ml} ml, ${nicotine} mg${flavorSuffix}`;
                    const boosters = boostersFor(nicotine);
                    const unitPrice =
                      variant.volume_ml === 10 || !boosters || !boosterPrice
                        ? variant.price_cents
                        : variant.price_cents + boosters * boosterPrice;
                    cart.add(
                      {
                        key: `${product.id}:${variant.id}:${nicotine}:${flavor ?? ""}`,
                        productId: product.id,
                        variantId: variant.id,
                        volumeMl: variant.volume_ml,
                        nicotineMg: nicotine,
                        flavor: hasFlavors ? flavor : null,
                        slug: product.slug,
                        name: displayName,
                        priceCents: unitPrice,
                        baseUnitPriceCents: variant.price_cents,
                        boostersCount: boosters,
                        boosterUnitPriceCents:
                          boosters > 0 ? boosterPrice : null,
                        photo: photo,
                        maxStock: effectiveStock,
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
                    : hasFlavors && !flavor
                    ? "Choisir un goût"
                    : "Ajouter au panier"}
                </button>
              </div>
            ) : variant ? (
              <button
                disabled
                className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground opacity-50"
              >
                {hasFlavors && selectedFlavor && selectedFlavor.stock <= 0
                  ? "Goût épuisé"
                  : "Volume épuisé"}
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
