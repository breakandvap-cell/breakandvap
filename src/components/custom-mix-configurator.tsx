import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { formatPrice } from "@/lib/products";
import { useCart } from "@/lib/cart";
import {
  getMixSessionId,
  availableNicotineRates,
  boostersForNicotineRate,
  isBulkMixFormat,
  formatMixNicotine,
  mixBottlesQueryOptions,
  mixFlavorsByBrandQueryOptions,
  MIX_BRANDS,
  MIX_BRAND_COLORS,
  MIX_BRAND_LOGOS,
  MIX_BULK_VOLUME_ML,
  MIX_MAX_FLAVORS,
  MIX_MAX_NICOTINE_MG,
  mixRecipesQueryOptions,
  computeMixTotalCents,
  nicotineVolumeRatio,
  flavorFillColor,
  type MixBrand,
  type MixFlavorOption,
} from "@/lib/custom-mix";
import {
  saveCustomMixDraft,
  validateCustomMix,
} from "@/lib/custom-mix.functions";
import { siteSettingsQueryOptions } from "@/lib/site-settings.functions";

type Part = { flavorId: string; percentage: number };

/** Couche de liquide affichée dans le flacon (du bas vers le haut). */
type FillLayer = { color: string; ratio: number; key: string };

/** Hauteur d'affichage du flacon, proportionnelle à la contenance (jamais déformée). */
function bottleHeight(volumeMl: number | null | undefined, base = 120): number {
  const v = volumeMl && volumeMl > 0 ? volumeMl : 60;
  return Math.round(base * Math.max(0.72, Math.min(1.45, Math.cbrt(v / 60))));
}

/* ------------------------------------------------------------------ */
/* Décor « bar virtuel »                                               */
/* ------------------------------------------------------------------ */

/** Fond du bar : tasseaux bois, spots plafond, enseigne rétro-éclairée. */
function BarBackdrop({ sign }: { sign?: React.ReactNode }) {
  return (
    <div aria-hidden={!sign} className="pointer-events-none absolute inset-0">
      <div className="bar__wood" />
      <div className="bar__panel" />
      <div className="bar__spot bar__spot--l" />
      <div className="bar__spot bar__spot--c" />
      <div className="bar__spot bar__spot--r" />
      <div className="absolute inset-x-0 top-4 flex justify-center px-4">
        {sign ?? (
          <span className="bar-sign text-[10px] sm:text-xs">Break Vap &amp; CBD</span>
        )}
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 120%, transparent 45%, rgba(0,0,0,.75) 100%)",
        }}
      />
    </div>
  );
}

/** Planche d'étagère avec bande LED verte. */
function ShelfPlank() {
  return (
    <div className="bar-shelf mt-2">
      <div className="bar-shelf__plank" />
      <div className="bar-shelf__led" />
    </div>
  );
}

/** Flacon photo en vue frontale : flottaison + ombre elliptique synchronisée. */
function FloatingBottle({
  photo,
  alt,
  height,
  delay = 0,
  dim = false,
  fromRight = false,
  fill,
}: {
  photo?: string | null;
  alt: string;
  height: number;
  delay?: number;
  dim?: boolean;
  fromRight?: boolean;
  /** Couches de liquide superposées à la photo (remplissage progressif). */
  fill?: FillLayer[];
}) {
  const style = {
    "--float-dur": `${(4 + (delay % 3) * 0.35).toFixed(2)}s`,
    "--float-delay": `${delay * 0.35}s`,
  } as React.CSSProperties;
  const layers = (fill ?? []).filter((l) => l.ratio > 0.001);
  const total = Math.min(1, layers.reduce((s, l) => s + l.ratio, 0));
  let cursor = 0;
  return (
    <span
      className={`bar-bottle ${fromRight ? "bar-bottle--right" : ""} ${dim ? "bar-bottle--back" : ""}`}
      style={style}
    >
      <span className="bar-bottle__body" style={{ height }}>
        {photo ? (
          <img
            src={photo}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="bar-bottle__img"
            style={{ height }}
          />
        ) : (
          <span
            className="bar-bottle__img rounded-[10px] border border-accent/30 bg-[linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.03))]"
            style={{ height, width: height * 0.34 }}
          />
        )}
        {total > 0 && photo && (
          <span
            className="bar-fill"
            style={{ ["--bottle-mask" as string]: `url(${photo})` }}
            aria-hidden
          >
            {/* Intérieur utile du flacon : ~8 % → ~72 % de la hauteur de l'image */}
            {layers.map((l) => {
              const bottom = 8 + cursor * 64;
              const h = l.ratio * 64;
              cursor += l.ratio;
              return (
                <span
                  key={l.key}
                  className="bar-fill__layer"
                  style={{
                    bottom: `${bottom}%`,
                    height: `${h}%`,
                    backgroundColor: l.color,
                  }}
                />
              );
            })}
            <span
              className="bar-fill__top"
              style={{ bottom: `${8 + total * 64}%` }}
            />
          </span>
        )}
      </span>
      <span className="bar-bottle__shadow" />
    </span>
  );
}

