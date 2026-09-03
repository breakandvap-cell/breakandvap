import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlavorAvailabilityChecker,
  duplicateFromCreate,
} from "@/lib/mix-flavor-form";
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
  adminCreateMixFlavor,
  adminCheckMixFlavorAvailability,
  adminDeleteMixProduct,
  adminSetMixBulkBoosterPrice,
  adminUpdateMixFlavorColor,
} from "@/lib/custom-mix-admin.functions";
import { adminUploadProductPhoto } from "@/lib/admin.functions";
import { optimizeImage } from "@/lib/image-optimize";
import {
  MIX_BRANDS,
  MIX_MAX_FLAVORS,
  MIX_MAX_NICOTINE_MG,
  availableNicotineRates,
  computeMixTotalCents,
  formatMixNicotine,
  mixFamilyOf,
  guessLiquidColor,
  resolveLiquidColor,
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
        title="Flacons disponibles — prix final du mix"
        hint="Prix fixe du mix par contenance : peu importe les arômes ou les pourcentages. Nicotine offerte, sauf sur le format 500 ml (arôme seul, un seul arôme à 100 %, boosters facturés)."
        rows={data.bottles.map((b) => ({
          id: b.id,
          name: `${b.name}${b.volume_ml ? ` — ${b.volume_ml} ml` : ""}`,
          price_cents: b.price_cents,
          published: b.is_published,
          stock_status: b.stock_status,
        }))}
        editKind="standard"
        onDone={refresh}
      />

      <BulkBoosterPrice
        priceCents={data.bulkBoosterPriceCents}
        onDone={refresh}
      />

      <QuickFlavorCreator onDone={refresh} />

      <PriceTable
        title="Prix de vente au flacon 500 ml (vente directe boutique)"
        hint="N'intervient plus dans le prix d'un mix personnalisé : sert uniquement à la vente du flacon 500 ml prêt à vaper en boutique."
        rows={data.flavors.map((f) => ({
          id: f.id,
          name: `${f.name} — ${mixFamilyOf(f) ?? "hors famille"}`,
          price_cents: f.price_cents,
          published: f.is_published,
          stock_status: f.stock_status,
          liquid_color: (f as { liquid_color?: string | null }).liquid_color ?? null,
          raw_name: f.name,
        }))}
        editKind="eliquide"
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
  return <EnabledSwitchInner enabled={enabled} onDone={onDone} />;
}

