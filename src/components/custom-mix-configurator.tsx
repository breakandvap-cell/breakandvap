import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  BottleCarousel3DClient,
  MixStage3DClient,
} from "@/components/mix3d/client-3d";
import { formatPrice } from "@/lib/products";
import { useCart } from "@/lib/cart";
import {
  getMixSessionId,
  availableNicotineRates,
  formatMixNicotine,
  mixBottlesQueryOptions,
  mixFlavorsByBrandQueryOptions,
  MIX_BRANDS,
  MIX_BRAND_COLORS,
  MIX_MAX_FLAVORS,
  MIX_MAX_NICOTINE_MG,
  MIX_RECIPES,
  type MixBrand,
  type MixFlavorOption,
} from "@/lib/custom-mix";
import {
  saveCustomMixDraft,
  validateCustomMix,
} from "@/lib/custom-mix.functions";
import { siteSettingsQueryOptions } from "@/lib/site-settings.functions";

type Part = { flavorId: string; percentage: number };

/** Échelle 3D proportionnelle à la contenance (racine cubique). */
function bottleScale(volumeMl: number | null | undefined): number {
  const v = volumeMl && volumeMl > 0 ? volumeMl : 50;
  return Math.max(0.62, Math.min(1.5, Math.cbrt(v / 60)));
}



