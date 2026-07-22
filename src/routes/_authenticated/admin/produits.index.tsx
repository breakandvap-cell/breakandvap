import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListProducts, adminDeleteProduct, adminTechnicalReferences } from "@/lib/admin.functions";
import {
  formatPrice,
  CATEGORY_LABELS,
  boosterProductsQueryOptions,
  duplicateBoosterTypes,
  boosterTypeLabel,
} from "@/lib/products";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { computeProductStatus, StatusBadge } from "@/lib/product-status";

type ProductFilters = {
  category?: "" | "cbd" | "e_liquide" | "accessoire_vape" | "accessoire_cbd";
  status?: "" | "published" | "draft" | "out_of_stock";
};

const listOptions = (filters: ProductFilters) =>
  queryOptions({
    queryKey: ["admin", "products", filters.category ?? "all", filters.status ?? "all"],
    queryFn: () => adminListProducts({ data: filters }),
  });

export const Route = createFileRoute("/_authenticated/admin/produits/")({
  ssr: false,
  validateSearch: (search): ProductFilters => ({
    category: [
      "cbd",
      "e_liquide",
      "accessoire_vape",
      "accessoire_cbd",
    ].includes(search.category as string)
      ? (search.category as ProductFilters["category"])
      : "",
    status: ["published", "draft", "out_of_stock"].includes(search.status as string)
      ? (search.status as ProductFilters["status"])
      : "",
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(listOptions(deps)),
  component: ProductsList,
});

const STATUS_LABELS: Record<NonNullable<ProductFilters["status"]>, string> = {
  published: "Publiés",
  draft: "Brouillons",
  out_of_stock: "En rupture",
  "": "Tous les statuts",
};

function ProductsList() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(listOptions(search));
  const { data: boosterList } = useQuery(boosterProductsQueryOptions());
  const techRefsFn = useServerFn(adminTechnicalReferences);
  const { data: techRefs } = useQuery({
    queryKey: ["admin", "technical-references"],
    queryFn: () => techRefsFn(),
    retry: false,
  });
  const protectedIds = new Set<string>();
  for (const b of techRefs?.boosters ?? []) if (b.is_protected) protectedIds.add(b.id);
  for (const b of techRefs?.bottles ?? []) if (b.is_protected) protectedIds.add(b.id);
  const duplicates = duplicateBoosterTypes(boosterList);
  const duplicateEntries = Object.entries(duplicates);
  const qc = useQueryClient();
  const del = useServerFn(adminDeleteProduct);
  const m = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: async () => {
      toast.success("Produit supprimé.");
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setFilter = (patch: Partial<ProductFilters>) => {
    navigate({
      to: ".",
      search: { ...search, ...patch },
      replace: true,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Produits</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/produits/import"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Import CSV
          </Link>
          <Link
            to="/admin/produits/$id"
            params={{ id: "nouveau" }}
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            + Nouveau produit
          </Link>
        </div>
      </div>

      {duplicateEntries.length > 0 && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p className="mb-1 flex items-center gap-2 font-medium text-amber-100">
            <AlertTriangle className="h-4 w-4" /> Doublons de type de booster détectés
          </p>
          <p className="mb-2">
            Plusieurs produits publiés sont marqués « booster de nicotine » avec
            le même type. Le site utilisera automatiquement le plus ancien ;
            corrige les doublons pour éviter toute ambiguïté.
          </p>
          <ul className="list-inside list-disc space-y-1">
            {duplicateEntries.map(([type, list]) => (
              <li key={type}>
                <strong>{boosterTypeLabel(type)}</strong> :{" "}
                {list
                  .map((p, i) => (i === 0 ? `${p.name} (utilisé)` : p.name))
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="category" className="text-sm text-muted-foreground">
            Catégorie
          </label>
          <select
            id="category"
            value={search.category ?? ""}
            onChange={(e) => setFilter({ category: e.target.value as ProductFilters["category"] })}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Toutes</option>
            <option value="cbd">CBD</option>
            <option value="e_liquide">E-liquides</option>
            <option value="accessoire_vape">Accessoires Vape</option>
            <option value="accessoire_cbd">Accessoires CBD</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Statut
          </label>
          <select
            id="status"
            value={search.status ?? ""}
            onChange={(e) => setFilter({ status: e.target.value as ProductFilters["status"] })}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Tous</option>
            <option value="published">Publiés</option>
            <option value="draft">Brouillons</option>
            <option value="out_of_stock">En rupture</option>
          </select>
        </div>

        {(search.category || search.status) && (
          <button
            onClick={() => setFilter({ category: "", status: "" })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Catégorie</th>
              <th className="px-3 py-2">Prix</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Publié</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <span>{p.name}</span>
                    <StatusBadge
                      status={computeProductStatus({
                        is_published: p.is_published,
                        name: p.name,
                        slug: p.slug,
                        price_cents: p.price_cents,
                        photos: [],
                        isProtected: protectedIds.has(p.id),
                        hasVariantsCoveringPrice: true,
                      })}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{CATEGORY_LABELS[p.category]}</td>
                <td className="px-3 py-2">{formatPrice(p.price_cents, p.currency)}</td>
                <td className="px-3 py-2">
                  {p.stock}{" "}
                  {p.stock_status === "out_of_stock" ? (
                    <span className="text-destructive text-xs">(rupture)</span>
                  ) : p.stock_status === "low_stock" ? (
                    <span className="text-amber-700 text-xs">(faible)</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{p.is_published ? "Oui" : "Non"}</td>
                <td className="px-3 py-2 text-right">
                  {p.category === "e_liquide" ? (
                    <Link
                      to="/admin/produits/eliquide/$id"
                      params={{ id: p.id }}
                      className="text-primary hover:underline"
                    >
                      Modifier
                    </Link>
                  ) : (
                    <Link
                      to="/admin/produits/$id"
                      params={{ id: p.id }}
                      className="text-primary hover:underline"
                    >
                      Modifier
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer "${p.name}" ?`)) m.mutate(p.id);
                    }}
                    className="ml-3 text-destructive hover:underline"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Aucun produit ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
