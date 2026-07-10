import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetProduct,
  adminUpsertProduct,
  adminUploadProductPhoto,
  type ProductInput,
} from "@/lib/admin.functions";
import { CATEGORY_LABELS } from "@/lib/products";
import { useState, useEffect, useMemo, useRef, type FormEvent, type ChangeEvent } from "react";
import { toast } from "sonner";
import { X, Upload, Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/produits/$id")({
  ssr: false,
  component: EditProduct,
});

type FormState = ProductInput;

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

  const { data: existing, isLoading: loadingExisting, error: loadError } = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: () => get({ data: { id } }),
    enabled: !isNew,
    retry: false,
  });

  const [form, setForm] = useState<FormState>(empty);
  const [priceEuros, setPriceEuros] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (existing) {
      setForm({
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        category: existing.category,
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
      });
      setPriceEuros((existing.price_cents / 100).toFixed(2));
      setSlugTouched(true);
    }
  }, [existing]);

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
    m.mutate(form);
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
            <div className="grid grid-cols-3 gap-2">
              {(["cbd", "e_liquide", "accessoire"] as const).map((c) => (
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
            <Field label="Taux de nicotine (mg/ml)">
              <input
                className="input"
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={form.nicotine_mg ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    nicotine_mg: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          )}

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
                type="number"
                step="0.01"
                min={0}
                value={priceEuros}
                onChange={(e) => {
                  const v = e.target.value;
                  setPriceEuros(v);
                  const n = Number(v);
                  setForm({
                    ...form,
                    price_cents: Number.isFinite(n) ? Math.round(n * 100) : 0,
                  });
                }}
                placeholder="0,00"
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={m.isPending || uploading || missing.length > 0}
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