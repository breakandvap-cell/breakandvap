import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import {
  adminDeleteCategory,
  adminDeleteSubcategory,
  adminListCategoriesTree,
  adminUpsertCategory,
  adminUpsertSubcategory,
  adminUploadCategoryImage,
  slugify,
  type ShopCategory,
  type ShopSubcategory,
} from "@/lib/categories.functions";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  ssr: false,
  component: CategoriesAdmin,
});

function CategoriesAdmin() {
  const list = useServerFn(adminListCategoriesTree);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "categories-tree"],
    queryFn: () => list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }
  const cats = data?.categories ?? [];
  const subs = data?.subcategories ?? [];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Catégories & sous-catégories</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gérez la navigation de la boutique. Créez de nouvelles catégories,
          organisez vos gammes en sous-catégories, ajoutez une image et un ordre
          d'affichage. Les changements sont visibles immédiatement sur la
          boutique.
        </p>
      </header>

      <CategoryEditor onSaved={() => refetch()} />

      <div className="space-y-4">
        {cats.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucune catégorie pour le moment.
          </div>
        )}
        {cats.map((cat) => (
          <CategoryNode
            key={cat.id}
            category={cat}
            subcategories={subs.filter((s) => s.category_id === cat.id)}
            onChanged={() => refetch()}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryNode({
  category,
  subcategories,
  onChanged,
}: {
  category: ShopCategory;
  subcategories: ShopSubcategory[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const del = useServerFn(adminDeleteCategory);
  const delM = useMutation({
    mutationFn: () => del({ data: { id: category.id } }),
    onSuccess: () => {
      toast.success("Catégorie supprimée.");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Replier" : "Déplier"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {category.image_url ? (
          <img
            src={category.image_url}
            alt=""
            className="h-12 w-12 rounded-md object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-md bg-secondary" />
        )}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="font-medium">{category.name}</span>
            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {category.key}
            </span>
            {!category.is_active && (
              <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                Masquée
              </span>
            )}
          </div>
          {category.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {category.description}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          Ordre {category.sort_order}
        </span>
        <button
          className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Fermer" : "Modifier"}
        </button>
        <button
          className="rounded-md border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"
          onClick={() => {
            if (
              confirm(
                `Supprimer la catégorie "${category.name}" ?\nToutes ses sous-catégories seront également supprimées.`,
              )
            )
              delM.mutate();
          }}
          disabled={delM.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <div className="border-t border-border p-4">
          <CategoryEditor
            initial={category}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        </div>
      )}

      {open && (
        <div className="border-t border-border bg-background/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Sous-catégories</h3>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary"
              onClick={() => setAddingSub((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          {addingSub && (
            <div className="mb-4 rounded-md border border-dashed border-border p-3">
              <SubcategoryEditor
                categoryId={category.id}
                onSaved={() => {
                  setAddingSub(false);
                  onChanged();
                }}
                onCancel={() => setAddingSub(false)}
              />
            </div>
          )}
          {subcategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune sous-catégorie. La boutique affichera directement les
              produits de cette catégorie.
            </p>
          ) : (
            <ul className="space-y-2">
              {subcategories.map((s) => (
                <SubcategoryRow key={s.id} sub={s} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SubcategoryRow({
  sub,
  onChanged,
}: {
  sub: ShopSubcategory;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const del = useServerFn(adminDeleteSubcategory);
  const delM = useMutation({
    mutationFn: () => del({ data: { id: sub.id } }),
    onSuccess: () => {
      toast.success("Sous-catégorie supprimée.");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <li className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-3">
        {sub.image_url ? (
          <img
            src={sub.image_url}
            alt=""
            className="h-10 w-10 rounded object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-secondary" />
        )}
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{sub.name}</span>
            <span className="text-[10px] text-muted-foreground">/{sub.slug}</span>
            {!sub.is_active && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] text-destructive">
                Masquée
              </span>
            )}
          </div>
          {sub.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {sub.description}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">Ordre {sub.sort_order}</span>
        <button
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Fermer" : "Modifier"}
        </button>
        <button
          className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"
          onClick={() => {
            if (confirm(`Supprimer la sous-catégorie "${sub.name}" ?`)) delM.mutate();
          }}
          disabled={delM.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {editing && (
        <div className="border-t border-border p-3">
          <SubcategoryEditor
            categoryId={sub.category_id}
            initial={sub}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  );
}

// ---------- Editors ----------

function CategoryEditor({
  initial,
  onSaved,
}: {
  initial?: ShopCategory;
  onSaved: () => void;
}) {
  const [collapsed, setCollapsed] = useState(!initial ? true : false);
  const [form, setForm] = useState({
    id: initial?.id,
    key: initial?.key ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    image_url: initial?.image_url ?? "",
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  });
  const save = useServerFn(adminUpsertCategory);
  const upload = useServerFn(adminUploadCategoryImage);
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          key: form.key,
          name: form.name,
          description: form.description,
          image_url: form.image_url,
          sort_order: form.sort_order,
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success(initial ? "Catégorie enregistrée." : "Catégorie créée.");
      if (!initial) {
        setForm({
          id: undefined,
          key: "",
          name: "",
          description: "",
          image_url: "",
          sort_order: 0,
          is_active: true,
        });
        setCollapsed(true);
      }
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!initial && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="inline-flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
      >
        <Plus className="h-4 w-4" /> Nouvelle catégorie
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label="Nom" required>
        <input
          className="input"
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({
              ...f,
              name,
              key: initial ? f.key : slugify(name).replace(/-/g, "_"),
            }));
          }}
          required
        />
      </Field>
      <Field label="Clé (technique)" required>
        <input
          className="input"
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
          disabled={!!initial}
          required
        />
      </Field>
      <Field label="Description courte" className="sm:col-span-2">
        <textarea
          className="input min-h-[70px]"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={600}
        />
      </Field>
      <Field label="Ordre d'affichage">
        <input
          className="input"
          type="number"
          min={0}
          value={form.sort_order}
          onChange={(e) =>
            setForm({ ...form, sort_order: Number(e.target.value) || 0 })
          }
        />
      </Field>
      <Field label="Statut">
        <select
          className="input"
          value={form.is_active ? "1" : "0"}
          onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}
        >
          <option value="1">Visible</option>
          <option value="0">Masquée</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <ImagePicker
          url={form.image_url}
          onChange={(url) => setForm({ ...form, image_url: url })}
          upload={upload}
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={m.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Enregistrer
        </button>
        {!initial && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed(true)}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function SubcategoryEditor({
  categoryId,
  initial,
  onSaved,
  onCancel,
}: {
  categoryId: string;
  initial?: ShopSubcategory;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    id: initial?.id,
    category_id: categoryId,
    slug: initial?.slug ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    image_url: initial?.image_url ?? "",
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  });
  const save = useServerFn(adminUpsertSubcategory);
  const upload = useServerFn(adminUploadCategoryImage);
  const m = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Sous-catégorie enregistrée.");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label="Nom" required>
        <input
          className="input"
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({
              ...f,
              name,
              slug: initial ? f.slug : slugify(name),
            }));
          }}
          required
        />
      </Field>
      <Field label="Slug (URL)" required>
        <input
          className="input"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
          required
        />
      </Field>
      <Field label="Description courte" className="sm:col-span-2">
        <textarea
          className="input min-h-[70px]"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="Ordre d'affichage">
        <input
          className="input"
          type="number"
          min={0}
          value={form.sort_order}
          onChange={(e) =>
            setForm({ ...form, sort_order: Number(e.target.value) || 0 })
          }
        />
      </Field>
      <Field label="Statut">
        <select
          className="input"
          value={form.is_active ? "1" : "0"}
          onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}
        >
          <option value="1">Visible</option>
          <option value="0">Masquée</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <ImagePicker
          url={form.image_url}
          onChange={(url) => setForm({ ...form, image_url: url })}
          upload={upload}
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={m.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Enregistrer
        </button>
        {onCancel && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function ImagePicker({
  url,
  onChange,
  upload,
}: {
  url: string;
  onChange: (url: string) => void;
  upload: (args: { data: { filename: string; contentType: string; base64: string } }) => Promise<{ url: string; path: string }>;
}) {
  const [uploading, setUploading] = useState(false);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      const res = await upload({
        data: {
          filename: file.name,
          contentType: file.type || "image/jpeg",
          base64,
        },
      });
      onChange(res.url);
      toast.success("Image envoyée.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        {url ? (
          <div className="relative">
            <img src={url} alt="" className="h-20 w-20 rounded object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -right-2 -top-2 rounded-full bg-background p-0.5 shadow"
              aria-label="Retirer l'image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded bg-secondary text-xs text-muted-foreground">
            Aucune
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-secondary">
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {uploading ? "Envoi…" : url ? "Remplacer l'image" : "Uploader une image"}
          <input type="file" accept="image/*" onChange={onFile} className="hidden" />
        </label>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

// Silence unused import warning if a build ever tree-shakes lucide differently.
void useMemo;