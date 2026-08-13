import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { MixBottleVisual } from "@/components/mix-bottle-visual";
import { formatPrice } from "@/lib/products";
import { useCart } from "@/lib/cart";
import {
  getMixSessionId,
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

type Part = { flavorId: string; percentage: number };

export function CustomMixConfigurator() {
  const cart = useCart();
  const saveDraft = useServerFn(saveCustomMixDraft);
  const validate = useServerFn(validateCustomMix);

  const { data: bottles = [], isLoading: bottlesLoading } = useQuery(
    mixBottlesQueryOptions(),
  );
  const { data: flavorsByBrand } = useQuery(mixFlavorsByBrandQueryOptions());

  const [bottleId, setBottleId] = useState<string | null>(null);
  const [nicotine, setNicotine] = useState(0);
  const [brand, setBrand] = useState<MixBrand | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [submitting, setSubmitting] = useState(false);

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

  const colors = brand ? MIX_BRAND_COLORS[brand] : { from: "#9aa5b1", to: "#4b5563" };
  const fill = Math.min(
    1,
    (nicotine > 0 ? 0.12 : 0) + 0.88 * Math.min(100, totalPct) / 100,
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
        <Step number={1} title="Choisissez votre contenance">
          {bottlesLoading ? (
            <p className="text-sm text-muted-foreground">Chargement des flacons…</p>
          ) : bottles.length === 0 ? (
            <EmptyNote>Aucun flacon vide n'est disponible pour le moment.</EmptyNote>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bottles.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBottleId(b.id)}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    bottleId === b.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/60"
                  }`}
                >
                  <span className="block text-sm font-medium">{b.volume_ml} ml</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatPrice(b.price_cents)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Step>

        {/* Étape 2 — Nicotine */}
        <Step number={2} title="Réglez votre taux de nicotine">
          <div className="max-w-md space-y-3">
            <Slider
              value={[nicotine]}
              min={0}
              max={MIX_MAX_NICOTINE_MG}
              step={1}
              onValueChange={(v) => setNicotine(v[0] ?? 0)}
              aria-label="Taux de nicotine"
            />
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{nicotine} mg/ml</span>
              <span className="text-xs text-accent">Nicotine offerte, sans supplément</span>
            </div>
          </div>
        </Step>

        {/* Étape 3 — Arômes */}
        <Step number={3} title="Composez vos arômes">
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
            <EmptyNote>Les arômes {brand} arrivent bientôt.</EmptyNote>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {brandFlavors.map((f) => {
                  const selected = parts.some((p) => p.flavorId === f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFlavor(f.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/60"
                      }`}
                    >
                      <span>{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatPrice(f.price_cents)}
                      </span>
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
        <div className="rounded-xl border border-border bg-card p-5">
          <MixBottleVisual
            fill={fill}
            from={colors.from}
            to={colors.to}
            volumeLabel={bottle ? `${bottle.volume_ml} ml` : null}
            caption={
              parts.length > 0
                ? parts
                    .map(
                      (p) =>
                        `${brandFlavors.find((f) => f.id === p.flavorId)?.name ?? "Arôme"} ${p.percentage}%`,
                    )
                    .join(" + ")
                : "Sélectionnez vos arômes pour remplir le flacon"
            }
          />

          <dl className="mt-5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Flacon</dt>
              <dd>{bottle ? `${bottle.volume_ml} ml` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Nicotine</dt>
              <dd>{nicotine} mg/ml (offerte)</dd>
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
            className="mt-4 w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
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
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-3 text-lg">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/60 text-xs text-accent">
          {number}
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
