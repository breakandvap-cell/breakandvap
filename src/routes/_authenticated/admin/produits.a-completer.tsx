import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminListBrands,
  adminListIncompleteProducts,
  adminSetProductsBrandRange,
} from "@/lib/admin.functions";
import { GammeSelect } from "@/components/admin/gamme-select";
import { CATEGORY_LABELS } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/admin/produits/a-completer")({
  ssr: false,
  component: IncompleteProducts,
});

type Row = {
  id: string;
  name: string;
  category: keyof typeof CATEGORY_LABELS;
  subcategory: string | null;
  photos: string[];
  brand: string | null;
  product_range: string | null;
  gamme_id: string | null;
};

function IncompleteProducts() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListIncompleteProducts);
  const brandsFn = useServerFn(adminListBrands);
  const applyFn = useServerFn(adminSetProductsBrandRange);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBrand, setBulkBrand] = useState("");
  const [bulkRange, setBulkRange] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "products", "incomplete"],
    queryFn: () => listFn({ data: {} }) as Promise<Row[]>,
  });
  const { data: brands = [] } = useQuery({
    queryKey: ["admin", "brands"],
    queryFn: () => brandsFn(),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const apply = useMutation({
    mutationFn: (input: { ids: string[]; brand?: string; range?: string }) =>
      applyFn({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["gammes"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveRow = (row: Row, patch: { brand?: string; range?: string }) => {
    apply.mutate(
      { ids: [row.id], ...patch },
      { onSuccess: () => toast.success(`« ${row.name} » mis à jour.`) },
    );
  };

  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const selectedCount = visible.filter((r) => selected.has(r.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produits à compléter</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Chargement…"
              : `${rows.length} produit${rows.length > 1 ? "s" : ""} restant${rows.length > 1 ? "s" : ""} à compléter`}
          </p>
        </div>
        <Link
          to="/admin/produits"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Tous les produits
        </Link>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit par nom…"
        className="input h-11 w-full text-base sm:max-w-sm"
      />

      {selectedCount > 0 && (
        <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Marque</label>
            <input
              list="bulk-brands"
              value={bulkBrand}
              onChange={(e) => setBulkBrand(e.target.value)}
              placeholder="Laisser vide pour ne pas modifier"
              className="input h-10 w-full text-base"
            />
            <datalist id="bulk-brands">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Gamme</label>
            <GammeSelect brand={bulkBrand} value={bulkRange} onChange={setBulkRange} />
          </div>
          <button
            type="button"
            disabled={apply.isPending || (!bulkBrand.trim() && !bulkRange.trim())}
            onClick={() =>
              apply.mutate(
                {
                  ids: visible.filter((r) => selected.has(r.id)).map((r) => r.id),
                  brand: bulkBrand.trim(),
                  range: bulkRange.trim(),
                },
                {
                  onSuccess: (res) => {
                    toast.success(`${res.updated} produit(s) mis à jour.`);
                    setSelected(new Set());
                    setBulkBrand("");
                    setBulkRange("");
                  },
                },
              )
            }
            className="h-10 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Appliquer aux {selectedCount} produits sélectionnés
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2">Produit</th>
              <th className="px-3 py-2">Catégorie</th>
              <th className="px-3 py-2">Sous-catégorie</th>
              <th className="px-3 py-2 w-56">Marque</th>
              <th className="px-3 py-2 w-64">Gamme</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${p.name}`}
                    checked={selected.has(p.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    {p.photos?.[0] ? (
                      <img
                        src={p.photos[0]}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                    <span className="font-medium">{p.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {p.subcategory || "—"}
                </td>
                <td className="px-3 py-3">
                  <input
                    list="row-brands"
                    defaultValue={p.brand ?? ""}
                    placeholder="Marque"
                    className="input h-10 w-full text-base"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== (p.brand ?? "").trim()) saveRow(p, { brand: v });
                    }}
                  />
                </td>
                <td className="px-3 py-3">
                  <GammeSelect
                    brand={p.brand ?? ""}
                    value={p.product_range ?? ""}
                    onChange={(nom) => {
                      if (nom.trim()) saveRow(p, { range: nom.trim() });
                    }}
                  />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {isLoading ? "Chargement…" : "Tous les produits sont complets 🎉"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <datalist id="row-brands">
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </div>
  );
}
