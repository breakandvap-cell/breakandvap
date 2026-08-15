import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  adminMixConfig,
  adminSaveMixRecipe,
  adminSetMixEnabled,
  adminUpdateMixProductPrice,
  adminDeleteMixRecipe,
} from "@/lib/custom-mix-admin.functions";
import {
  MIX_BRANDS,
  MIX_MAX_FLAVORS,
  MIX_MAX_NICOTINE_MG,
  availableNicotineRates,
  computeMixTotalCents,
  formatMixNicotine,
  mixFamilyOf,
  type MixBrand,
} from "@/lib/custom-mix";
import { formatPrice } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/admin/mon-mix")({
  ssr: false,
  component: MixAdminPage,
});

type RecipePart = { flavor_product_id: string; percentage: number };
type RecipeDraft = {
  id: string | null;
  name: string;
  description: string;
  brand: MixBrand;
  suggested_nicotine_mg: number;
  sort_order: number;
  is_active: boolean;
  parts: RecipePart[];
};

const emptyDraft = (): RecipeDraft => ({
  id: null,
  name: "",
  description: "",
  brand: "Alchimix",
  suggested_nicotine_mg: 0,
  sort_order: 0,
  is_active: true,
  parts: [],
});

function MixAdminPage() {
  const load = useServerFn(adminMixConfig);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "mon-mix"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "mon-mix"] });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {(error as Error)?.message ?? "Impossible de charger la configuration."}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Configurateur Mon Mix</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prix des flacons et des arômes, recettes proposées et activation du
          configurateur. Le prix final est toujours recalculé côté serveur.
        </p>
      </header>

      <EnabledSwitch enabled={data.enabled} onDone={refresh} />

      <PriceTable
        title="Flacons vides disponibles — prix final du mix"
        hint="Prix fixe du mix par contenance : peu importe les arômes, les pourcentages ou le taux de nicotine (toujours offerte)."
        rows={data.bottles.map((b) => ({
          id: b.id,
          name: `${b.name}${b.volume_ml ? ` — ${b.volume_ml} ml` : ""}`,
          price_cents: b.price_cents,
          published: b.is_published,
          stock_status: b.stock_status,
        }))}
        onDone={refresh}
      />

      <PriceTable
        title="Prix de vente au flacon 500 ml (vente directe boutique)"
        hint="N'intervient plus dans le prix d'un mix personnalisé : sert uniquement à la vente du flacon 500 ml prêt à vaper en boutique."
        rows={data.flavors.map((f) => ({
          id: f.id,
          name: `${f.name} — ${mixFamilyOf(f) ?? "hors famille"}`,
          price_cents: f.price_cents,
          published: f.is_published,
          stock_status: f.stock_status,
        }))}
        onDone={refresh}
      />

      <RecipesManager
        recipes={data.recipes as unknown as RecipeDraft[]}
        flavors={data.flavors}
        onDone={refresh}
      />

      <LivePreview data={data} />
    </div>
  );
}