/** Prix par booster de nicotine sur le format 500 ml (nicotine payante). */
function BulkBoosterPrice({
  priceCents,
  onDone,
}: {
  priceCents: number;
  onDone: () => void;
}) {
  const fn = useServerFn(adminSetMixBulkBoosterPrice);
  const [value, setValue] = useState((priceCents / 100).toFixed(2));
  const m = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(value.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0) throw new Error("Prix invalide.");
      return fn({ data: { price_cents: cents } });
    },
    onSuccess: () => {
      toast.success("Prix par booster mis à jour.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <section className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">
          Prix par booster nicotine sur 500 ml
        </h2>
        <p className="text-xs text-muted-foreground">
          Uniquement pour le format 500 ml (nicotine payante, boosters fournis
          séparément). Les autres contenances gardent la nicotine offerte.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Prix par booster en euros"
          className="h-11 w-28 rounded-md border border-input bg-background px-3 text-base"
        />
        <span className="text-sm text-muted-foreground">€</span>
        <button
          type="button"
          disabled={m.isPending}
          onClick={() => m.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </section>
  );
}

function QuickFlavorCreator({ onDone }: { onDone: () => void }) {
  const create = useServerFn(adminCreateMixFlavor);
  const checkAvailability = useServerFn(adminCheckMixFlavorAvailability);
  const upload = useServerFn(adminUploadProductPhoto);
  const [open, setOpen] = useState<MixBrand | null>(null);
  const [flavor, setFlavor] = useState("");
  const [price, setPrice] = useState("17.90");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<
    { id: string | null; name: string } | null
  >(null);
  const [checking, setChecking] = useState(false);

  // Vérification côté client (débouncée) de l'unicité du slug/nom avant envoi.
  const checkerRef = useRef<FlavorAvailabilityChecker | null>(null);
  useEffect(() => {
    setDuplicate(null);
    if (!open) {
      checkerRef.current?.cancel();
      setChecking(false);
      return;
    }
    const checker =
      checkerRef.current ??
      (checkerRef.current = new FlavorAvailabilityChecker((input) =>
        checkAvailability({ data: { brand: input.brand as MixBrand, flavor: input.flavor } }),
      ));
    checker.schedule(
      { brand: open, flavor },
      { onChecking: setChecking, onResult: setDuplicate },
    );
    return () => checker.cancel();
  }, [flavor, open, checkAvailability]);

  const reset = () => {
    setOpen(null);
    setFlavor("");
    setPrice("17.90");
    setPhotoUrl(null);
    setColor(null);
    setDuplicate(null);
  };

  const m = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(price.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0) {
        throw new Error("Prix invalide.");
      }
      return create({
        data: {
          brand: open as MixBrand,
          flavor: flavor.trim(),
          price_cents: cents,
          photo_url: photoUrl,
          liquid_color: color,
        },
      });
    },
    onMutate: () => setDuplicate(null),
    onSuccess: (res) => {
      const outcome = duplicateFromCreate(res);
      if (outcome.kind === "duplicate") {
        setDuplicate(outcome.duplicate);
        toast.error("Un arôme avec ce nom existe déjà.");
        return;
      }
      toast.success(`« ${res.status === "created" ? res.product.name : ""} » créé.`);
      reset();
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const optimized = await optimizeImage(file);
      const res = await upload({
        data: {
          filename: optimized.filename,
          contentType: optimized.contentType,
          base64: optimized.base64,
        },
      });
      setPhotoUrl(res.url);
      toast.success("Photo ajoutée.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Ajouter un arôme</h2>
          <p className="text-xs text-muted-foreground">
            Création rapide d'un arôme « Mon Mix » : nom du goût, photo et prix
            500 ml. Tous les autres champs sont pré-remplis. Le produit reste
            modifiable via la fiche produit classique.
          </p>
        </div>
        <div className="flex gap-2">
          {MIX_BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setOpen(open === b ? null : b)}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                open === b
                  ? "bg-primary text-primary-foreground"
                  : "border border-border"
              }`}
            >
              <Plus className="h-4 w-4" /> {b}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <form
          className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          {duplicate && (
            <div
              role="alert"
              className="sm:col-span-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              Un arôme avec ce nom existe déjà. Choisissez un autre nom ou
              modifiez le produit existant.
              {duplicate.id && (
                <Link
                  to="/admin/produits/eliquide/$id"
                  params={{ id: duplicate.id }}
                  className="ml-1 font-medium underline underline-offset-2"
                >
                  Ouvrir « {duplicate.name} »
                </Link>
              )}
            </div>
          )}
          <div className="sm:col-span-1">

            <label className="text-sm font-medium" htmlFor="quick-flavor-name">
              Nom du goût *
            </label>
            <input
              id="quick-flavor-name"
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
              placeholder="Fruit du Dragon"
              aria-invalid={duplicate != null}
              className={`mt-1 h-11 w-full rounded-md border bg-background px-3 text-base ${
                duplicate ? "border-destructive" : "border-input"
              }`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Nom final : {open} {flavor.trim() || "…"}
              {checking && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Vérification…
                </span>
              )}
            </p>
            {duplicate && (
              <p className="mt-1 text-xs font-medium text-destructive">
                Ce nom est déjà utilisé.
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="quick-flavor-price">
              Prix 500 ml (€) *
            </label>
            <input
              id="quick-flavor-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            />
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="quick-flavor-photo">
              Photo
            </label>
            <input
              id="quick-flavor-photo"
              type="file"
              accept="image/*"
              onChange={(e) => void handleFile(e.target.files?.[0])}
              className="mt-1 w-full text-sm"
            />
            {uploading && (
              <p className="mt-1 text-xs text-muted-foreground">Envoi…</p>
            )}
            {photoUrl && (
              <img
                src={photoUrl}
                alt="Aperçu de l'arôme"
                loading="lazy"
                className="mt-2 h-16 w-16 rounded object-cover"
              />
            )}
          </div>

          <div className="sm:col-span-3">
            <label className="text-sm font-medium" htmlFor="quick-flavor-color">
              Couleur du liquide
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="quick-flavor-color"
                type="color"
                value={color ?? guessLiquidColor(flavor)}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="h-10 w-14 cursor-pointer rounded border border-input bg-background"
              />
              {color ? (
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className="text-xs text-muted-foreground underline"
                >
                  Revenir à la couleur automatique
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Déduite automatiquement du nom du goût.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={
                m.isPending ||
                uploading ||
                checking ||
                duplicate != null ||
                flavor.trim().length < 2
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer l'arôme
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Annuler
            </button>
            <span className="text-xs text-muted-foreground">
              Stock initial 0 — à ajuster ensuite via la gestion de stock.
            </span>
          </div>
        </form>
      )}
    </section>
  );
}

function EnabledSwitchInner({ enabled, onDone }: { enabled: boolean; onDone: () => void }) {
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
  liquid_color?: string | null;
  raw_name?: string;
};

/** Édition de la couleur du liquide affichée dans le flacon du configurateur. */
function LiquidColorCell({
  row,
  onDone,
}: {
  row: PriceRow;
  onDone: () => void;
}) {
  const fn = useServerFn(adminUpdateMixFlavorColor);
  const name = row.raw_name ?? row.name;
  const stored = row.liquid_color ?? null;
  const [value, setValue] = useState<string>(
    stored ?? resolveLiquidColor({ name, liquid_color: stored }),
  );
  const m = useMutation({
    mutationFn: (liquid_color: string | null) =>
      fn({ data: { product_id: row.id, liquid_color } }),
    onSuccess: () => {
      toast.success("Couleur du liquide mise à jour.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`Couleur du liquide de ${name}`}
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-background"
      />
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate(value)}
        className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary"
      >
        OK
      </button>
      <button
        type="button"
        disabled={m.isPending || !stored}
        onClick={() => {
          setValue(guessLiquidColor(name));
          m.mutate(null);
        }}
        className="text-xs text-muted-foreground underline disabled:opacity-40"
        title="Revenir à la couleur déduite du nom du goût"
      >
        auto
      </button>
      {!stored && (
        <span className="text-[11px] text-muted-foreground">auto</span>
      )}
    </div>
  );
}

function PriceTable({
  title,
  hint,
  rows,
  editKind,
  onDone,
}: {
  title: string;
  hint: string;
  rows: PriceRow[];
  editKind: "standard" | "eliquide";
  onDone: () => void;
}) {
  const fn = useServerFn(adminUpdateMixProductPrice);
  const removeFn = useServerFn(adminDeleteMixProduct);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (v: { product_id: string; price_cents: number }) => fn({ data: v }),
    onSuccess: () => {
      toast.success("Prix mis à jour.");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delM = useMutation({
    mutationFn: (v: { product_id: string; unpublish: boolean; name: string }) =>
      removeFn({ data: { product_id: v.product_id, unpublish: v.unpublish } }).then(
        (res) => ({ ...res, input: v }),
      ),
    onSuccess: (res) => {
      if (res.status === "deleted") {
        toast.success(`« ${res.input.name} » supprimé.`);
        onDone();
        return;
      }
      if (res.status === "unpublished") {
        toast.success(`« ${res.input.name} » dépublié (historique conservé).`);
        onDone();
        return;
      }
      const detail = res.reasons.join(" · ");
      if (
        confirm(
          `Suppression impossible : ce produit est utilisé dans ${detail}.\n\nVoulez-vous le dépublier à la place (il disparaît de la boutique, l'historique est conservé) ?`,
        )
      ) {
        delM.mutate({ ...res.input, unpublish: true });
      }
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
                {editKind === "eliquide" && (
                  <th className="px-3 py-2">Couleur liquide</th>
                )}
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
                    {editKind === "eliquide" && (
                      <td className="px-3 py-2">
                        <LiquidColorCell row={r} onDone={onDone} />
                      </td>
                    )}
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
                      <Link
                        to={
                          editKind === "eliquide"
                            ? "/admin/produits/eliquide/$id"
                            : "/admin/produits/$id"
                        }
                        params={{ id: r.id }}
                        className="ml-2 inline-block rounded-md border border-border px-3 py-1 text-xs hover:border-primary"
                      >
                        Modifier
                      </Link>
                      <button
                        type="button"
                        disabled={delM.isPending}
                        onClick={() => {
                          if (confirm(`Supprimer définitivement « ${r.name} » ?`)) {
                            delM.mutate({ product_id: r.id, unpublish: false, name: r.name });
                          }
                        }}
                        className="ml-2 inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs text-destructive hover:border-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Supprimer
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
                onClick={() => {
                  if (confirm(`Supprimer définitivement la recette « ${r.name} » ?`)) {
                    delM.mutate(r.id!);
                  }
                }}
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
