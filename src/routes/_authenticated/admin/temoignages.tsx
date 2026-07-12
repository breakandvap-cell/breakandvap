import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  adminDeleteTestimonial,
  adminListTestimonials,
  adminUpsertTestimonial,
  type Testimonial,
} from "@/lib/testimonials.functions";

export const Route = createFileRoute("/_authenticated/admin/temoignages")({
  ssr: false,
  component: TestimonialsAdmin,
});

function TestimonialsAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(adminListTestimonials);
  const upsert = useServerFn(adminUpsertTestimonial);
  const del = useServerFn(adminDeleteTestimonial);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "testimonials"],
    queryFn: () => list(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "testimonials"] });
    qc.invalidateQueries({ queryKey: ["testimonials", "featured"] });
  };

  const mSave = useMutation({
    mutationFn: (payload: Parameters<typeof upsert>[0]["data"]) =>
      upsert({ data: payload }),
    onSuccess: () => {
      toast.success("Avis enregistré.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Avis supprimé.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
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

  const items = data ?? [];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Témoignages clients</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ajoutez, modifiez ou supprimez les avis affichés sur la page d'accueil.
          Décochez « Mis en avant » pour retirer un avis de la page d'accueil
          sans le supprimer.
        </p>
      </header>

      <TestimonialForm
        onSubmit={(d) => mSave.mutate(d)}
        pending={mSave.isPending}
      />

      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Avis existants ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {items.map((t) => (
              <TestimonialRow
                key={t.id}
                item={t}
                onSave={(d) => mSave.mutate(d)}
                onDelete={() => {
                  if (confirm(`Supprimer l'avis de ${t.author_name} ?`)) {
                    mDelete.mutate(t.id);
                  }
                }}
                pending={mSave.isPending || mDelete.isPending}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type FormValues = {
  id?: string;
  author_name: string;
  content: string;
  rating: number | null;
  is_featured: boolean;
  sort_order: number;
};

function TestimonialForm({
  initial,
  onSubmit,
  pending,
  compact,
  onCancel,
}: {
  initial?: Testimonial;
  onSubmit: (v: FormValues) => void;
  pending: boolean;
  compact?: boolean;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<FormValues>({
    id: initial?.id,
    author_name: initial?.author_name ?? "",
    content: initial?.content ?? "",
    rating: initial?.rating ?? 5,
    is_featured: initial?.is_featured ?? true,
    sort_order: initial?.sort_order ?? 0,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.author_name.trim() || !v.content.trim()) {
          toast.error("Nom et contenu obligatoires.");
          return;
        }
        onSubmit(v);
        if (!initial) {
          setV({
            author_name: "",
            content: "",
            rating: 5,
            is_featured: true,
            sort_order: 0,
          });
        }
      }}
      className={
        compact
          ? "grid gap-3 p-4"
          : "grid gap-3 rounded-md border border-border bg-card p-5"
      }
    >
      {!compact && (
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Nouvel avis
        </h2>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Nom / initiales</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={v.author_name}
            onChange={(e) => setV({ ...v, author_name: e.target.value })}
            placeholder="Julie M."
            maxLength={120}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Note (1-5)</span>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={v.rating ?? ""}
            onChange={(e) =>
              setV({
                ...v,
                rating: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">Sans note</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} étoile{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Témoignage</span>
        <textarea
          className="min-h-[100px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={v.content}
          onChange={(e) => setV({ ...v, content: e.target.value })}
          maxLength={1000}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.is_featured}
            onChange={(e) => setV({ ...v, is_featured: e.target.checked })}
          />
          Mis en avant sur la page d'accueil
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Ordre</span>
          <input
            type="number"
            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={v.sort_order}
            min={0}
            onChange={(e) =>
              setV({ ...v, sort_order: Number(e.target.value) || 0 })
            }
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {initial ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </form>
  );
}

function TestimonialRow({
  item,
  onSave,
  onDelete,
  pending,
}: {
  item: Testimonial;
  onSave: (v: FormValues) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li>
        <TestimonialForm
          initial={item}
          compact
          pending={pending}
          onSubmit={(v) => {
            onSave(v);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li className="flex items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{item.author_name}</span>
          {item.rating != null && (
            <span className="text-xs text-muted-foreground">{item.rating}/5</span>
          )}
          {!item.is_featured && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              masqué
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            ordre {item.sort_order}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">« {item.content} »</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs"
        >
          Modifier
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </button>
      </div>
    </li>
  );
}