export function CustomMixConfigurator() {
  const cart = useCart();
  const saveDraft = useServerFn(saveCustomMixDraft);
  const validate = useServerFn(validateCustomMix);

  const { data: bottles = [], isLoading: bottlesLoading } = useQuery(
    mixBottlesQueryOptions(),
  );
  const { data: flavorsByBrand } = useQuery(mixFlavorsByBrandQueryOptions());
  const { data: settings } = useQuery(siteSettingsQueryOptions());

  const [bottleId, setBottleId] = useState<string | null>(null);
  const [nicotine, setNicotine] = useState(0);
  const [brand, setBrand] = useState<MixBrand | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [focusFlavor, setFocusFlavor] = useState<string | null>(null);

  const bottle = bottles.find((b) => b.id === bottleId) ?? null;
  const brandFlavors: MixFlavorOption[] = brand
    ? (flavorsByBrand?.[brand] ?? [])
    : [];

  const totalPct = parts.reduce((s, p) => s + p.percentage, 0);
  const pctValid = parts.length > 0 && Math.round(totalPct) === 100;

  const estimatedCents = useMemo(() => {
    if (!bottle) return 0;
    let cents = bottle.price_cents;
    for (const p of parts) {
      const f = brandFlavors.find((x) => x.id === p.flavorId);
      if (f) cents += (f.price_cents * p.percentage) / 100;
    }
    return Math.round(cents);
  }, [bottle, parts, brandFlavors]);

  const colors = brand ? MIX_BRAND_COLORS[brand] : { from: "#7cffc4", to: "#1f6b4a" };

  // Volume réellement occupé par la base nicotinée, d'après la concentration
  // des boosters configurée dans les réglages du site :
  //   volume_base = (mg/ml voulus × contenance) / concentration_booster
  // soit une fraction du flacon = nicotine / concentration.
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
  const baseFill = bottle
    ? Math.max(0, Math.min(1, nicotine / concentration))
    : 0;
  // Les arômes remplissent le volume restant : 100 % de composition = flacon plein.
  const fill = Math.min(
    1,
    baseFill + (1 - baseFill) * (Math.min(100, Math.max(0, totalPct)) / 100),
  );

  const setPart = (flavorId: string, percentage: number) =>
    setParts((cur) =>
      cur.map((p) => (p.flavorId === flavorId ? { ...p, percentage } : p)),
    );

  const toggleFlavor = (flavorId: string) => {
    setParts((cur) => {
      const exists = cur.find((p) => p.flavorId === flavorId);
      if (exists) return cur.filter((p) => p.flavorId !== flavorId);
      if (cur.length >= MIX_MAX_FLAVORS) {
        toast.error(`Un mix contient au maximum ${MIX_MAX_FLAVORS} arômes.`);
        return cur;
      }
      const next = [...cur, { flavorId, percentage: 0 }];
      // Répartition équitable automatique
      const even = Math.floor(100 / next.length);
      return next.map((p, i) => ({
        ...p,
        percentage: i === next.length - 1 ? 100 - even * (next.length - 1) : even,
      }));
    });
  };

  const applyRecipe = (recipeId: string) => {
    const recipe = MIX_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;
    const list = flavorsByBrand?.[recipe.brand] ?? [];
    const resolved: Part[] = [];
    for (const part of recipe.parts) {
      const match = list.find(
        (f) => f.name.toLowerCase().includes(part.flavorName.toLowerCase()),
      );
      if (!match) continue;
      resolved.push({ flavorId: match.id, percentage: part.percentage });
    }
    if (resolved.length !== recipe.parts.length) {
      toast.info("Cette recette sera disponible dès l'arrivée de tous ses arômes.");
      return;
    }
    setBrand(recipe.brand);
    setParts(resolved);
    setNicotine(Math.min(recipe.suggestedNicotineMg, MIX_MAX_NICOTINE_MG));
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de valider ce mix.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Atelier DIY
          </p>
          <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
            Mon Mix personnalisé
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Composez votre e-liquide sur mesure : choisissez votre flacon, votre taux de
            nicotine et jusqu'à {MIX_MAX_FLAVORS} arômes d'une même marque.
          </p>
        </header>

        {/* Étape 1 — Flacon */}
        <Step number={1} title="Choisissez votre contenance" done={Boolean(bottle)}>
          {bottlesLoading ? (
            <p className="text-sm text-muted-foreground">Chargement des flacons…</p>
          ) : bottles.length === 0 ? (
            <ShowcaseFrame>
              <BottleCarousel3DClient
                items={[30, 60, 120, 200].map((v) => ({
                  id: `ghost-${v}`,
                  size: bottleScale(v),
                  from: "#8ea79c",
                  to: "#3f524a",
                }))}
                selectedId={null}
                onSelect={() => {}}
                ghost
              />
              <ShowcaseOverlay>Bientôt disponible</ShowcaseOverlay>
            </ShowcaseFrame>
          ) : (
            <ShowcaseFrame>
              <BottleCarousel3DClient
                items={bottles.map((b) => ({
                  id: b.id,
                  size: bottleScale(b.volume_ml),
                  from: colors.from,
                  to: colors.to,
                  fill: 0.55,
                  label: `${b.volume_ml} ml`,
                  sublabel: brand || "Break Vap",
                }))}
                selectedId={bottleId ?? bottles[0]?.id ?? null}
                onSelect={setBottleId}
              />
              <CarouselNav
                onPrev={() => {
                  const i = Math.max(0, bottles.findIndex((b) => b.id === bottleId));
                  setBottleId(bottles[Math.max(0, i - 1)]!.id);
                }}
                onNext={() => {
                  const i = Math.max(0, bottles.findIndex((b) => b.id === bottleId));
                  setBottleId(bottles[Math.min(bottles.length - 1, i + 1)]!.id);
                }}
              />
              <StageTitle
                title={bottle ? `${bottle.volume_ml} ML` : "CHOISISSEZ"}
                subtitle={bottle ? formatPrice(bottle.price_cents) : undefined}
              />
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {bottles.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBottleId(b.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      bottleId === b.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:border-accent/60"
                    }`}
                  >
                    {b.volume_ml} ml · {formatPrice(b.price_cents)}
                  </button>
                ))}
              </div>
            </ShowcaseFrame>
          )}
        </Step>

        {/* Étape 2 — Nicotine */}
        <Step number={2} title="Réglez votre taux de nicotine" done={nicotine > 0}>
          <div className="max-w-xl space-y-3">
            {!bottle ? (
              <p className="text-sm text-muted-foreground">
                Choisissez d'abord une contenance à l'étape 1.
              </p>
            ) : (
              <>
                <div
                  role="radiogroup"
                  aria-label="Taux de nicotine"
                  className="flex flex-wrap gap-2"
                >
                  {nicotineOptions.map((r, i) => {
                    const selected = Math.abs(r - nicotine) < 0.05;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setNicotine(r)}
                        className={`rounded-full border px-4 py-1.5 text-sm transition ${
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-muted-foreground hover:border-accent/60"
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
                <p className="text-xs text-muted-foreground">
                  Seuls ces taux sont réalisables : un booster de{" "}
                  {boosterCfg.boosterVolumeMl} ml à {concentration} mg/ml ne se
                  coupe pas en deux (max {MIX_MAX_NICOTINE_MG} mg).
                </p>
                <p className="text-xs text-accent">Nicotine offerte, sans supplément</p>
              </>
            )}
          </div>
        </Step>

        {/* Étape 3 — Arômes */}
        <Step number={3} title="Composez vos arômes" done={pctValid}>
          <div className="mb-4 flex flex-wrap gap-2">
            {MIX_BRANDS.map((b) => {
              const available = (flavorsByBrand?.[b] ?? []).length > 0;
              return (
                <button
                  key={b}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    setBrand(b);
                    setParts([]);
                  }}
                  className={`rounded-full border px-4 py-1.5 text-sm transition ${
                    brand === b
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/60"
                  } ${available ? "" : "cursor-not-allowed opacity-50"}`}
                >
                  {b}
                  {!available && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider">
                      Bientôt disponible
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!brand ? (
            <p className="text-sm text-muted-foreground">
              Sélectionnez d'abord une marque : les arômes ne se mélangent pas entre marques.
            </p>
          ) : brandFlavors.length === 0 ? (
            <ShowcaseFrame>
              <BottleCarousel3DClient
                items={[0, 1, 2].map((i) => ({
                  id: `ghost-flavor-${i}`,
                  size: 1,
                  from: "#8ea79c",
                  to: "#3f524a",
                }))}
                selectedId={null}
                onSelect={() => {}}
                ghost
              />
              <ShowcaseOverlay>Arômes {brand} bientôt disponibles</ShowcaseOverlay>
            </ShowcaseFrame>
          ) : (
            <div className="space-y-4">
              <ShowcaseFrame>
                <BottleCarousel3DClient
                  items={brandFlavors.map((f) => ({
                    id: f.id,
                    size: 1,
                    from: colors.from,
                    to: colors.to,
                    fill: parts.some((p) => p.flavorId === f.id) ? 0.8 : 0.4,
                    label: f.name.split(" ")[0] ?? f.name,
                    sublabel: brand || "Break Vap",
                  }))}
                  selectedId={focusFlavor ?? brandFlavors[0]?.id ?? null}
                  onSelect={(id) => {
                    setFocusFlavor(id);
                    toggleFlavor(id);
                  }}
                />
                <CarouselNav
                  onPrev={() => {
                    const i = Math.max(
                      0,
                      brandFlavors.findIndex((f) => f.id === focusFlavor),
                    );
                    setFocusFlavor(brandFlavors[Math.max(0, i - 1)]!.id);
                  }}
                  onNext={() => {
                    const i = Math.max(
                      0,
                      brandFlavors.findIndex((f) => f.id === focusFlavor),
                    );
                    setFocusFlavor(
                      brandFlavors[Math.min(brandFlavors.length - 1, i + 1)]!.id,
                    );
                  }}
                />
                <StageTitle
                  title={
                    brandFlavors.find((f) => f.id === focusFlavor)?.name ??
                    brandFlavors[0]?.name ??
                    "ARÔMES"
                  }
                  subtitle={
                    brandFlavors.find((f) => f.id === focusFlavor)
                      ? formatPrice(
                          brandFlavors.find((f) => f.id === focusFlavor)!.price_cents,
                        )
                      : undefined
                  }
                />
              </ShowcaseFrame>
              <div className="flex flex-wrap justify-center gap-2">
                {brandFlavors.map((f) => {
                  const selected = parts.some((p) => p.flavorId === f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFocusFlavor(f.id);
                        toggleFlavor(f.id);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        selected
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted-foreground hover:border-accent/60"
                      }`}
                    >
                      {f.name} · {formatPrice(f.price_cents)}
                    </button>
                  );
                })}
              </div>

              {parts.length > 0 && (
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  {parts.map((p) => {
                    const f = brandFlavors.find((x) => x.id === p.flavorId);
                    return (
                      <div key={p.flavorId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{f?.name ?? "Arôme"}</span>
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
                  <p
                    className={`text-xs ${
                      pctValid ? "text-accent" : "text-destructive"
                    }`}
                  >
                    Total : {Math.round(totalPct)} %{" "}
                    {pctValid
                      ? "— composition équilibrée."
                      : "— le total doit être exactement de 100 % pour valider."}
                  </p>
                </div>
              )}
            </div>
          )}
        </Step>

        {/* Étape 4 — Recettes */}
        <Step number={4} title="Recettes populaires">
          <div className="grid gap-3 sm:grid-cols-2">
            {MIX_RECIPES.map((r) => {
              const list = flavorsByBrand?.[r.brand] ?? [];
              const ready = r.parts.every((part) =>
                list.some((f) =>
                  f.name.toLowerCase().includes(part.flavorName.toLowerCase()),
                ),
              );
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
                    {r.parts.map((p) => `${p.flavorName} ${p.percentage}%`).join(" · ")}
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
        </Step>
      </div>

      {/* Colonne visuelle + validation */}
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
          <MixStage3DClient
            fill={fill}
            from={colors.from}
            to={colors.to}
            size={bottleScale(bottle?.volume_ml ?? null)}
            complete={pctValid && Boolean(bottle)}
            label={bottle ? `${bottle.volume_ml} ml` : undefined}
            sublabel={brand || "Break Vap"}
          />
          <StageTitle
            title={
              parts.length > 0
                ? (brandFlavors.find((f) => f.id === parts[0]!.flavorId)?.name ??
                  "MON MIX")
                : bottle
                  ? `${bottle.volume_ml} ML`
                  : "MON MIX"
            }
            subtitle={bottle ? `${bottle.volume_ml} ml · ${brand || "Break Vap"}` : undefined}
          />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {parts.length > 0
              ? parts
                  .map(
                    (p) =>
                      `${brandFlavors.find((f) => f.id === p.flavorId)?.name ?? "Arôme"} ${p.percentage}%`,
                  )
                  .join(" + ")
              : "Sélectionnez vos arômes pour remplir le flacon"}
          </p>

          <dl className="mt-5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Flacon</dt>
              <dd>{bottle ? `${bottle.volume_ml} ml` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Nicotine</dt>
              <dd>{formatMixNicotine(nicotine)}/ml (offerte)</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Marque</dt>
              <dd>{brand ?? "—"}</dd>
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

function Step({
  number,
  title,
  done = false,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-3 text-lg">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-all duration-500 ${
            done
              ? "scale-110 border-accent bg-accent/20 text-accent shadow-[0_0_18px_-4px_color-mix(in_oklab,var(--accent)_80%,transparent)]"
              : "border-accent/60 text-accent"
          }`}
        >
          {done ? "✓" : number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Cadre « vitrine premium » autour d'une scène 3D. */
function ShowcaseFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/70"
      style={{
        backgroundImage:
          "radial-gradient(90% 70% at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%), linear-gradient(180deg, #070b09, #040605)",
      }}
    >
      {children}
    </div>
  );
}

function ShowcaseOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="rounded-full border border-border/70 bg-background/70 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
        {children}
      </span>
    </div>
  );
}

/** Titre produit mis en scène sous le flacon. */
function StageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="relative z-10 px-4 pb-4 pt-1 text-center">
      <p
        className="text-lg font-semibold uppercase leading-tight tracking-[0.18em] sm:text-2xl"
        style={{
          fontFamily: "var(--font-serif)",
          textShadow:
            "0 0 18px color-mix(in oklab, var(--accent) 55%, transparent), 0 2px 10px rgba(0,0,0,.6)",
        }}
      >
        {title}
      </p>
      <span
        className="mx-auto mt-2 block h-px w-16 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 85%, transparent), transparent)",
        }}
      />
      {subtitle ? (
        <p className="mt-2 text-xs tracking-wide text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

function CarouselNav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const cls =
    "absolute top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-background/60 text-foreground backdrop-blur transition hover:border-accent";
  return (
    <>
      <button type="button" aria-label="Flacon précédent" onClick={onPrev} className={`${cls} left-2`}>
        ‹
      </button>
      <button type="button" aria-label="Flacon suivant" onClick={onNext} className={`${cls} right-2`}>
        ›
      </button>
    </>
  );
}