/** Comptoir sombre : les éléments sélectionnés s'y posent. */
function BarCounter({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-6">
      <div className="relative z-10 flex min-h-[150px] items-end justify-center gap-6 px-4 pb-2">
        {children}
      </div>
      <div className="bar-counter h-14 sm:h-16">
        <div className="bar-counter__led" />
      </div>
    </div>
  );
}

/** Fil d'Ariane discret des étapes, en overlay. */
function StepRail({
  steps,
  current,
  onGo,
}: {
  steps: { label: string; enabled: boolean }[];
  current: number;
  onGo: (i: number) => void;
}) {
  return (
    <div className="absolute left-1/2 top-14 z-20 flex -translate-x-1/2 gap-1.5 rounded-full border border-accent/20 bg-background/50 px-2 py-1 backdrop-blur sm:top-16">
      {steps.map((s, i) => (
        <button
          key={s.label}
          type="button"
          disabled={!s.enabled}
          onClick={() => onGo(i)}
          aria-current={current === i}
          title={s.label}
          className={`h-1.5 rounded-full transition-all ${
            current === i
              ? "w-6 bg-accent shadow-[0_0_10px_color-mix(in_oklab,var(--accent)_70%,transparent)]"
              : s.enabled
                ? "w-3 bg-accent/40 hover:bg-accent/70"
                : "w-3 bg-muted-foreground/25"
          }`}
        >
          <span className="sr-only">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function CustomMixConfigurator() {
  const cart = useCart();
  const saveDraft = useServerFn(saveCustomMixDraft);
  const validate = useServerFn(validateCustomMix);

  const { data: bottles = [], isLoading: bottlesLoading } = useQuery(
    mixBottlesQueryOptions(),
  );
  const { data: flavorsByBrand } = useQuery(mixFlavorsByBrandQueryOptions());
  const { data: settings } = useQuery(siteSettingsQueryOptions());
  const { data: recipes = [] } = useQuery(mixRecipesQueryOptions());

  const [bottleId, setBottleId] = useState<string | null>(null);
  const [nicotine, setNicotine] = useState(0);
  const [brand, setBrand] = useState<MixBrand | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);

  const bottle = bottles.find((b) => b.id === bottleId) ?? null;
  /** Format 500 ml : un seul arôme à 100 % et nicotine payante. */
  const isBulk = isBulkMixFormat(bottle?.volume_ml);
  const brandFlavors: MixFlavorOption[] = brand
    ? (flavorsByBrand?.[brand] ?? [])
    : [];

  const totalPct = parts.reduce((s, p) => s + p.percentage, 0);
  const pctValid = parts.length > 0 && Math.round(totalPct) === 100;

  const concentration =
    settings?.boosterConcentrationMgPerMl && settings.boosterConcentrationMgPerMl > 0
      ? settings.boosterConcentrationMgPerMl
      : 20;
  const boosterCfg = {
    boosterVolumeMl:
      settings?.boosterVolumeMl && settings.boosterVolumeMl > 0
        ? settings.boosterVolumeMl
        : 10,
    boosterConcentrationMgPerMl: concentration,
  };
  // Taux atteignables (nombre entier de boosters) pour la contenance choisie.
  const nicotineOptions = useMemo(
    () => availableNicotineRates(bottle?.volume_ml ?? null, boosterCfg),
    [bottle?.volume_ml, boosterCfg.boosterVolumeMl, boosterCfg.boosterConcentrationMgPerMl],
  );
  // Changement de contenance : on retombe sur le taux atteignable le plus proche.
  useEffect(() => {
    if (nicotineOptions.some((r) => Math.abs(r - nicotine) < 0.05)) return;
    const nearest = nicotineOptions.reduce(
      (best, r) => (Math.abs(r - nicotine) < Math.abs(best - nicotine) ? r : best),
      nicotineOptions[0] ?? 0,
    );
    setNicotine(nearest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nicotineOptions]);

  const boostersCount = boostersForNicotineRate(
    bottle?.volume_ml ?? null,
    nicotine,
    boosterCfg,
  );
  const bulkBoosterPriceCents = settings?.mixBulkBoosterPriceCents ?? 100;

  // Prix FIXE par contenance (arômes et pourcentages sans effet).
  // Seul le format 500 ml ajoute le prix des boosters de nicotine.
  const estimatedCents = useMemo(
    () =>
      bottle
        ? computeMixTotalCents({
            bottlePriceCents: bottle.price_cents,
            boostersCount: isBulk ? boostersCount : 0,
            boosterUnitPriceCents: isBulk ? bulkBoosterPriceCents : 0,
          })
        : 0,
    [bottle, isBulk, boostersCount, bulkBoosterPriceCents],
  );

  // Le 500 ml n'accepte qu'un seul arôme : on ramène la composition à 100 %.
  useEffect(() => {
    if (!isBulk) return;
    setParts((cur) =>
      cur.length === 0
        ? cur
        : cur.length === 1 && cur[0]!.percentage === 100
          ? cur
          : [{ flavorId: cur[0]!.flavorId, percentage: 100 }],
    );
  }, [isBulk]);

  const setPart = (flavorId: string, percentage: number) =>
    setParts((cur) =>
      cur.map((p) => (p.flavorId === flavorId ? { ...p, percentage } : p)),
    );

  const toggleFlavor = (flavorId: string) => {
    if (isBulk) {
      // Format 500 ml : sélection unique, toujours à 100 %.
      setParts((cur) =>
        cur[0]?.flavorId === flavorId ? [] : [{ flavorId, percentage: 100 }],
      );
      return;
    }
    setParts((cur) => {
      const exists = cur.find((p) => p.flavorId === flavorId);
      if (exists) return cur.filter((p) => p.flavorId !== flavorId);
      if (cur.length >= MIX_MAX_FLAVORS) {
        toast.error(`Un mix contient au maximum ${MIX_MAX_FLAVORS} arômes.`);
        return cur;
      }
      const next = [...cur, { flavorId, percentage: 0 }];
      const even = Math.floor(100 / next.length);
      return next.map((p, i) => ({
        ...p,
        percentage: i === next.length - 1 ? 100 - even * (next.length - 1) : even,
      }));
    });
  };

  const applyRecipe = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    const list = flavorsByBrand?.[recipe.brand] ?? [];
    const resolved: Part[] = [];
    for (const part of recipe.parts) {
      const match = list.find((f) => f.id === part.flavor_product_id);
      if (!match) continue;
      resolved.push({ flavorId: match.id, percentage: part.percentage });
    }
    if (resolved.length !== recipe.parts.length) {
      toast.info("Cette recette sera disponible dès l'arrivée de tous ses arômes.");
      return;
    }
    setBrand(recipe.brand);
    setParts(resolved);
    setNicotine(Math.min(recipe.suggested_nicotine_mg, MIX_MAX_NICOTINE_MG));
    setStep(3);
  };

  const canSubmit = Boolean(bottle) && pctValid && !submitting;

  const handleSubmit = async () => {
    if (!bottle) return;
    setSubmitting(true);
    try {
      const sessionId = getMixSessionId();
      const draft = await saveDraft({
        data: {
          sessionId,
          bottleProductId: bottle.id,
          nicotineMg: nicotine,
          flavors: parts.map((p) => ({
            flavor_product_id: p.flavorId,
            percentage: p.percentage,
          })),
        },
      });
      // Prix FIGÉ par le serveur : jamais celui affiché pendant la configuration.
      const validated = await validate({
        data: { mixId: draft.mixId, sessionId },
      });
      const composition = parts
        .map(
          (p) =>
            `${brandFlavors.find((f) => f.id === p.flavorId)?.name ?? "Arôme"} ${p.percentage}%`,
        )
        .join(" + ");
      cart.add({
        key: `mix:${validated.mixId}`,
        productId: bottle.id,
        slug: bottle.slug,
        name: `Mon Mix ${validated.brand} — ${bottle.volume_ml} ml`,
        priceCents: validated.priceCents,
        photo: bottle.photos?.[0] ?? null,
        maxStock: 5,
        volumeMl: bottle.volume_ml,
        nicotineMg: nicotine,
        flavor: composition,
        customMixId: validated.mixId,
        customMixSessionId: sessionId,
      });
      toast.success("Votre mix personnalisé a été ajouté au panier.");
      setParts([]);
      setNicotine(0);
      setStep(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de valider ce mix.");
    } finally {
      setSubmitting(false);
    }
  };

  // Interrupteur global piloté depuis /admin/mon-mix.
  if (settings && settings.customMixEnabled === false) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Configurateur momentanément indisponible</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          « Mon Mix » est temporairement désactivé. Revenez très bientôt : nos arômes
          reviennent en stock rapidement.
        </p>
      </div>
    );
  }

  const steps = [
    { label: "Contenance", enabled: true },
    { label: "Nicotine", enabled: Boolean(bottle) },
    { label: "Marque", enabled: Boolean(bottle) },
    { label: "Arômes", enabled: Boolean(bottle) && Boolean(brand) },
  ];
  const maxFlavors = isBulk ? 1 : MIX_MAX_FLAVORS;
  const selectedFlavors = parts
    .map((p) => ({ part: p, flavor: brandFlavors.find((f) => f.id === p.flavorId) }))
    .filter((x) => x.flavor);

  // Remplissage visuel du flacon : base nicotinée (boosters) puis arômes.
  const nicoRatio = nicotineVolumeRatio(
    bottle?.volume_ml ?? null,
    boostersCount,
    boosterCfg,
  );
  const fillLayers: FillLayer[] = [];
  if (nicoRatio > 0) {
    fillLayers.push({ key: "nicotine", color: "hsl(140 72% 55%)", ratio: nicoRatio });
  }
  const flavorSpace = Math.max(0, 1 - nicoRatio);
  selectedFlavors.forEach(({ part }, i) => {
    fillLayers.push({
      key: part.flavorId,
      color: flavorFillColor(brand, i),
      ratio: flavorSpace * (part.percentage / 100),
    });
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Atelier DIY
          </p>
          <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
            Mon Mix personnalisé
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Composez votre e-liquide au comptoir : contenance, nicotine, marque et
            jusqu'à {MIX_MAX_FLAVORS} arômes d'une même maison.
          </p>
        </header>

        {/* Scène : décor identique à toutes les étapes */}
        <div className="bar px-3 pb-4 pt-3 sm:px-5">
          <BarBackdrop />
          <StepRail steps={steps} current={step} onGo={(i) => steps[i]?.enabled && setStep(i)} />

          <div className="relative z-10 pt-24 sm:pt-28">
            {/* ---------- Étape 1 — Contenance ---------- */}
            {step === 0 && (
              <div>
                <SceneTitle
                  eyebrow="Étape 1"
                  title="Choisissez votre contenance"
                  hint="Cliquez sur un flacon : il glisse jusqu'au comptoir."
                />
                {bottlesLoading ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Chargement des flacons…
                  </p>
                ) : bottles.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Flacons bientôt disponibles.
                  </p>
                ) : (
                  <div className="mt-4">
                    <div className="flex items-end justify-center gap-3 overflow-x-auto px-1 pb-1 sm:gap-6">
                      {bottles.map((b, i) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setBottleId(b.id);
                            setStep(1);
                          }}
                          className="group shrink-0 rounded-lg px-1 pb-1 text-center transition focus:outline-none"
                          aria-pressed={bottleId === b.id}
                        >
                          <FloatingBottle
                            photo={b.photos?.[0] ?? null}
                            alt={`Flacon ${b.volume_ml} ml`}
                            height={bottleHeight(b.volume_ml, 96)}
                            delay={i}
                            dim={Boolean(bottleId) && bottleId !== b.id}
                          />
                          <span className="mt-2 block text-xs text-foreground/90 group-hover:text-accent">
                            {b.volume_ml} ml
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {formatPrice(b.price_cents)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <ShelfPlank />
                  </div>
                )}
              </div>
            )}

            {/* ---------- Étape 2 — Nicotine ---------- */}
            {step === 1 && (
              <div>
                <SceneTitle
                  eyebrow="Étape 2"
                  title="Réglez votre taux de nicotine"
                  hint={
                    isBulk
                      ? `Nicotine payante sur ce format (${formatPrice(bulkBoosterPriceCents)} / booster).`
                      : "Nicotine offerte, sans supplément."
                  }
                />
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {nicotineOptions.map((r, i) => {
                    const selected = Math.abs(r - nicotine) < 0.05;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setNicotine(r)}
                        className={`rounded-full border px-4 py-1.5 text-sm backdrop-blur transition ${
                          selected
                            ? "border-accent bg-accent/15 text-accent shadow-[0_0_20px_-6px_color-mix(in_oklab,var(--accent)_80%,transparent)]"
                            : "border-border/70 bg-background/40 text-muted-foreground hover:border-accent/60"
                        }`}
                      >
                        {formatMixNicotine(r)}
                        <span className="ml-2 text-[10px] uppercase tracking-wider opacity-70">
                          {i === 0 ? "sans booster" : `${i} booster${i > 1 ? "s" : ""}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mx-auto mt-3 max-w-xl text-center text-[11px] text-muted-foreground">
                  Seuls ces taux sont réalisables : un booster de{" "}
                  {boosterCfg.boosterVolumeMl} ml à {concentration} mg/ml ne se coupe pas
                  en deux (max {MIX_MAX_NICOTINE_MG} mg).
                  {isBulk && boostersCount > 0
                    ? ` Sélection actuelle : ${boostersCount} booster${boostersCount > 1 ? "s" : ""} — ${formatPrice(boostersCount * bulkBoosterPriceCents)}.`
                    : ""}
                </p>
                <div className="mt-4 text-center">
                  <NextButton onClick={() => setStep(2)}>Choisir la marque</NextButton>
                </div>
              </div>
            )}

            {/* ---------- Étape 3 — Marque ---------- */}
            {step === 2 && (
              <div>
                <SceneTitle
                  eyebrow="Étape 3"
                  title="Choisissez votre maison d'arômes"
                  hint="Les arômes ne se mélangent pas entre marques."
                />
                <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                  {MIX_BRANDS.map((b) => {
                    const available = (flavorsByBrand?.[b] ?? []).length > 0;
                    const active = brand === b;
                    const logo = MIX_BRAND_LOGOS[b];
                    return (
                      <button
                        key={b}
                        type="button"
                        disabled={!available}
                        onClick={() => {
                          setBrand(b);
                          setParts([]);
                          setStep(3);
                        }}
                        aria-pressed={active}
                        className={`bar-brand ${active ? "bar-brand--active" : "opacity-85 hover:opacity-100"} ${
                          available ? "" : "cursor-not-allowed opacity-40"
                        }`}
                        style={active ? { borderColor: MIX_BRAND_COLORS[b].from } : undefined}
                      >
                        <span className="flex flex-col items-center gap-1">
                          {logo ? (
                            <img
                              src={logo}
                              alt={`Logo ${b}`}
                              loading="lazy"
                              decoding="async"
                              className="bar-brand__img"
                            />
                          ) : (
                            <>
                              <span
                                className="text-sm font-extrabold uppercase tracking-[0.2em]"
                                style={{
                                  color: MIX_BRAND_COLORS[b].from,
                                  textShadow: `0 0 16px ${MIX_BRAND_COLORS[b].from}`,
                                }}
                              >
                                {b}
                              </span>
                              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                                Logo {b} — emplacement réservé
                              </span>
                            </>
                          )}
                          {!available && (
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                              bientôt
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------- Étape 4 — Arômes ---------- */}
            {step === 3 && (
              <div>
                <SceneTitle
                  eyebrow="Étape 4"
                  title={isBulk ? "Choisissez votre arôme" : "Composez vos arômes"}
                  hint={
                    isBulk
                      ? `Format ${MIX_BULK_VOLUME_ML} ml : un seul arôme, automatiquement à 100 %.`
                      : `Jusqu'à ${MIX_MAX_FLAVORS} arômes ${brand ?? ""} — total 100 %.`
                  }
                />
                {!brand ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sélectionnez d'abord une marque à l'étape 3.
                  </p>
                ) : brandFlavors.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Arômes {brand} bientôt disponibles.
                  </p>
                ) : (
                  <div className="mt-4">
                    <div className="flex items-end justify-center gap-3 overflow-x-auto px-1 pb-1 sm:gap-5">
                      {brandFlavors.map((f, i) => {
                        const selected = parts.some((p) => p.flavorId === f.id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => toggleFlavor(f.id)}
                            aria-pressed={selected}
                            className="group w-[112px] shrink-0 text-center transition sm:w-[132px]"
                          >
                            <FloatingBottle
                              photo={f.photos?.[0] ?? null}
                              alt={f.name}
                              height={124}
                              delay={i}
                              dim={parts.length > 0 && !selected}
                              fromRight
                            />
                            <span
                              className={`mt-2 block truncate text-xs ${
                                selected ? "text-accent" : "text-muted-foreground"
                              }`}
                            >
                              {f.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <ShelfPlank />
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                      <span className="text-muted-foreground">
                        {parts.length}/{maxFlavors} arôme{maxFlavors > 1 ? "s" : ""} au
                        comptoir
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 font-medium ${
                          pctValid
                            ? "border-accent/60 bg-accent/10 text-accent"
                            : "border-yellow-500/60 bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        Total : {Math.round(totalPct)} % / 100 %
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comptoir : flacon retenu + arômes posés */}
          <BarCounter>
            {bottle ? (
              <span className="text-center">
                <FloatingBottle
                  photo={bottle.photos?.[0] ?? null}
                  alt={`Flacon ${bottle.volume_ml} ml`}
                  height={bottleHeight(bottle.volume_ml, step >= 1 ? 205 : 130)}
                  fill={fillLayers}
                />
                <span className="mt-1 block text-xs uppercase tracking-[0.2em] text-accent">
                  {bottle.volume_ml} ml
                </span>
                {step >= 1 && (
                  <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                    {formatMixNicotine(nicotine)}/ml
                  </span>
                )}
              </span>
            ) : (
              <span className="pb-6 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Comptoir vide
              </span>
            )}
            {selectedFlavors.map(({ part, flavor }, i) => (
              <span key={part.flavorId} className="text-center">
                <FloatingBottle
                  photo={flavor!.photos?.[0] ?? null}
                  alt={flavor!.name}
                  height={72}
                  delay={i + 1}
                  fromRight
                />
                <span className="mt-1 block max-w-[90px] truncate text-[10px] text-muted-foreground">
                  {flavor!.name}
                </span>
                <span className="block text-[11px] text-accent">{part.percentage} %</span>
              </span>
            ))}
          </BarCounter>
        </div>

        {/* Dosage des arômes (hors 500 ml) */}
        {step === 3 && brand && parts.length > 0 && !isBulk && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Dosage des arômes</p>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  pctValid
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-yellow-500/60 bg-yellow-500/10 text-yellow-400"
                }`}
              >
                Total : {Math.round(totalPct)} % / 100 %
              </span>
            </div>
            {parts.map((p) => {
              const f = brandFlavors.find((x) => x.id === p.flavorId);
              return (
                <div key={p.flavorId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: flavorFillColor(
                            brand,
                            parts.findIndex((x) => x.flavorId === p.flavorId),
                          ),
                        }}
                      />
                      {f?.name ?? "Arôme"}
                    </span>
                    <span className="font-medium">{p.percentage} %</span>
                  </div>
                  <Slider
                    value={[p.percentage]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(v) => setPart(p.flavorId, v[0] ?? 0)}
                    aria-label={`Pourcentage ${f?.name ?? ""}`}
                  />
                </div>
              );
            })}
            <p className={`text-xs ${pctValid ? "text-accent" : "text-muted-foreground"}`}>
              {pctValid
                ? "Composition équilibrée."
                : "Le total doit être exactement de 100 % pour valider."}
            </p>
          </div>
        )}

        {/* Recettes populaires */}
        <section>
          <h2 className="mb-3 text-lg">Recettes populaires</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recipes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucune recette proposée pour le moment.
              </p>
            )}
            {recipes.map((r) => {
              const list = flavorsByBrand?.[r.brand] ?? [];
              const resolved = r.parts.map((part) => ({
                part,
                flavor: list.find((f) => f.id === part.flavor_product_id) ?? null,
              }));
              const ready =
                r.parts.length > 0 && resolved.every((x) => x.flavor !== null);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => applyRecipe(r.id)}
                  disabled={!ready}
                  className={`rounded-lg border border-border bg-card p-4 text-left transition hover:border-accent/60 ${
                    ready ? "" : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.brand}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {resolved
                      .map(
                        (x) =>
                          `${x.flavor?.name ?? "Arôme indisponible"} ${x.part.percentage}%`,
                      )
                      .join(" · ")}
                  </p>
                  {!ready && (
                    <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      Bientôt disponible
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Récapitulatif + validation */}
      <aside className="lg:sticky lg:top-6">
        <div
          className="relative overflow-hidden rounded-xl border bg-card p-5 transition-colors duration-500"
          style={{
            borderColor: pctValid
              ? "color-mix(in oklab, var(--accent) 60%, transparent)"
              : "var(--border)",
            backgroundImage:
              "radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%)",
            boxShadow: pctValid
              ? "0 0 40px -12px color-mix(in oklab, var(--accent) 55%, transparent)"
              : undefined,
          }}
        >
          <p className="text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Votre mix
          </p>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Flacon</dt>
              <dd>{bottle ? `${bottle.volume_ml} ml` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Nicotine</dt>
              <dd>
                {formatMixNicotine(nicotine)}/ml{" "}
                {isBulk
                  ? boostersCount > 0
                    ? `(${boostersCount} booster${boostersCount > 1 ? "s" : ""} · ${formatPrice(
                        boostersCount * bulkBoosterPriceCents,
                      )})`
                    : "(sans booster)"
                  : "(offerte)"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Marque</dt>
              <dd>{brand ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Arômes</dt>
              <dd className="text-right">
                {selectedFlavors.length > 0
                  ? selectedFlavors
                      .map((x) => `${x.flavor!.name} ${x.part.percentage}%`)
                      .join(" + ")
                  : "—"}
              </dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <dt className="text-muted-foreground">Prix indicatif</dt>
              <dd className="text-lg font-medium">{formatPrice(estimatedCents)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Le prix définitif est recalculé et vérifié par nos serveurs lors de l'ajout au
            panier et de la commande.
          </p>

          {isBulk && (
            <p className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs text-accent">
              Le flacon {MIX_BULK_VOLUME_ML} ml est vendu avec l'arôme uniquement. La
              nicotine, si ajoutée, est fournie séparément. Vous devrez utiliser votre
              propre flacon vide pour mélanger le tout à la maison.
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`mt-4 w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
              canSubmit
                ? "scale-[1.02] shadow-[0_0_30px_-6px_color-mix(in_oklab,var(--accent)_70%,transparent)] hover:scale-[1.04]"
                : ""
            }`}
          >
            {submitting ? "Validation…" : "Valider et ajouter au panier"}
          </button>
          {!bottle && (
            <p className="mt-2 text-xs text-muted-foreground">
              Choisissez d'abord une contenance.
            </p>
          )}
          {bottle && !pctValid && (
            <p className="mt-2 text-xs text-muted-foreground">
              La somme des pourcentages doit être exactement de 100 %.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function SceneTitle({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">{eyebrow}</p>
      <h2
        className="mt-1 text-base uppercase tracking-[0.12em] sm:text-lg"
        style={{
          fontFamily: "var(--font-serif)",
          textShadow: "0 0 18px color-mix(in oklab, var(--accent) 45%, transparent)",
        }}
      >
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function NextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-accent/60 bg-accent/10 px-5 py-2 text-sm text-accent transition hover:bg-accent/20"
    >
      {children}
    </button>
  );
}
