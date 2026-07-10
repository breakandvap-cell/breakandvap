import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetProduct, adminUpsertProduct, type ProductInput } from "@/lib/admin.functions";
import { useState, useEffect, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/produits/")({
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

function EditProduct() {
  const { id } = Route.useParams();
  const isNew = id === "nouveau";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(adminGetProduct);
  const save = useServerFn(adminUpsertProduct);

  const { data: existing } = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: () => get({ data: { id } }),
    enabled: !isNew,
  });

  const [form, setForm] = useState<FormState>(empty);
  const [photosText, setPhotosText] = useState("");

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
      setPhotosText((existing.photos ?? []).join("\n"));
    }
  }, [existing]);

  const m = useMutation({
    mutationFn: (payload: FormState) => save({ data: payload }),
    onSuccess: async () => {
      toast.success("Produit enregistré.");
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["admin", "product", id] });
      navigate({ to: "/admin/produits" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const photos = photosText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    m.mutate({ ...form, photos });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">
        {isNew ? "Nouveau produit" : "Modifier le produit"}
      </h1>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Slug (URL)">
            <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
          <Field label="Catégorie">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductInput["category"] })}>
              <option value="cbd">CBD</option>
              <option value="e_liquide">E-liquides</option>
              <option value="accessoire">Accessoires</option>
            </select>
          </Field>
          <Field label="Sous-catégorie">
            <input value={form.subcategory ?? ""} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} />
          </Field>
          <Field label="Prix (centimes €)">
            <input type="number" min={0} value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })} />
          </Field>
          <Field label="Stock">
            <input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
          </Field>
          <Field label="Statut stock">
            <select value={form.stock_status} onChange={(e) => setForm({ ...form, stock_status: e.target.value as ProductInput["stock_status"] })}>
              <option value="in_stock">En stock</option>
              <option value="low_stock">Faible</option>
              <option value="out_of_stock">Rupture</option>
            </select>
          </Field>
          <Field label="Publié">
            <select value={String(form.is_published)} onChange={(e) => setForm({ ...form, is_published: e.target.value === "true" })}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </Field>
          <Field label="CBD (%)">
            <input type="number" step="0.1" value={form.cbd_percent ?? ""} onChange={(e) => setForm({ ...form, cbd_percent: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="THC (%)">
            <input type="number" step="0.01" value={form.thc_percent ?? ""} onChange={(e) => setForm({ ...form, thc_percent: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Nicotine (mg/ml)">
            <input type="number" step="0.1" value={form.nicotine_mg ?? ""} onChange={(e) => setForm({ ...form, nicotine_mg: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Lien COA (analyse)">
            <input value={form.coa_url ?? ""} onChange={(e) => setForm({ ...form, coa_url: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={4} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Avertissements santé">
          <textarea rows={2} value={form.health_warnings ?? ""} onChange={(e) => setForm({ ...form, health_warnings: e.target.value })} />
        </Field>
        <Field label="Photos (une URL par ligne)">
          <textarea rows={3} value={photosText} onChange={(e) => setPhotosText(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={m.isPending} className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {m.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={() => navigate({ to: "/admin/produits" })} className="text-sm text-muted-foreground hover:text-foreground">
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