function EnabledSwitch({ enabled, onDone }: { enabled: boolean; onDone: () => void }) {
  const fn = useServerFn(adminSetMixEnabled);
  const m = useMutation({
    mutationFn: (next: boolean) => fn({ data: { enabled: next } }),
    onSuccess: () => {
      toast.success("Configurateur mis à jour.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Configurateur actif</h2>
        <p className="text-xs text-muted-foreground">
          Désactivez temporairement « Mon Mix » (rupture d'arômes, maintenance…).
        </p>
      </div>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate(!enabled)}
        className={`rounded-md px-4 py-2 text-sm font-medium transition ${
          enabled
            ? "bg-primary text-primary-foreground"
            : "border border-border text-muted-foreground"
        }`}
      >
        {enabled ? "Activé" : "Désactivé"}
      </button>
    </section>
  );
}

type PriceRow = {
  id: string;
  name: string;
  price_cents: number;
  published: boolean;
  stock_status: string;
};

function PriceTable({
  title,
  hint,
  rows,
  onDone,
}: {
  title: string;
  hint: string;
  rows: PriceRow[];
  onDone: () => void;
}) {
  const fn = useServerFn(adminUpdateMixProductPrice);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (v: { product_id: string; price_cents: number }) => fn({ data: v }),
    onSuccess: () => {
      toast.success("Prix mis à jour.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun produit pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Produit</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Prix (€)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const value = drafts[r.id] ?? (r.price_cents / 100).toFixed(2);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.published ? "Publié" : "Brouillon"} ·{" "}
                      {r.stock_status === "out_of_stock" ? "épuisé" : "en stock"}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={value}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.id]: e.target.value }))
                        }
                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-base sm:text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={m.isPending}
                        onClick={() =>
                          m.mutate({
                            product_id: r.id,
                            price_cents: Math.round(Number(value) * 100),
                          })
                        }
                        className="rounded-md border border-border px-3 py-1 text-xs hover:border-primary"
                      >
                        Enregistrer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type FlavorRow = {
  id: string;
  name: string;
  brand: string | null;
  range_name: string | null;
  subcategory: string | null;
  price_cents: number;
};

function RecipesManager({
  recipes,
  flavors,
  onDone,
}: {
  recipes: RecipeDraft[];
  flavors: FlavorRow[];
  onDone: () => void;
}) {
  const save = useServerFn(adminSaveMixRecipe);
  const del = useServerFn(adminDeleteMixRecipe);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const saveM = useMutation({
    mutationFn: (d: RecipeDraft) =>
      save({
        data: {
          id: d.id,
          name: d.name,
          description: d.description,
          brand: d.brand,
          suggested_nicotine_mg: d.suggested_nicotine_mg,
          sort_order: d.sort_order,
          is_active: d.is_active,
          parts: d.parts,
        },
      }),
    onSuccess: () => {
      toast.success("Recette enregistrée.");
      setDraft(null);
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Recette supprimée.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const familyFlavors = (brand: MixBrand) =>
    flavors.filter((f) => mixFamilyOf(f) === brand);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Recettes populaires</h2>
          <p className="text-xs text-muted-foreground">
            Proposées en un clic aux clients (étape 4 du configurateur).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Nouvelle recette
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {recipes.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{r.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.brand} {r.is_active ? "" : "· inactive"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {(r.parts ?? [])
                .map(
                  (p) =>
                    `${flavors.find((f) => f.id === p.flavor_product_id)?.name ?? "?"} ${p.percentage}%`,
                )
                .join(" · ")}{" "}
              · {formatMixNicotine(Number(r.suggested_nicotine_mg))}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...r,
                    description: r.description ?? "",
                    parts: r.parts ?? [],
                    suggested_nicotine_mg: Number(r.suggested_nicotine_mg),
                  })
                }
                className="rounded-md border border-border px-3 py-1 text-xs hover:border-primary"
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={() => delM.mutate(r.id!)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs text-destructive hover:border-destructive"
              >
                <Trash2 className="h-3 w-3" /> Supprimer
              </button>
            </div>
          </div>
        ))}
        {recipes.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune recette configurée.</p>
        )}
      </div>

      {draft && (
        <RecipeEditor
          draft={draft}
          setDraft={setDraft}
          flavors={familyFlavors(draft.brand)}
          onSave={() => saveM.mutate(draft)}
          saving={saveM.isPending}
        />
      )}
    </section>
  );
}

