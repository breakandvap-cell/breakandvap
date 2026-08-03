import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import {
  CATEGORY_LABELS,
  STOCK_LABELS,
  formatPrice,
  productBySlugQueryOptions,
  productVariantsQueryOptions,
  productByIdQueryOptions,
  parseFlavors,
  boosterProductsQueryOptions,
  boostersByType,
  boosterTypeLabel,
  normalizeBoosterTypeKey,
  emptyBottleCandidatesQueryOptions,
  sameRangeProductsQueryOptions,
  type EmptyBottleCandidate,
  type BoosterProduct,
  type ProductFlavor,
  type ProductRow,
} from "@/lib/products";
import {
  siteSettingsQueryOptions,
  computeNicotineRateMgPerMl,
  formatNicotineMg,
  DEFAULT_BOOSTER_CONFIG,
  type BoosterConfig,
} from "@/lib/site-settings.functions";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
        context.queryClient.ensureQueryData(boosterProductsQueryOptions()),
        context.queryClient.ensureQueryData(siteSettingsQueryOptions()),
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
    () => parseFlavors(product?.flavors).filter((f) => f.is_active !== false),
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
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <button
          onClick={() => router.history.back()}
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </button>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
          <div className="overflow-hidden rounded-lg border border-border bg-secondary">
            {photo ? (
              <img
                src={photo}
                alt={product.name}
                className="aspect-square w-full object-cover"
                loading="lazy"
                decoding="async"
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
              className="mt-2 text-2xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {product.name}
            </h1>
            <BrandRangeLine product={product} />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-semibold sm:text-3xl">
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
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-md border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-4 py-2.5 text-base hover:bg-secondary"
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
                    className="px-4 py-2.5 text-base hover:bg-secondary"
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
                  className="inline-flex min-w-0 flex-1 basis-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:basis-0"
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

        <RangeShowcase product={product} />
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
  const { data: boosterList } = useSuspenseQuery(boosterProductsQueryOptions());
  const { data: cfg } = useSuspenseQuery(siteSettingsQueryOptions());
  const boosterMap = useMemo(() => boostersByType(boosterList), [boosterList]);
  // Flacon vide par défaut au niveau du produit (repli si aucune contenance
  // n'a son propre flacon vide configuré).
  const productEmptyBottleId =
    (product as { empty_bottle_product_id?: string | null }).empty_bottle_product_id ?? null;
  const { data: productEmptyBottle } = useQuery(
    productByIdQueryOptions(productEmptyBottleId),
  );
  const flavors = useMemo(
    () => parseFlavors(product.flavors).filter((f) => f.is_active !== false),
    [product.flavors],
  );
  const hasFlavors = flavors.length > 0;
  const [flavor, setFlavor] = useState<string | null>(() => {
    const first = flavors.find((f) => f.stock > 0);
    return first?.name ?? null;
  });
  const selectedFlavor = hasFlavors
    ? flavors.find((f) => f.name === flavor) ?? null
    : null;
  const flavorOK = !hasFlavors || (selectedFlavor !== null && selectedFlavor.stock > 0);

  // Contenances = variantes de volume, une par ligne.
  // Une même contenance peut désormais exister en 3 exemplaires (normale/sel/
  // ice) : on regroupe par volume et on choisit une variante représentante
  // pour l'affichage (préférence : « normale »). La variante réellement
  // ajoutée au panier est recalculée plus bas selon le type sélectionné.
  const availableVolumes = useMemo(() => {
    const byVol = new Map<number, (typeof variants)[number]>();
    for (const v of variants) {
      const t = ((v as { nicotine_type?: string | null }).nicotine_type ?? "normale")
        .toString()
        .trim()
        .toLowerCase();
      const cur = byVol.get(v.volume_ml);
      if (!cur || t === "normale") byVol.set(v.volume_ml, v);
    }
    return [...byVol.values()].sort((a, b) => a.volume_ml - b.volume_ml);
  }, [variants]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => {
      const firstInStock = availableVolumes.find((v) => v.stock > 0);
      return firstInStock?.id ?? availableVolumes[0]?.id ?? null;
    },
  );
  const variant =
    availableVolumes.find((v) => v.id === selectedVariantId) ?? null;

  // Flacon vide associé à la contenance sélectionnée (priorité), avec repli
  // sur le flacon vide par défaut du produit.
  const variantEmptyBottleId =
    (variant as { empty_bottle_product_id?: string | null } | null)?.empty_bottle_product_id ?? null;
  const { data: variantEmptyBottle } = useQuery(
    productByIdQueryOptions(variantEmptyBottleId),
  );
  const emptyBottle = variantEmptyBottle ?? productEmptyBottle ?? null;

  // Toutes les références de flacon vide disponibles au catalogue. Sert à
  // proposer plusieurs alternatives dans la pop-up de dépassement de capacité.
  const { data: bottleCandidates } = useQuery(
    emptyBottleCandidatesQueryOptions(),
  );

  // Capacité max de boosters (0 = flacon prêt à l'emploi).
  const variantCapacity = variant
    ? typeof (variant as { max_boosters?: number | null }).max_boosters === "number"
      ? Math.max(0, (variant as { max_boosters: number }).max_boosters)
      : 0
    : 0;
  const isReadyToUse = variant !== null && variantCapacity === 0;

  // -- Flacon PRÊT À L'EMPLOI (10 ml) : choix direct parmi les mg cochés.
  const readyMgList = useMemo<number[]>(() => {
    if (!variant || !isReadyToUse) return [];
    return (variant.available_nicotine_mg ?? []).slice().sort((a, b) => a - b);
  }, [variant, isReadyToUse]);

  // -- Flacon AVEC BOOSTERS : choix du nombre de boosters puis type.
  const [boostersCount, setBoostersCount] = useState<number>(0);
  const [nicotineType, setNicotineType] = useState<string>("normale");
  useEffect(() => {
    // À chaque changement de variante, on remet les choix à zéro.
    setBoostersCount(0);
    setReadyMg(null);
  }, [selectedVariantId]);
  const [readyMg, setReadyMg] = useState<number | null>(null);

  const computedMg = useMemo(() => {
    if (!variant || isReadyToUse) return 0;
    return computeNicotineRateMgPerMl(
      variant.volume_ml,
      boostersCount,
      cfg ?? DEFAULT_BOOSTER_CONFIG,
    );
  }, [variant, isReadyToUse, boostersCount, cfg]);

  const overCapacity =
    !isReadyToUse && variant !== null && boostersCount > variantCapacity;

  // Liste des flacons vides du catalogue capables d'absorber les boosters
  // excédentaires par rapport à la capacité du flacon sélectionné. Trié pour
  // mettre d'abord le flacon spécifiquement associé à la contenance ou au
  // produit (s'il convient), puis les autres options par contenance croissante.
  const matchingBottles = useMemo<EmptyBottleCandidate[]>(() => {
    if (!overCapacity || !variant) return [];
    const boosterVol = (cfg ?? DEFAULT_BOOSTER_CONFIG).boosterVolumeMl;
    const overflow = (boostersCount - variantCapacity) * boosterVol;
    const priorityIds = new Set<string>();
    if (variantEmptyBottleId) priorityIds.add(variantEmptyBottleId);
    if (productEmptyBottleId) priorityIds.add(productEmptyBottleId);
    const list = (bottleCandidates ?? []).filter(
      (b) => b.volume_ml >= overflow && b.stock > 0,
    );
    return list.sort((a, b) => {
      const pa = priorityIds.has(a.id) ? 0 : 1;
      const pb = priorityIds.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.volume_ml - b.volume_ml;
    });
  }, [
    overCapacity,
    variant,
    boostersCount,
    variantCapacity,
    cfg,
    bottleCandidates,
    variantEmptyBottleId,
    productEmptyBottleId,
  ]);

  const [bottleDialogOpen, setBottleDialogOpen] = useState(false);
  // Clé courante de configuration : on rouvre la pop-up dès qu'un nouveau
  // dépassement est provoqué (changement de contenance ou de nb boosters).
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const dialogKey = overCapacity && variant
    ? `${variant.id}:${boostersCount}`
    : null;
  useEffect(() => {
    if (dialogKey && dialogKey !== dismissedKey) {
      setBottleDialogOpen(true);
    } else if (!dialogKey) {
      setBottleDialogOpen(false);
    }
  }, [dialogKey, dismissedKey]);

  // Effective nicotine (mg/ml) — sert au libellé panier / cart.
  const effectiveNicotineMg = isReadyToUse ? readyMg ?? null : computedMg;

  // Booster produit correspondant au type choisi.
  const effectiveBooster = !isReadyToUse ? boosterMap[nicotineType] ?? null : null;
  // Variante réellement facturée : résout (volume, type) vers la vraie ligne
  // product_variants pour que la commande référence la bonne SKU et le bon
  // booster côté serveur.
  const chargedVariant = useMemo(() => {
    if (!variant) return variant;
    const cap =
      typeof (variant as { max_boosters?: number | null }).max_boosters === "number"
        ? Math.max(0, (variant as { max_boosters: number }).max_boosters)
        : 0;
    if (cap <= 0) return variant;
    const match = variants.find(
      (v) =>
        v.volume_ml === variant.volume_ml &&
        ((v as { nicotine_type?: string | null }).nicotine_type ?? "normale")
          .toString()
          .trim()
          .toLowerCase() === nicotineType &&
        (v as { is_active?: boolean }).is_active !== false,
    );
    return match ?? variant;
  }, [variant, variants, nicotineType]);
  const missingBooster =
    !isReadyToUse && boostersCount > 0 && effectiveBooster === null;
  const boosterPrice =
    effectiveBooster && effectiveBooster.is_published
      ? effectiveBooster.price_cents
      : null;

  const displayPrice = useMemo(() => {
    if (!variant) return null;
    const tiers = ((variant as { quantity_tiers?: unknown }).quantity_tiers ?? []) as Array<{
      min_qty: number;
      max_qty?: number | null;
      price_cents: number;
    }>;
    let base = variant.price_cents;
    for (const t of tiers) {
      if (qty >= t.min_qty && (t.max_qty == null || qty <= t.max_qty)) {
        base = t.price_cents;
      }
    }
    if (isReadyToUse) return base;
    if (boostersCount === 0 || !boosterPrice) return base;
    return base + boostersCount * boosterPrice;
  }, [variant, isReadyToUse, boostersCount, boosterPrice, qty]);

  const effectiveStock = variant
    ? hasFlavors
      ? Math.min(variant.stock, selectedFlavor?.stock ?? 0)
      : variant.stock
    : 0;

  const photo =
    (variant as { photo_url?: string | null } | null)?.photo_url ??
    selectedFlavor?.photo ??
    product.photos?.[0] ??
    null;

  // Types de booster proposés côté client : tous les presets connus (Normal/
  // Sel/Ice) sont proposés dès qu'un booster est ajouté ; ceux dont le
  // produit booster n'existe pas encore sont désactivés avec un avis.
  const boosterTypes = useMemo(() => {
    const keys = new Set<string>(["normale", "sel", "ice"]);
    for (const k of Object.keys(boosterMap)) keys.add(k);
    return Array.from(keys);
  }, [boosterMap]);

  // Validation « peut être ajouté au panier ».
  const readyOK = !isReadyToUse || readyMg !== null;
  const addDisabled =
    variant === null ||
    !flavorOK ||
    !readyOK ||
    effectiveStock <= 0 ||
    missingBooster;

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
                loading="lazy"
                decoding="async"
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
            <BrandRangeLine product={product} />

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
              {variant && !isReadyToUse && boostersCount > 0 && boosterPrice !== null && (
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
                Ce e-liquide n'a pas encore de contenance disponible.
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    1. Contenance
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
                          onClick={() => setSelectedVariantId(v.id)}
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

                {variant && isReadyToUse && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      2. Taux de nicotine
                    </p>
                    {readyMgList.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Aucun taux n'est configuré pour cette contenance.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {readyMgList.map((mg) => {
                          const selected = readyMg === mg;
                          return (
                            <button
                              key={mg}
                              type="button"
                              onClick={() => setReadyMg(mg)}
                              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {mg} mg
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {variant && !isReadyToUse && (() => {
                  // On propose la plage 0..capacité pour l'usage normal, plus
                  // quelques crans supplémentaires (dépassement) pour laisser
                  // au client la liberté de viser un taux plus élevé.
                  const extraSlots = 4;
                  const maxSelectable = variantCapacity + extraSlots;
                  return (
                  <>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        2. Nombre de boosters
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: maxSelectable + 1 }, (_, i) => i).map((n) => {
                          const mg = computeNicotineRateMgPerMl(
                            variant.volume_ml,
                            n,
                            cfg ?? DEFAULT_BOOSTER_CONFIG,
                          );
                          const selected = boostersCount === n;
                          const over = n > variantCapacity;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setBoostersCount(n)}
                              className={`flex min-w-[72px] flex-col items-center rounded-md border px-3 py-2 text-sm leading-tight transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : over
                                  ? "border-amber-500/50 text-amber-200 hover:text-amber-100"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                              title={over ? "Dépasse la capacité du flacon — voir avis ci-dessous" : undefined}
                            >
                              <span className="font-medium">{n} booster{n > 1 ? "s" : ""}</span>
                              <span className="mt-0.5 text-[11px] text-muted-foreground">
                                {formatNicotineMg(mg)}/ml
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {overCapacity && (
                        <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100">
                          <p>
                            Le flacon {variant.volume_ml} ml ne peut physiquement pas
                            contenir {boostersCount} boosters.{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setDismissedKey(null);
                                setBottleDialogOpen(true);
                              }}
                              className="underline underline-offset-2 hover:text-white"
                            >
                              Voir les flacons vides adaptés
                            </button>
                            .
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        3. Type de nicotine
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {boosterTypes.map((t) => {
                          const selected = t === nicotineType;
                          const available = Boolean(boosterMap[t]);
                          const disabled = boostersCount > 0 && !available;
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={disabled}
                              onClick={() => setNicotineType(t)}
                              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              } ${disabled ? "opacity-40" : ""}`}
                              title={
                                available
                                  ? undefined
                                  : "Booster de ce type indisponible actuellement"
                              }
                            >
                              {boosterTypeLabel(t)}
                              {!available && boostersCount > 0 && (
                                <span className="ml-1 text-[10px] text-amber-300">
                                  (indispo)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {missingBooster && (
                        <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                          Le booster « {boosterTypeLabel(nicotineType)} » n'est pas
                          disponible actuellement. Choisis un autre type ou une
                          contenance prête à l'emploi.
                        </div>
                      )}
                      {variant && boostersCount > 0 && boosterPrice !== null && !missingBooster && (
                        <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                          <p className="text-foreground">
                            Flacon {variant.volume_ml} ml :{" "}
                            <strong>{formatPrice(variant.price_cents, product.currency)}</strong>
                          </p>
                          <p className="mt-1">
                            + {boostersCount} booster{boostersCount > 1 ? "s" : ""} à{" "}
                            {formatPrice(boosterPrice, product.currency)} ={" "}
                            <strong className="text-foreground">
                              {formatPrice(boostersCount * boosterPrice, product.currency)}
                            </strong>
                          </p>
                          <p className="mt-1 border-t border-border/60 pt-1 text-foreground">
                            = Total :{" "}
                            <strong>
                              {formatPrice(
                                variant.price_cents + boostersCount * boosterPrice,
                                product.currency,
                              )}
                            </strong>{" "}
                            <span className="text-muted-foreground">
                              ({formatNicotineMg(computedMg)}/ml sur {variant.volume_ml} ml)
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                  );
                })()}

                {hasFlavors && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {isReadyToUse ? "3." : "4."} Goût
                    </p>
                    <FlavorPicker
                      flavors={flavors}
                      selected={flavor}
                      onSelect={setFlavor}
                    />
                  </div>
                )}
              </div>
            )}

            {variant && effectiveStock > 0 ? (
              <>
                {(() => {
                  const tiers = (((variant as { quantity_tiers?: unknown }).quantity_tiers ?? []) as Array<{
                    min_qty: number;
                    max_qty?: number | null;
                    price_cents: number;
                  }>).slice().sort((a, b) => a.min_qty - b.min_qty);
                  if (tiers.length === 0) return null;
                  return (
                    <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs">
                      <p className="mb-2 font-medium text-foreground">Prix dégressif</p>
                      <ul className="space-y-1">
                        {tiers.map((t) => {
                          const active =
                            qty >= t.min_qty && (t.max_qty == null || qty <= t.max_qty);
                          return (
                            <li
                              key={`${t.min_qty}-${t.max_qty ?? "inf"}`}
                              className={active ? "font-semibold text-foreground" : "text-muted-foreground"}
                            >
                              À partir de {t.min_qty}
                              {t.max_qty ? ` (jusqu'à ${t.max_qty})` : ""} :{" "}
                              {formatPrice(t.price_cents, product.currency)} / unité
                              {active ? " ← tarif appliqué" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-md border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-4 py-2.5 text-base hover:bg-secondary"
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
                    className="px-4 py-2.5 text-base hover:bg-secondary"
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>
                <button
                  disabled={addDisabled}
                  onClick={() => {
                    if (addDisabled || !variant) return;
                    const flavorSuffix = hasFlavors && flavor ? `, ${flavor}` : "";
                    const nicLabel =
                      effectiveNicotineMg !== null && effectiveNicotineMg !== 0
                        ? `, ${effectiveNicotineMg} mg`
                        : effectiveNicotineMg === 0
                        ? ", 0 mg"
                        : "";
                    const typeLabel =
                      !isReadyToUse && boostersCount > 0
                        ? ` ${boosterTypeLabel(nicotineType)}`
                        : "";
                    const displayName = `${product.name} — ${variant.volume_ml} ml${nicLabel}${typeLabel}${flavorSuffix}`;
                    const tiers = ((variant as { quantity_tiers?: unknown }).quantity_tiers ?? []) as Array<{
                      min_qty: number;
                      max_qty?: number | null;
                      price_cents: number;
                    }>;
                    let baseUnit = variant.price_cents;
                    for (const t of tiers) {
                      if (qty >= t.min_qty && (t.max_qty == null || qty <= t.max_qty)) {
                        baseUnit = t.price_cents;
                      }
                    }
                    const unitPrice =
                      isReadyToUse || boostersCount === 0 || !boosterPrice
                        ? baseUnit
                        : baseUnit + boostersCount * boosterPrice;
                    cart.add(
                      {
                        key: `${product.id}:${(chargedVariant ?? variant).id}:${boostersCount}:${nicotineType}:${effectiveNicotineMg ?? ""}:${flavor ?? ""}`,
                        productId: product.id,
                        variantId: (chargedVariant ?? variant).id,
                        volumeMl: variant.volume_ml,
                        nicotineMg: effectiveNicotineMg,
                        flavor: hasFlavors ? flavor : null,
                        slug: product.slug,
                        name: displayName,
                        priceCents: unitPrice,
                        baseUnitPriceCents: baseUnit,
                        boostersCount: isReadyToUse ? 0 : boostersCount,
                        boosterUnitPriceCents:
                          !isReadyToUse && boostersCount > 0 ? boosterPrice : null,
                        photo: photo,
                        maxStock: effectiveStock,
                      },
                      qty,
                    );
                    toast.success("Ajouté au panier", {
                      description: `${qty} × ${displayName}`,
                    });
                  }}
                  className="inline-flex min-w-0 flex-1 basis-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:basis-0"
                >
                  {isReadyToUse && readyMg === null
                    ? "Choisir un taux de nicotine"
                    : missingBooster
                    ? "Booster indisponible"
                    : hasFlavors && !flavor
                    ? "Choisir un goût"
                    : "Ajouter au panier"}
                </button>
              </div>
              </>
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

        <RangeShowcase product={product} />
      </main>
      <SiteFooter />
      <Dialog
        open={bottleDialogOpen}
        onOpenChange={(open) => {
          setBottleDialogOpen(open);
          if (!open && dialogKey) setDismissedKey(dialogKey);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Capacité du flacon dépassée</DialogTitle>
            <DialogDescription>
              {variant
                ? `Le flacon ${variant.volume_ml} ml ne peut physiquement pas contenir ${boostersCount} boosters (capacité déclarée : ${variantCapacity}). Complète avec un flacon vide pour disposer du volume nécessaire, ou continue sans — c'est facultatif.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {matchingBottles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Flacons vides compatibles
              </p>
              <ul className="space-y-2">
                {matchingBottles.map((b) => {
                  const isDefault =
                    b.id === variantEmptyBottleId ||
                    (!variantEmptyBottleId && b.id === productEmptyBottleId);
                  return (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {b.name}
                          {isDefault && (
                            <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                              Suggéré
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {b.volume_ml} ml ·{" "}
                          {formatPrice(b.price_cents, b.currency)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          cart.add(
                            {
                              key: `empty-bottle:${b.id}`,
                              productId: b.id,
                              slug: b.slug,
                              name: `${b.name} (${b.volume_ml} ml)`,
                              priceCents: b.price_cents,
                              photo: b.photos?.[0] ?? null,
                              maxStock: Math.max(1, b.stock),
                            },
                            1,
                          );
                          toast.success("Flacon vide ajouté au panier", {
                            description: b.name,
                          });
                          setBottleDialogOpen(false);
                          if (dialogKey) setDismissedKey(dialogKey);
                        }}
                        className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Ajouter au panier
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              Aucun flacon vide n'est actuellement disponible au catalogue pour
              absorber ce nombre de boosters. Tu peux tout de même valider ta
              commande — la capacité indiquée est un repère informatif.
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setBottleDialogOpen(false);
                if (dialogKey) setDismissedKey(dialogKey);
              }}
              className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              Non merci, continuer sans flacon vide
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

// Affiche « Marque · Gamme » sous le titre du produit lorsque ces champs
// sont renseignés en base. Purement visuel : n'ajoute rien si les deux
// colonnes sont vides.
function RangeShowcase({ product }: { product: ProductRow }) {
  const range = (product.product_range ?? "").trim();
  const gammeId = (product as { gamme_id?: string | null }).gamme_id ?? null;
  const { data: byGamme = [] } = useQuery(
    sameGammeProductsQueryOptions({ gammeId, excludeId: product.id }),
  );
  const { data: byRange = [] } = useQuery(
    sameRangeProductsQueryOptions({
      range: gammeId ? "" : range,
      brand: product.brand,
      excludeId: product.id,
    }),
  );
  const siblings = gammeId ? byGamme : byRange;
  const title = range || "cette gamme";
  if ((!gammeId && !range) || siblings.length === 0) return null;
  return (
    <section className="mt-14 border-t border-border pt-8">
      <h2
        className="text-2xl"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Découvrez la gamme {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {siblings.length} autre{siblings.length > 1 ? "s" : ""} référence
        {siblings.length > 1 ? "s" : ""} de cette gamme.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {siblings.map((p) => (
          <Link
            key={p.id}
            to="/produit/$slug"
            params={{ slug: p.slug }}
            className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
          >
            <div className="aspect-square w-full overflow-hidden bg-secondary">
              {p.photos?.[0] ? (
                <img
                  src={p.photos[0]}
                  alt={p.name}
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
            <div className="flex flex-1 flex-col gap-1 p-3">
              <h3 className="line-clamp-2 text-sm leading-snug">{p.name}</h3>
              <span className="mt-auto text-sm font-semibold">
                {formatPrice(p.price_cents, p.currency)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function BrandRangeLine({
  product,
}: {
  product: { brand?: string | null; product_range?: string | null };
}) {
  const brand = (product.brand ?? "").trim();
  const range = (product.product_range ?? "").trim();
  if (!brand && !range) return null;
  return (
    <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
      {[brand, range].filter(Boolean).join(" · ")}
    </p>
  );
}
