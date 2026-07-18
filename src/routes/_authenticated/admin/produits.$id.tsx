import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetProduct,
  adminUpsertProduct,
  adminUploadProductPhoto,
  adminListVariants,
  adminListProducts,
  type ProductInput,
} from "@/lib/admin.functions";
import {
  CATEGORY_LABELS,
  NICOTINE_STEPS_MG_10ML,
  BOOSTER_TYPE_PRESETS,
  boosterTypeLabel,
  boosterProductsQueryOptions,
  normalizeBoosterTypeKey,
} from "@/lib/products";
import { siteSettingsQueryOptions, computeNicotineRateMgPerMl } from "@/lib/site-settings.functions";
import { useState, useEffect, useMemo, useRef, type FormEvent, type ChangeEvent } from "react";
import { toast } from "sonner";
import { X, Upload, Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  shopCategoriesQueryOptions,
  shopSubcategoriesQueryOptions,
} from "@/lib/categories.functions";

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
  booster_type: null,
  booster_product_id: null,
  empty_bottle_product_id: null,
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
  const listProductsFn = useServerFn(adminListProducts);

  // Sous-catégories dynamiques pour le champ « sous-catégorie ».
  const { data: shopCats } = useQuery(shopCategoriesQueryOptions());
  const { data: shopSubs } = useQuery(shopSubcategoriesQueryOptions());

  // Liste des accessoires vape pour les listes déroulantes « booster associé »
  // et « flacon vide associé » sur les fiches e-liquides.
  const { data: vapeAccessories } = useQuery({
    queryKey: ["admin", "products", "accessoire_vape"],
    queryFn: () => listProductsFn({ data: { category: "accessoire_vape" } }),
    retry: false,
  });

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
              photo:
                typeof (f as { photo?: unknown })?.photo === "string"
                  ? ((f as { photo: string }).photo)
                  : null,
              sku:
                typeof (f as { sku?: unknown })?.sku === "string"
                  ? (f as { sku: string }).sku
                  : "",
              is_active:
                typeof (f as { is_active?: unknown })?.is_active === "boolean"
                  ? (f as { is_active: boolean }).is_active
                  : true,
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
        booster_type:
          (existing as { booster_type?: string | null }).booster_type ?? null,
        booster_product_id:
          (existing as { booster_product_id?: string | null }).booster_product_id ?? null,
        empty_bottle_product_id:
          (existing as { empty_bottle_product_id?: string | null }).empty_bottle_product_id ?? null,
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
        nicotine_type: (v.nicotine_type as "normale" | "sel" | null) ?? "normale",
        max_boosters: (v as { max_boosters?: number | null }).max_boosters ?? null,
        photo_url: (v as { photo_url?: string | null }).photo_url ?? null,
        sku: ((v as { sku?: string | null }).sku ?? "") as string,
        is_active:
          typeof (v as { is_active?: boolean }).is_active === "boolean"
            ? (v as { is_active: boolean }).is_active
            : true,
        quantity_tiers: (((v as { quantity_tiers?: unknown }).quantity_tiers as Array<{
          min_qty: number;
          max_qty?: number | null;
          price_cents: number;
        }> | null) ?? []),
      }));
      setForm((f) => ({
        ...f,
        variants: list,
      }));
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
    const variantsCoverPrice =
      form.category === "e_liquide" &&
      (form.variants ?? []).length > 0 &&
      (form.variants ?? []).every((v) => (v.price_cents ?? 0) > 0);
    if (!variantsCoverPrice && (!form.price_cents || form.price_cents <= 0)) {
      errs.push("prix");
    }
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
    if (form.category !== "e_liquide") return errs;
    const variants = form.variants ?? [];
    const seenVolumes = new Set<number>();
    for (const [i, v] of variants.entries()) {
      const label = `Contenance #${i + 1}`;
      if (!v.volume_ml || v.volume_ml <= 0) {
        errs.push(`${label} : volume manquant.`);
      } else if (seenVolumes.has(v.volume_ml)) {
        errs.push(
          `${label} : le volume ${v.volume_ml} ml est déjà défini. Chaque contenance doit être unique.`,
        );
      } else {
        seenVolumes.add(v.volume_ml);
      }
      if (!Number.isInteger(v.price_cents) || v.price_cents <= 0) {
        errs.push(`${label} (${v.volume_ml || "?"} ml) : prix requis.`);
      }
      if (!Number.isInteger(v.stock) || v.stock < 0) {
        errs.push(`${label} (${v.volume_ml || "?"} ml) : stock invalide.`);
      }
      const cap =
        typeof v.max_boosters === "number" && v.max_boosters >= 0
          ? v.max_boosters
          : 0;
      if (cap === 0) {
        const taux = v.available_nicotine_mg ?? [];
        if (taux.length === 0) {
          errs.push(
            `${label} (${v.volume_ml || "?"} ml, prêt à l'emploi) : coche au moins un taux de nicotine.`,
          );
        }
      }
    }
    return errs;
  }, [form.category, form.variants]);

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
    const useVariants =
      form.category === "e_liquide" && (form.variants ?? []).length > 0;
    const vs = form.variants ?? [];
    // Quand les variantes pilotent le prix, on synchronise le prix/stock
    // « produit » sur le plus petit prix variante et la somme des stocks
    // pour rester cohérent avec le catalogue et les rapports.
    const priceFromVariants = useVariants && vs.length > 0
      ? Math.min(...vs.map((v) => v.price_cents || 0))
      : form.price_cents;
    const stockFromVariants = useVariants && vs.length > 0
      ? vs.reduce((s, v) => s + (v.stock || 0), 0)
      : form.stock;
    const payload: FormState = {
      ...form,
      price_cents: priceFromVariants,
      stock: stockFromVariants,
      variants: useVariants ? vs : [],
      flavors: hasFlavors
        ? (form.flavors ?? []).map((f) => ({
            name: f.name.trim(),
            stock: Math.max(0, Math.trunc(f.stock)),
            photo:
              (f as FormFlavor & { photo?: string | null }).photo || null,
            sku: ((f as FormFlavor & { sku?: string }).sku ?? "").toString().trim(),
            is_active:
              typeof (f as FormFlavor & { is_active?: boolean }).is_active === "boolean"
                ? (f as FormFlavor & { is_active: boolean }).is_active
                : true,
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
              <VariantsEditor
                variants={form.variants ?? []}
                onChange={(vs) => setForm((f) => ({ ...f, variants: vs }))}
              />
              {(form.variants ?? []).length > 0 && (
                <div className="grid gap-4 rounded-md border border-border bg-background/30 p-4">
                  <Field
                    label="Produit flacon vide associé (optionnel)"
                    hint="Flacon vide proposé en complément si le taux demandé dépasse la capacité du flacon choisi."
                  >
                    <select
                      className="input"
                      value={form.empty_bottle_product_id ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          empty_bottle_product_id: e.target.value || null,
                        })
                      }
                    >
                      <option value="">— Aucun (pas de suggestion) —</option>
                      {(vapeAccessories ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
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

          <Field label="Sous-catégorie (optionnel)" hint="Gérée dans /admin/catégories. Le choix dépend de la catégorie sélectionnée ci-dessus.">
            {(() => {
              const cat = (shopCats ?? []).find((c) => c.key === form.category);
              const subs = cat
                ? (shopSubs ?? []).filter(
                    (s) => s.category_id === cat.id && s.is_active,
                  )
                : [];
              return (
                <select
                  className="input"
                  value={form.subcategory ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, subcategory: e.target.value })
                  }
                >
                  <option value="">— Aucune sous-catégorie —</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              );
            })()}
          </Field>
        </section>

        {/* Bloc 3 — prix & stock */}
        <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
          {form.category === "e_liquide" && (form.variants ?? []).length > 0 ? (
            <VariantsRecap
              variants={form.variants ?? []}
              currency={form.currency}
              flavorsCount={hasFlavors ? (form.flavors ?? []).length : 0}
            />
          ) : (
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
          )}

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
            />
            Publier ce produit dans le catalogue en ligne
          </label>

          {form.category === "accessoire_vape" && (
            <BoosterRoleFields
              checked={Boolean(form.is_nicotine_booster)}
              type={form.booster_type}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
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


function BoosterRoleFields({
  checked,
  type,
  onChange,
}: {
  checked: boolean;
  type: string | null | undefined;
  onChange: (patch: Partial<FormState>) => void;
}) {
  const currentKey = normalizeBoosterTypeKey(type);
  const isPreset = BOOSTER_TYPE_PRESETS.some((p) => p.key === currentKey);
  const [customMode, setCustomMode] = useState<boolean>(
    checked && !isPreset && Boolean(type),
  );
  useEffect(() => {
    if (!checked) setCustomMode(false);
  }, [checked]);
  return (
    <div className="mt-2 space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          onChange={(e) =>
            onChange({
              is_nicotine_booster: e.target.checked,
              booster_type: e.target.checked
                ? type ?? "normale"
                : null,
            })
          }
        />
        <span>
          <strong>Ce produit est un booster de nicotine.</strong> Son prix sera
          utilisé automatiquement pour calculer le total des e-liquides qui
          utilisent le <em>même type de nicotine</em>. Plusieurs boosters
          peuvent coexister (un par type).
        </span>
      </label>
      {checked && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-background/30 p-3 text-foreground">
          <p className="text-xs font-medium">Type de booster</p>
          <div className="flex flex-wrap gap-2">
            {BOOSTER_TYPE_PRESETS.map((p) => {
              const active = !customMode && currentKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setCustomMode(false);
                    onChange({ booster_type: p.key });
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                customMode
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              + Autre
            </button>
          </div>
          {customMode && (
            <input
              className="input mt-1"
              type="text"
              maxLength={40}
              placeholder="Nom du nouveau type (ex. hybride, no-nic…)"
              value={type ?? ""}
              onChange={(e) =>
                onChange({
                  booster_type: e.target.value.toLowerCase().slice(0, 40),
                })
              }
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            Ce type doit correspondre exactement à celui choisi côté fiche
            e-liquide (variantes de volume). Actuel : <strong>{boosterTypeLabel(type)}</strong>.
          </p>
        </div>
      )}
    </div>
  );
}

function VariantsEditor({
  variants,
  onChange,
}: {
  variants: FormVariant[];
  onChange: (next: FormVariant[]) => void;
}) {
  const { data: cfg } = useQuery(siteSettingsQueryOptions());
  const update = (idx: number, patch: Partial<FormVariant>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };
  const remove = (idx: number) =>
    onChange(variants.filter((_, i) => i !== idx));
  const addContenance = () => {
    onChange([
      ...variants,
      {
        volume_ml: 10,
        price_cents: 0,
        stock: 0,
        max_nicotine_mg: null,
        available_nicotine_mg: [],
        boosters_per_nicotine: {},
        nicotine_type: "normale",
        max_boosters: 0,
        photo_url: null,
        sku: "",
        is_active: true,
        quantity_tiers: [],
      },
    ]);
  };
  const sorted = useMemo(
    () =>
      variants
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => (a.v.volume_ml || 0) - (b.v.volume_ml || 0)),
    [variants],
  );

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Contenances</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Une ligne par taille de flacon. Laisse « Capacité max de boosters »
            à <strong>0</strong> pour un flacon prêt à l'emploi (10 ml) : tu
            coches alors les taux de nicotine déjà présents. Pour un flacon
            avec boosters (50 / 100 / 200 ml), indique la capacité maximale :
            le site calcule automatiquement les taux résultants selon le
            dosage global défini dans <em>Paramètres</em>.
          </p>
          {cfg && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Dosage booster actuel :{" "}
              <strong className="text-foreground">
                {cfg.boosterVolumeMl} ml × {cfg.boosterConcentrationMgPerMl} mg/ml
              </strong>{" "}
              = {(cfg.boosterVolumeMl * cfg.boosterConcentrationMgPerMl).toFixed(0)} mg / booster.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={addContenance}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter une contenance
        </button>
      </div>

      {variants.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-background/30 p-4 text-center text-xs text-muted-foreground">
          Aucune contenance ajoutée. Le produit sera vendu au prix / stock
          uniques renseignés ci-dessous.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(({ v, idx }) => (
            <ContenanceRow
              key={idx}
              variant={v}
              cfg={cfg ?? null}
              onUpdate={(patch) => update(idx, patch)}
              onRemove={() => remove(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantsRecap({
  variants,
  currency,
  flavorsCount,
}: {
  variants: FormVariant[];
  currency: string;
  flavorsCount: number;
}) {
  const volumes = new Set(variants.map((v) => v.volume_ml));
  const prices = variants.map((v) => v.price_cents || 0).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const stockTotal = variants.reduce((s, v) => s + (v.stock || 0), 0);
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Récapitulatif produit (piloté par les contenances)
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Stat label="Contenances" value={String(volumes.size)} />
        <Stat
          label="Prix à partir de"
          value={
            minPrice > 0
              ? new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency,
                }).format(minPrice / 100)
              : "—"
          }
        />
        <Stat label="Stock total" value={String(stockTotal)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Le prix et le stock « produit » sont calculés à partir des contenances
        (prix minimum + somme des stocks).{" "}
        {flavorsCount > 0
          ? `${flavorsCount} goût${flavorsCount > 1 ? "s" : ""} configuré${flavorsCount > 1 ? "s" : ""}.`
          : ""}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}

// Liste fixe des taux proposés pour un flacon prêt à l'emploi.
const READY_TO_USE_NICOTINE_MG = [0, 3, 6, 9, 10, 11, 12, 16, 20] as const;

function ContenanceRow({
  variant,
  cfg,
  onUpdate,
  onRemove,
}: {
  variant: FormVariant;
  cfg: { boosterVolumeMl: number; boosterConcentrationMgPerMl: number } | null;
  onUpdate: (patch: Partial<FormVariant>) => void;
  onRemove: () => void;
}) {
  const cap =
    typeof variant.max_boosters === "number" && variant.max_boosters >= 0
      ? variant.max_boosters
      : 0;
  const isReadyToUse = cap === 0;
  const selected = variant.available_nicotine_mg ?? [];
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
    onUpdate({ available_nicotine_mg: next });
  };

  // Aperçu des taux calculés pour un flacon avec boosters.
  const computedPreview = useMemo(() => {
    if (isReadyToUse || !cfg || !variant.volume_ml) return [] as { n: number; mg: number }[];
    const out: { n: number; mg: number }[] = [];
    for (let n = 0; n <= cap; n++) {
      const mg =
        n === 0
          ? 0
          : Math.round(
              ((n * cfg.boosterVolumeMl * cfg.boosterConcentrationMgPerMl) /
                variant.volume_ml) *
                10,
            ) / 10;
      out.push({ n, mg });
    }
    return out;
  }, [isReadyToUse, cfg, variant.volume_ml, cap]);

  return (
    <div className="rounded-md border border-border bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={variant.is_active !== false}
            onChange={(e) =>
              onUpdate({ is_active: e.target.checked } as Partial<FormVariant>)
            }
          />
          <span className={variant.is_active === false ? "text-muted-foreground line-through" : "text-foreground"}>
            {variant.is_active === false ? "Variante désactivée" : "Variante active"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            (désactivée = masquée du catalogue, historique préservé)
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>SKU</span>
          <input
            className="input h-8 w-40 px-2 py-1 font-mono text-[11px] uppercase"
            type="text"
            maxLength={40}
            placeholder="Auto"
            value={(variant as FormVariant & { sku?: string }).sku ?? ""}
            onChange={(e) =>
              onUpdate({ sku: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") } as Partial<FormVariant>)
            }
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[110px_1fr_1fr_1fr_auto] sm:items-end">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Volume (ml)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={2000}
            value={variant.volume_ml || ""}
            onChange={(e) =>
              onUpdate({ volume_ml: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Prix de base (€)</span>
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
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">
            Capacité max de boosters
          </span>
          <input
            className="input"
            type="number"
            min={0}
            max={20}
            placeholder="0"
            value={typeof variant.max_boosters === "number" ? variant.max_boosters : 0}
            onChange={(e) => {
              const raw = e.target.value;
              const n = raw === "" ? 0 : Math.max(0, Math.trunc(Number(raw) || 0));
              const patch: Partial<FormVariant> = { max_boosters: n };
              // Si on repasse en flacon avec boosters, on efface la liste
              // fixe (elle ne sert plus qu'aux flacons prêts à l'emploi).
              if (n > 0) patch.available_nicotine_mg = [];
              onUpdate(patch);
            }}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
          aria-label="Supprimer cette contenance"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <VariantPhotoField
          value={variant.photo_url ?? null}
          onChange={(url) => onUpdate({ photo_url: url })}
        />
        <p className="text-[11px] leading-tight text-muted-foreground sm:max-w-[240px]">
          {isReadyToUse ? (
            <>Flacon <strong className="text-foreground">prêt à l'emploi</strong>{" "}
            (aucun booster). Coche les taux déjà présents dans le flacon
            ci-dessous.</>
          ) : (
            <>Flacon avec <strong className="text-foreground">{cap} booster{cap > 1 ? "s" : ""}</strong>{" "}
            max. Les 3 types (Normal / Sel / Ice) sont proposés côté client
            dès qu'un booster est ajouté.</>
          )}
        </p>
      </div>

      {isReadyToUse ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Taux de nicotine déjà présents dans ce flacon
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {READY_TO_USE_NICOTINE_MG.map((mg) => {
              const on = selected.includes(mg);
              return (
                <label
                  key={mg}
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                    on ? "border-primary/60 bg-primary/5" : "border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => toggleTaux(mg, e.target.checked)}
                  />
                  <span className="font-medium">{mg} mg</span>
                </label>
              );
            })}
          </div>
          <label className="mt-3 block text-xs text-muted-foreground">
            <span className="mb-1 block">Type (optionnel, texte libre)</span>
            <input
              className="input"
              type="text"
              maxLength={40}
              placeholder="Ex. sel, ice, hybride…"
              value={variant.nicotine_type ?? ""}
              onChange={(e) =>
                onUpdate({
                  nicotine_type:
                    e.target.value.toLowerCase().slice(0, 40) || "normale",
                })
              }
            />
          </label>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
          <p className="mb-1 font-medium text-foreground">
            Taux calculés automatiquement pour ce flacon
          </p>
          {cfg ? (
            <div className="flex flex-wrap gap-2">
              {computedPreview.map(({ n, mg }) => (
                <span
                  key={n}
                  className="rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground"
                >
                  {n} booster{n > 1 ? "s" : ""} = {mg} mg
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              Chargement du dosage global…
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Prix client = prix de base + (nombre de boosters × prix du booster
            correspondant au type choisi).
          </p>
        </div>
      )}

      <QuantityTiersEditor
        tiers={(variant.quantity_tiers ?? []) as Array<{ min_qty: number; max_qty?: number | null; price_cents: number }>}
        basePriceCents={variant.price_cents}
        onChange={(next) => onUpdate({ quantity_tiers: next } as Partial<FormVariant>)}
      />
    </div>
  );
}

function QuantityTiersEditor({
  tiers,
  basePriceCents,
  onChange,
}: {
  tiers: Array<{ min_qty: number; max_qty?: number | null; price_cents: number }>;
  basePriceCents: number;
  onChange: (
    next: Array<{ min_qty: number; max_qty?: number | null; price_cents: number }>,
  ) => void;
}) {
  const enabled = tiers.length > 0;
  return (
    <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              onChange([{ min_qty: 2, max_qty: null, price_cents: basePriceCents }]);
            } else {
              onChange([]);
            }
          }}
        />
        <span className="font-medium text-foreground">Prix dégressif selon quantité</span>
      </label>
      {enabled && (
        <div className="mt-3 space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
              <label>
                <span className="mb-1 block text-muted-foreground">À partir de (qté)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={t.min_qty}
                  onChange={(e) =>
                    onChange(
                      tiers.map((x, j) =>
                        j === i ? { ...x, min_qty: Math.max(1, Math.trunc(Number(e.target.value) || 1)) } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-muted-foreground">Jusqu'à (optionnel)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={t.max_qty ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = raw === "" ? null : Math.max(1, Math.trunc(Number(raw) || 1));
                    onChange(tiers.map((x, j) => (j === i ? { ...x, max_qty: v } : x)));
                  }}
                />
              </label>
              <label>
                <span className="mb-1 block text-muted-foreground">Prix unitaire (€)</span>
                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={(t.price_cents / 100).toFixed(2)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    const cents = Number.isFinite(n) ? Math.round(n * 100) : 0;
                    onChange(tiers.map((x, j) => (j === i ? { ...x, price_cents: cents } : x)));
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(tiers.filter((_, j) => j !== i))}
                className="inline-flex items-center justify-center rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
                aria-label="Supprimer ce palier"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange([
                ...tiers,
                {
                  min_qty:
                    (tiers[tiers.length - 1]?.max_qty ??
                      tiers[tiers.length - 1]?.min_qty ??
                      1) + 1,
                  max_qty: null,
                  price_cents: basePriceCents,
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un palier
          </button>
          <p className="text-[11px] text-muted-foreground">
            Les tranches ne doivent pas se chevaucher. Laisse « Jusqu'à » vide
            pour définir la tranche haute.
          </p>
        </div>
      )}
    </div>
  );
}


function VariantPhotoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const upload = useServerFn(adminUploadProductPhoto);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Format non supporté.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image trop lourde (4 Mo max).");
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Lecture du fichier échouée."));
        reader.readAsDataURL(file);
      });
      const res = await upload({
        data: { filename: file.name, contentType: file.type, base64 },
      });
      onChange(res.url);
      toast.success("Photo de la variante mise à jour.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return (
    <div className="text-xs">
      <span className="mb-1 block text-muted-foreground">
        Photo spécifique à cette variante (optionnelle)
      </span>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt="Aperçu variante"
            className="h-14 w-14 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="h-14 w-14 rounded-md border border-dashed border-border/60 bg-background/30" />
        )}
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {value ? "Remplacer" : "Ajouter"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] text-destructive hover:underline"
            >
              Retirer la photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FlavorsEditor({
  flavors,
  onChange,
}: {
  flavors: FormFlavor[];
  onChange: (next: FormFlavor[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addFlavor = () => {
    const name = draft.trim();
    if (!name) return;
    const exists = flavors.some(
      (f) => f.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      toast.error("Ce goût est déjà dans la liste.");
      return;
    }
    onChange([...flavors, { name, stock: 0, sku: "", is_active: true }]);
    setDraft("");
  };

  const update = (idx: number, patch: Partial<FormFlavor>) =>
    onChange(flavors.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const remove = (idx: number) =>
    onChange(flavors.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/40 p-4">
      <div>
        <h3 className="text-sm font-medium">
          Goûts disponibles <span className="text-destructive">*</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tape le nom d'un goût puis clique sur « Ajouter ». Indique le stock
          propre à chaque goût — les goûts à 0 seront grisés côté boutique.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFlavor();
            }
          }}
          placeholder="Ex. Fraise, Menthe, Tabac blond…"
          maxLength={80}
        />
        <button
          type="button"
          onClick={addFlavor}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>

      {flavors.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-background/30 p-4 text-center text-xs text-muted-foreground">
          Aucun goût pour l'instant.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {flavors.map((f, idx) => (
            <li key={idx} className="flex flex-wrap items-center gap-3 p-2">
              <input
                className="input flex-1 min-w-[150px]"
                type="text"
                value={f.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                maxLength={80}
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Stock :</span>
                <input
                  className="input h-8 w-20 px-2 py-1 text-xs"
                  type="number"
                  min={0}
                  value={f.stock}
                  onChange={(e) =>
                    update(idx, { stock: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <VariantPhotoField
                value={(f as FormFlavor & { photo?: string | null }).photo ?? null}
                onChange={(url) => update(idx, { photo: url } as Partial<FormFlavor>)}
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="inline-flex items-center justify-center rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
                aria-label="Supprimer ce goût"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