function RecipeEditor({
  draft,
  setDraft,
  flavors,
  onSave,
  saving,
}: {
  draft: RecipeDraft;
  setDraft: (d: RecipeDraft | null) => void;
  flavors: FlavorRow[];
  onSave: () => void;
  saving: boolean;
}) {
  const total = draft.parts.reduce((s, p) => s + p.percentage, 0);
  const toggle = (id: string) => {
    const exists = draft.parts.some((p) => p.flavor_product_id === id);
    let parts = exists
      ? draft.parts.filter((p) => p.flavor_product_id !== id)
      : [...draft.parts, { flavor_product_id: id, percentage: 0 }];
    if (parts.length > MIX_MAX_FLAVORS) {
      toast.error(`Maximum ${MIX_MAX_FLAVORS} arômes par recette.`);
      return;
    }
    const even = parts.length > 0 ? Math.floor(100 / parts.length) : 0;
    parts = parts.map((p, i) => ({
      ...p,
      percentage: i === parts.length - 1 ? 100 - even * (parts.length - 1) : even,
    }));
    setDraft({ ...draft, parts });
  };

  return (
    <div className="space-y-4 rounded-lg border border-primary/40 bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Nom
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
          />
        </label>
        <label className="text-sm">
          Famille
          <select
            value={draft.brand}
            onChange={(e) =>
              setDraft({ ...draft, brand: e.target.value as MixBrand, parts: [] })
            }
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
          >
            {MIX_BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
          />
        </label>
        <label className="text-sm">
          Nicotine suggérée (mg)
          <input
            type="number"
            min="0"
            max={MIX_MAX_NICOTINE_MG}
            step="0.1"
            value={draft.suggested_nicotine_mg}
            onChange={(e) =>
              setDraft({ ...draft, suggested_nicotine_mg: Number(e.target.value) })
            }
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
          />
        </label>
        <label className="text-sm">
          Ordre d'affichage
          <input
            type="number"
            min="0"
            value={draft.sort_order}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          />
          Visible côté client
        </label>
      </div>

      <div>
        <p className="text-sm font-medium">Arômes ({draft.brand})</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {flavors.map((f) => {
            const selected = draft.parts.some((p) => p.flavor_product_id === f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/60"
                }`}
              >
                {f.name} · {formatPrice(f.price_cents)}/500 ml
              </button>
            );
          })}
          {flavors.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun arôme publié dans cette famille.
            </p>
          )}
        </div>
      </div>

      {draft.parts.length > 0 && (
        <div className="space-y-2">
          {draft.parts.map((p) => (
            <div key={p.flavor_product_id} className="flex items-center gap-3 text-sm">
              <span className="flex-1">
                {flavors.find((f) => f.id === p.flavor_product_id)?.name ?? "Arôme"}
              </span>
              <input
                type="number"
                min="1"
                max="100"
                value={p.percentage}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    parts: draft.parts.map((x) =>
                      x.flavor_product_id === p.flavor_product_id
                        ? { ...x, percentage: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-base sm:text-sm"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          ))}
          <p className={`text-xs ${total === 100 ? "text-accent" : "text-destructive"}`}>
            Total : {total} % {total === 100 ? "" : "— doit valoir exactement 100 %."}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || total !== 100 || draft.name.trim().length < 2}
          onClick={onSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "…" : "Enregistrer la recette"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="rounded-md border border-border px-4 py-2 text-sm"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function LivePreview({
  data,
}: {
  data: {
    bottles: Array<{ id: string; name: string; volume_ml: number | null; price_cents: number }>;
    flavors: FlavorRow[];
    boosterVolumeMl: number;
    boosterConcentrationMgPerMl: number;
    enabled: boolean;
  };
}) {
  const [bottleId, setBottleId] = useState<string | null>(data.bottles[0]?.id ?? null);
  const bottle = data.bottles.find((b) => b.id === bottleId) ?? null;
  const flavor = data.flavors[0] ?? null;

  const rates = useMemo(
    () =>
      availableNicotineRates(bottle?.volume_ml ?? null, {
        boosterVolumeMl: data.boosterVolumeMl,
        boosterConcentrationMgPerMl: data.boosterConcentrationMgPerMl,
      }),
    [bottle?.volume_ml, data.boosterVolumeMl, data.boosterConcentrationMgPerMl],
  );

  const example = bottle
    ? computeMixTotalCents({ bottlePriceCents: bottle.price_cents })
    : null;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">Aperçu des paramètres appliqués</h2>
      <p className="text-xs text-muted-foreground">
        Configurateur {data.enabled ? "actif" : "désactivé"} · booster{" "}
        {data.boosterVolumeMl} ml à {data.boosterConcentrationMgPerMl} mg/ml.
      </p>
      <label className="block text-sm">
        Flacon simulé
        <select
          value={bottleId ?? ""}
          onChange={(e) => setBottleId(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
        >
          {data.bottles.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.volume_ml ? `— ${b.volume_ml} ml` : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm">
        Taux de nicotine proposés :{" "}
        {rates.map((r) => formatMixNicotine(r)).join(" · ") || "—"}
      </p>
      {example != null && bottle && (
        <p className="text-sm">
          Exemple : flacon {bottle.volume_ml ?? "—"} ml choisi ={" "}
          <strong>{formatPrice(example)}</strong>, peu importe la composition (1, 2 ou 3
          arômes) et le taux de nicotine, toujours offert.
        </p>
      )}
    </section>
  );
}
