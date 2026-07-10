import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListProducts, adminDeleteProduct } from "@/lib/admin.functions";
import { formatPrice, CATEGORY_LABELS } from "@/lib/products";
import { toast } from "sonner";

const listOptions = queryOptions({
  queryKey: ["admin", "products"],
  queryFn: () => adminListProducts(),
});

export const Route = createFileRoute("/_authenticated/admin/produits")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(listOptions),
  component: ProductsList,
});

function ProductsList() {
  const { data } = useSuspenseQuery(listOptions);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Produits</h1>
        <Link
          to="/admin/produits/$id"
          params={{ id: "nouveau" }}
          className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          + Nouveau produit
        </Link>
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
                <td className="px-3 py-2 font-medium">{p.name}</td>
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
                  <Link
                    to="/admin/produits/$id"
                    params={{ id: p.id }}
                    className="text-primary hover:underline"
                  >
                    Modifier
                  </Link>
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
                  Aucun produit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
