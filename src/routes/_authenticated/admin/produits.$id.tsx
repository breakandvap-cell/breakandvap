import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetProduct,
  adminUpsertProduct,
  adminUploadProductPhoto,
  adminListVariants,
  type ProductInput,
} from "@/lib/admin.functions";
import {
  CATEGORY_LABELS,
  NICOTINE_STEPS_MG_10ML,
  NICOTINE_STEPS_MG_BOOSTER,
  VOLUME_OPTIONS_ML,
} from "@/lib/products";
import { useState, useEffect, useMemo, useRef, type FormEvent, type ChangeEvent } from "react";
import { toast } from "sonner";
import { X, Upload, Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/produits/$id")({
  ssr: false,
  component: EditProduct,
});

type FormState = ProductInput;
type FormVariant = NonNullable<FormState["variants"]>[number];
type FormFlavor = NonNullable<FormState["flavors"]>[number];

const ADMIN_CATEGORIES = [
  "cbd",
  "e_liquide",
  "accessoire_vape",
  "accessoire_cbd",
] as const satisfies ReadonlyArray<FormState["category"]>;

const empty: FormState = {
  name: "",
  slug: "",
  category: "cbd",
  subcategory: "",
  description: "",
  price_cents: 0,
  currency: "EUR",
  stock: 0,
  stock_status: "in_stock",
  is_published: true,
  photos: [],
  cbd_percent: null,
  thc_percent: null,
  nicotine_mg: null,
  health_warnings: "",
  coa_url: "",
  variants: [],
  is_nicotine_booster: false,
  flavors: [],
};

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function EditProduct() {
  const { id } = Route.useParams();
  const isNew = id === "nouveau";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(adminGetProduct);
  const save = useServerFn(adminUpsertProduct);
  const upload = useServerFn(adminUploadProductPhoto);
  const listVariantsFn = useServerFn(adminListVariants);

  const { data: existing, isLoading: loadingExisting, error: loadError } = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: () => get({ data: { id } }),
    enabled: !isNew,
    retry: false,
  });

  const { data: existingVariants } = useQuery({
    queryKey: ["admin", "product-variants", id],
    queryFn: () => listVariantsFn({ data: { productId: id } }),
    enabled: !isNew,
    retry: false,
  });

  const [form, setForm] = useState<FormState>(empty);
  const [priceEuros, setPriceEuros] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Variantes = option activable. Décochée par défaut : produit à prix/stock uniques.
  const [hasVariants, setHasVariants] = useState<boolean>(false);
  // Variantes de goût = option activable, indépendante des variantes de volume.
  const [hasFlavors, setHasFlavors] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (existing) {
      const rawFlavors = Array.isArray((existing as { flavors?: unknown }).flavors)
        ? ((existing as { flavors: unknown[] }).flavors as Array<{ name?: unknown; stock?: unknown }>)
            .map((f) => ({
              name: typeof f?.name === "string" ? f.name : "",
              stock:
                typeof f?.stock === "number" && Number.isFinite(f.stock)
                  ? Math.max(0, Math.trunc(f.stock))
                  : 0,
            }))
            .filter((f) => f.name.trim().length > 0)
        : [];
      setForm({
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        category:
          existing.category === "accessoire"
            ? "accessoire_vape"
            : (existing.category as FormState["category"]),
        subcategory: existing.subcategory ?? "",
        description: existing.description ?? "",
        price_cents: existing.price_cents,
        currency: existing.currency,
        stock: existing.stock,
        stock_status: existing.stock_status,
        is_published: existing.is_published,
        photos: existing.photos ?? [],
        cbd_percent: existing.cbd_percent,
        thc_percent: existing.thc_percent,
        nicotine_mg: existing.nicotine_mg,
        health_warnings: existing.health_warnings ?? "",
        coa_url: existing.coa_url ?? "",
        variants: [],
        is_nicotine_booster: Boolean(existing.is_nicotine_booster),
        flavors: rawFlavors,
      });
      setPriceEuros((existing.price_cents / 100).toFixed(2));
      setSlugTouched(true);
      if (rawFlavors.length > 0) setHasFlavors(true);
    }
  }, [existing]);

  useEffect(() => {
    if (existingVariants) {
      const list = existingVariants.map((v) => ({
        id: v.id,
        volume_ml: v.volume_ml,
        price_cents: v.price_cents,
        stock: v.stock,
        max_nicotine_mg: v.max_nicotine_mg ?? null,
        available_nicotine_mg: (v.available_nicotine_mg ?? []) as number[],
        boosters_per_nicotine:
          (v.boosters_per_nicotine as Record<string, number> | null) ?? {},
      }));
      setForm((f) => ({
        ...f,
        variants: list,
      }));
      if (list.length > 0) setHasVariants(true);
    }
  }, [existingVariants]);

  // Auto-slug depuis le nom tant que l'utilisateur ne l'a pas édité.
  useEffect(() => {
    if (!slugTouched) {
      setForm((f) => ({ ...f, slug: slugify(f.name) }));
    }
  }, [form.name, slugTouched]);

  const missing = useMemo(() => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("nom");
    if (!form.category) errs.push("catégorie");
    if (!form.price_cents || form.price_cents <= 0) errs.push("prix");
    if (!form.photos || form.photos.length === 0) errs.push("au moins une photo");
    if (!form.slug || !/^[a-z0-9-]+$/.test(form.slug)) errs.push("slug URL valide");
    return errs;
  }, [form]);

  // Validations spécifiques catégorie CBD.
  const cbdErrors = useMemo(() => {
    const errs: string[] = [];
    if (form.category !== "cbd") return errs;
    const cbd = form.cbd_percent;
    const thc = form.thc_percent;
    if (cbd === null || cbd === undefined || Number.isNaN(cbd)) {
      errs.push("Le taux de CBD est obligatoire (valeur numérique en %).");
    } else if (!Number.isFinite(cbd) || cbd <= 0 || cbd > 100) {
      errs.push("Le taux de CBD doit être un nombre compris entre 0,1 et 100 %.");
    }
    if (thc === null || thc === undefined || Number.isNaN(thc)) {
      errs.push("Le taux de THC est obligatoire (0 autorisé) pour la conformité France.");
    } else if (!Number.isFinite(thc) || thc < 0 || thc > 100) {
      errs.push("Le taux de THC doit être un nombre positif compris entre 0 et 100 %.");
    } else if (thc > 0.3) {
      errs.push("Le taux de THC doit rester ≤ 0,3 % pour être vendu légalement en France.");
    }
    if (
      cbd !== null && cbd !== undefined && !Number.isNaN(cbd) &&
      thc !== null && thc !== undefined && !Number.isNaN(thc) &&
      Number.isFinite(cbd) && Number.isFinite(thc) &&
      thc > cbd
    ) {
      errs.push("Incohérence : le taux de THC ne peut pas être supérieur au taux de CBD.");
    }
    return errs;
  }, [form.category, form.cbd_percent, form.thc_percent]);

  const variantErrors = useMemo(() => {
    const errs: string[] = [];
    // Les variantes ne sont vérifiées que si l'admin a activé l'option
    // « plusieurs formats » sur un e-liquide. Sinon on ignore complètement.
    if (form.category !== "e_liquide" || !hasVariants) return errs;
    const variants = form.variants ?? [];
    if (variants.length === 0) {
      errs.push(
        "Ajoute au moins une variante de volume (10, 50, 100 ou 200 ml) pour ce e-liquide.",
      );
    }
    const seen = new Set<number>();
    for (const [i, v] of variants.entries()) {
      const label = `Variante #${i + 1}`;
      if (!v.volume_ml || v.volume_ml <= 0) {
        errs.push(`${label} : volume manquant.`);
      } else if (seen.has(v.volume_ml)) {
        errs.push(`${label} : le volume ${v.volume_ml} ml est déjà défini.`);
      } else {
        seen.add(v.volume_ml);
      }
      if (!Number.isInteger(v.price_cents) || v.price_cents <= 0) {
        errs.push(`${label} (${v.volume_ml || "?"} ml) : prix requis.`);
      }
      if (!Number.isInteger(v.stock) || v.stock < 0) {
        errs.push(`${label} (${v.volume_ml || "?"} ml) : stock invalide.`);
      }
      const taux = v.available_nicotine_mg ?? [];
      if (taux.length === 0) {
        errs.push(
          `${label} (${v.volume_ml || "?"} ml) : coche au moins un taux de nicotine.`,
        );
      }
      if (v.volume_ml !== 10) {
        for (const mg of taux) {
          if (mg === 0) continue;
          const n = (v.boosters_per_nicotine ?? {})[String(mg)];
          if (!Number.isInteger(n) || (n as number) <= 0) {
            errs.push(
              `${label} (${v.volume_ml} ml) : indique le nombre de boosters nécessaires pour ${mg} mg.`,
            );
          }
        }
      }
    }
    return errs;
  }, [form.category, form.variants, hasVariants]);

  const flavorErrors = useMemo(() => {
    const errs: string[] = [];
    if (!hasFlavors) return errs;
    const flavors = form.flavors ?? [];
    if (flavors.length === 0) {
      errs.push("Ajoute au moins un goût, ou décoche l'option « plusieurs goûts ».");
    }
    const seen = new Set<string>();
    for (const [i, f] of flavors.entries()) {
      const name = (f.name ?? "").trim();
      if (!name) errs.push(`Goût #${i + 1} : nom manquant.`);
      else if (seen.has(name.toLowerCase()))
        errs.push(`Goût « ${name} » : ce goût est en doublon.`);
      else seen.add(name.toLowerCase());
      if (!Number.isInteger(f.stock) || f.stock < 0)
        errs.push(`Goût « ${name || "?"} » : stock invalide.`);
    }
    return errs;
  }, [hasFlavors, form.flavors]);

  const m = useMutation({
    mutationFn: (payload: FormState) => save({ data: payload }),
    onSuccess: async () => {
      toast.success(isNew ? "Produit créé avec succès." : "Modifications enregistrées.");
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["admin", "product", id] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      navigate({ to: "/admin/produits" });
    },
    onError: (e) => toast.error((e as Error).message || "Enregistrement impossible."),
  });

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} : format non supporté.`);
          continue;
        }
        if (file.size > 4 * 1024 * 1024) {
          toast.error(`${file.name} : trop lourd (4 Mo max).`);
          continue;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Lecture du fichier échouée."));
          reader.readAsDataURL(file);
        });
        try {
          const res = await upload({
            data: { filename: file.name, contentType: file.type, base64 },
          });
          setForm((f) => ({ ...f, photos: [...(f.photos ?? []), res.url] }));
          toast.success(`${file.name} ajoutée.`);
        } catch (err) {
          toast.error(`${file.name} : ${(err as Error).message}`);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(idx: number) {
    setForm((f) => ({ ...f, photos: (f.photos ?? []).filter((_, i) => i !== idx) }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (missing.length > 0) {
      toast.error(`Champs obligatoires manquants : ${missing.join(", ")}.`);
      return;
    }
    if (cbdErrors.length > 0) {
      toast.error(cbdErrors[0]);
      return;
    }
    if (variantErrors.length > 0) {
      toast.error(variantErrors[0]);
      return;
    }
    if (flavorErrors.length > 0) {
      toast.error(flavorErrors[0]);
      return;
    }
    // Si l'option variantes n'est pas activée, on n'envoie aucune variante,
    // même si le formulaire en contenait (édition ultérieure).
    const payload: FormState = {
      ...form,
      variants: form.category === "e_liquide" && hasVariants ? form.variants ?? [] : [],
      flavors: hasFlavors
        ? (form.flavors ?? []).map((f) => ({
            name: f.name.trim(),
            stock: Math.max(0, Math.trunc(f.stock)),
          }))
        : [],
    };
    m.mutate(payload);
  }

  if (!isNew && loadingExisting) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du produit…
      </div>
    );
  }
  if (!isNew && loadError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Impossible de charger ce produit : {(loadError as Error).message}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/produits"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">
        {isNew ? "Nouveau produit" : `Modifier : ${existing?.name ?? ""}`}
      </h1>

      <form onSubmit={submit} className="space-y-6" noValidate>
        {/* Bloc 1 — informations principales */}
        <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
          <Field label="Intitulé du produit" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex. Fleur CBD Amnesia 5g"
            />
          </Field>

          <Field
            label="Adresse URL (slug)"
            required
            hint="Généré automatiquement à partir du nom. Modifiable."
          >
            <input
              className="input"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value.toLowerCase() });
              }}
              placeholder="fleur-cbd-amnesia-5g"
            />
          </Field>

          <Field label="Description">
            <textarea
              className="input min-h-[120px]"
              rows={5}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description commerciale du produit, sensations, format, origine…"
            />
          </Field>
        </section>

        {/* Bloc 2 — catégorie */}
        <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
          <Field label="Catégorie" required>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ADMIN_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, category: c })}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    form.category === c
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Les accessoires sont classés en « Vape » (résistances, drip tips,
              cotons, flacons vides…) ou « CBD » (grinders, papiers sans tabac,
              boîtes de conservation…).
            </p>
          </Field>

          {form.category === "cbd" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Taux de CBD (%)">
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.cbd_percent ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cbd_percent: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Taux de THC (%)" hint="Doit rester ≤ 0,3 % en France.">
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={form.thc_percent ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      thc_percent: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          )}

          {form.category === "e_liquide" && (
            <div className="space-y-3">
              <label className="flex items-start gap-2 rounded-md border border-border bg-background/30 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={hasVariants}
                  onChange={(e) => setHasVariants(e.target.checked)}
                />
                <span>
                  <strong>Ce produit a plusieurs formats / volumes.</strong>{" "}
                  Coche cette case uniquement pour les e-liquides déclinés en
                  50 / 100 / 200 ml (base + boosters) ou avec plusieurs taux de
                  nicotine sur un même 10 ml. Sinon, laisse décoché : le prix
                  et le stock du produit s'appliquent tels quels.
                </span>
              </label>
              {hasVariants && (
                <VariantsEditor
                  variants={form.variants ?? []}
                  onChange={(vs) => setForm((f) => ({ ...f, variants: vs }))}
                />
              )}
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-start gap-2 rounded-md border border-border bg-background/30 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={hasFlavors}
                onChange={(e) => setHasFlavors(e.target.checked)}
              />
              <span>
                <strong>Ce produit a plusieurs goûts.</strong>{" "}
                Coche cette case si le produit se décline en plusieurs
                saveurs (ex. Fraise, Menthe, Fruits rouges…). Chaque goût
                dispose de son propre stock. Indépendant du volume et du taux
                de nicotine, et ne modifie pas le prix.
              </span>
            </label>
            {hasFlavors && (
              <FlavorsEditor
                flavors={form.flavors ?? []}
                onChange={(fs) => setForm((f) => ({ ...f, flavors: fs }))}
              />
            )}
          </div>

          <Field label="Sous-catégorie (optionnel)">
            <input
              className="input"
              value={form.subcategory ?? ""}
              onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
              placeholder="Ex. fleurs, résines, pods, batteries…"
            />
          </Field>
        </section>

        {/* Bloc 3 — prix & stock */}
        <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prix TTC (€)" required>
              <input
                className="input"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.,][0-9]{1,2})?"
                value={priceEuros}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  setPriceEuros(v);
                  const n = Number(v);
                  setForm({
                    ...form,
                    price_cents: Number.isFinite(n) ? Math.round(n * 100) : 0,
                  });
                }}
                placeholder="24.90"
              />
            </Field>
            <Field label="Stock initial" required>
              <input
                className="input"
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="État du stock">
              <select
                className="input"
                value={form.stock_status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stock_status: e.target.value as ProductInput["stock_status"],
                  })
                }
              >
                <option value="in_stock">En stock</option>
                <option value="low_stock">Stock limité</option>
                <option value="out_of_stock">Épuisé</option>
              </select>
            </Field>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
            />
            Publier ce produit dans le catalogue en ligne
          </label>

          {form.category === "accessoire_vape" && (
            <label className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(form.is_nicotine_booster)}
                onChange={(e) =>
                  setForm({ ...form, is_nicotine_booster: e.target.checked })
                }
              />
              <span>
                <strong>Ce produit est LE Booster de nicotine.</strong> Son prix
                sera utilisé automatiquement pour calculer le prix des e-liquides
                (50 / 100 / 200 ml) selon le nombre de boosters requis. Un seul
                produit à la fois peut porter ce rôle : cocher ici retirera le
                rôle des autres accessoires.
              </span>
            </label>
          )}
        </section>

        {/* Bloc 4 — photos */}
        <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">
                Photos <span className="text-destructive">*</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Formats acceptés : JPG, PNG, WEBP, AVIF, GIF. 4 Mo max par photo. La
                première photo sert d'image principale.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                id="photo-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFiles}
              />
              <label
                htmlFor="photo-input"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary ${
                  uploading ? "opacity-60" : ""
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? "Envoi en cours…" : "Ajouter des photos"}
              </label>
            </div>
          </div>

          {form.photos && form.photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {form.photos.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border bg-black/20"
                >
                  <img
                    src={url}
                    alt={`Aperçu ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {idx === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Principale
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100"
                    aria-label="Supprimer la photo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-background/30 p-6 text-center text-xs text-muted-foreground">
              Aucune photo pour l'instant. Ajoute au moins une photo avant d'enregistrer.
            </div>
          )}
        </section>

        {/* Bloc 5 — infos avancées */}
        <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
          <Field label="Avertissements sanitaires (optionnel)">
            <textarea
              className="input"
              rows={2}
              value={form.health_warnings ?? ""}
              onChange={(e) => setForm({ ...form, health_warnings: e.target.value })}
            />
          </Field>
          <Field label="Lien vers l'analyse COA (optionnel)">
            <input
              className="input"
              value={form.coa_url ?? ""}
              onChange={(e) => setForm({ ...form, coa_url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        </section>

        {missing.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Champs obligatoires manquants : {missing.join(", ")}.
          </div>
        )}

        {cbdErrors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="mb-1 font-medium">Vérifie les taux CBD / THC :</p>
            <ul className="list-inside list-disc space-y-0.5">
              {cbdErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {variantErrors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="mb-1 font-medium">Vérifie les variantes de volume :</p>
            <ul className="list-inside list-disc space-y-0.5">
              {variantErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {flavorErrors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="mb-1 font-medium">Vérifie les goûts :</p>
            <ul className="list-inside list-disc space-y-0.5">
              {flavorErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={
              m.isPending ||
              uploading ||
              missing.length > 0 ||
              cbdErrors.length > 0 ||
              variantErrors.length > 0 ||
              flavorErrors.length > 0
            }
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {m.isPending
              ? "Enregistrement…"
              : isNew
              ? "Créer le produit"
              : "Enregistrer les modifications"}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/produits" })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}


function VariantsEditor({
  variants,
  onChange,
}: {
  variants: FormVariant[];
  onChange: (next: FormVariant[]) => void;
}) {
  const usedVolumes = new Set(variants.map((v) => v.volume_ml));
  const nextVolume =
    VOLUME_OPTIONS_ML.find((v) => !usedVolumes.has(v)) ?? 10;

  const update = (idx: number, patch: Partial<FormVariant>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };
  const remove = (idx: number) =>
    onChange(variants.filter((_, i) => i !== idx));
  const add = () =>
    onChange([
      ...variants,
      {
        volume_ml: nextVolume,
        price_cents: 0,
        stock: 0,
        max_nicotine_mg: null,
        available_nicotine_mg: [],
        boosters_per_nicotine: {},
      },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium">
            Variantes de volume <span className="text-destructive">*</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoute un bloc par format. <strong>10 ml</strong> : liquide prêt à
            l'emploi, un seul prix quel que soit le taux de nicotine coché.
            <strong> 50 / 100 / 200 ml</strong> : base + boosters — coche les
            taux disponibles et indique combien de boosters sont nécessaires
            pour chaque taux (sauf 0 mg).
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter une variante
        </button>
      </div>

      {variants.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-background/30 p-4 text-center text-xs text-muted-foreground">
          Aucune variante. Ajoute au moins une taille de flacon.
        </div>
      ) : (
        <div className="space-y-3">
          {variants.map((v, idx) => (
            <VariantBlock
              key={idx}
              variant={v}
              onUpdate={(patch) => update(idx, patch)}
              onRemove={() => remove(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantBlock({
  variant,
  onUpdate,
  onRemove,
}: {
  variant: FormVariant;
  onUpdate: (patch: Partial<FormVariant>) => void;
  onRemove: () => void;
}) {
  const is10ml = variant.volume_ml === 10;
  const choices = is10ml ? NICOTINE_STEPS_MG_10ML : NICOTINE_STEPS_MG_BOOSTER;
  const selected = variant.available_nicotine_mg ?? [];
  const boosters = (variant.boosters_per_nicotine ?? {}) as Record<string, number>;
  // Saisie libre du prix : on garde la valeur brute tapée par l'admin, sinon
  // le reformatage à chaque rendu empêche de taper naturellement « 24.90 ».
  const [priceRaw, setPriceRaw] = useState<string>(
    variant.price_cents ? (variant.price_cents / 100).toFixed(2) : "",
  );
  useEffect(() => {
    const parsed = Number(priceRaw.replace(",", "."));
    const currentCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
    if (currentCents !== variant.price_cents) {
      setPriceRaw(variant.price_cents ? (variant.price_cents / 100).toFixed(2) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.price_cents]);

  const toggleTaux = (mg: number, on: boolean) => {
    const next = on
      ? Array.from(new Set([...selected, mg])).sort((a, b) => a - b)
      : selected.filter((x) => x !== mg);
    const nextBoosters: Record<string, number> = {};
    for (const [k, val] of Object.entries(boosters)) {
      if (next.includes(Number(k))) nextBoosters[k] = val;
    }
    onUpdate({ available_nicotine_mg: next, boosters_per_nicotine: nextBoosters });
  };

  const setBoosters = (mg: number, n: number) => {
    const next = { ...boosters, [String(mg)]: Math.max(0, Math.trunc(n)) };
    onUpdate({ boosters_per_nicotine: next });
  };

  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="grid gap-3 sm:grid-cols-[150px_1fr_1fr_auto] sm:items-end">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Volume</span>
          <select
            className="input"
            value={variant.volume_ml}
            onChange={(e) => {
              const vol = Number(e.target.value);
              const allowed = vol === 10 ? NICOTINE_STEPS_MG_10ML : NICOTINE_STEPS_MG_BOOSTER;
              const nextSel = selected.filter((m) =>
                (allowed as readonly number[]).includes(m),
              );
              const nextB: Record<string, number> = {};
              for (const [k, val] of Object.entries(boosters)) {
                if (nextSel.includes(Number(k))) nextB[k] = val;
              }
              onUpdate({
                volume_ml: vol,
                available_nicotine_mg: nextSel,
                boosters_per_nicotine: vol === 10 ? {} : nextB,
              });
            }}
          >
            {VOLUME_OPTIONS_ML.map((vol) => (
              <option key={vol} value={vol}>
                {vol} ml{vol === 10 ? " (prêt à l'emploi)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">
            Prix de base (€)
          </span>
          <input
            className="input"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            placeholder="0.00"
            value={priceRaw}
            onChange={(e) => {
              const raw = e.target.value.replace(",", ".");
              setPriceRaw(raw);
              const n = Number(raw);
              onUpdate({
                price_cents: Number.isFinite(n) ? Math.round(n * 100) : 0,
              });
            }}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Stock</span>
          <input
            className="input"
            type="number"
            min={0}
            value={variant.stock}
            onChange={(e) => onUpdate({ stock: Number(e.target.value) || 0 })}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
          aria-label="Supprimer cette variante"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Taux de nicotine disponibles pour ce volume
          {is10ml ? " (prix unique, quel que soit le taux)" : " (base + boosters)"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((mg) => {
            const on = selected.includes(mg);
            const boosterNeeded = boosters[String(mg)] ?? 0;
            return (
              <div
                key={mg}
                className={`flex items-center gap-3 rounded-md border p-2 text-xs ${
                  on ? "border-primary/60 bg-primary/5" : "border-border"
                }`}
              >
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => toggleTaux(mg, e.target.checked)}
                  />
                  <span className="font-medium">{mg} mg</span>
                </label>
                {!is10ml && on && mg > 0 && (
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span>Boosters :</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="input h-7 w-16 px-1 py-0 text-xs"
                      value={boosterNeeded || ""}
                      onChange={(e) => setBoosters(mg, Number(e.target.value) || 0)}
                    />
                  </label>
                )}
                {!is10ml && on && mg === 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    Aucun booster
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!is10ml && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Prix final client = prix de base + (nombre de boosters × prix
            actuel du produit « Booster de nicotine » référencé dans
            Accessoires Vape).
          </p>
        )}
      </div>
    </div>
  );
}
