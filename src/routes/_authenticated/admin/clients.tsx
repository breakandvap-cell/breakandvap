import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { adminListCustomers } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { z } from "zod";
import { useState, type FormEvent } from "react";

const searchSchema = z.object({ q: z.string().optional() });

const opts = (q: string) =>
  queryOptions({
    queryKey: ["admin", "customers", q],
    queryFn: () => adminListCustomers({ data: { q } }),
  });

export const Route = createFileRoute("/_authenticated/admin/clients")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(opts(deps.q)),
  component: ClientsList,
});

function ClientsList() {
  const { q: qInit } = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(opts(qInit ?? ""));
  const [q, setQ] = useState(qInit ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/admin/clients", search: { q: q || undefined } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Annuaire clients</h1>
        <span className="text-xs text-muted-foreground">{data.length} client(s)</span>
      </div>
      <form onSubmit={submit} className="flex gap-2 rounded-md border bg-card p-3">
        <input
          type="search"
          placeholder="Rechercher par nom, email ou téléphone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input flex-1"
          maxLength={160}
        />
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
          Rechercher
        </button>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Téléphone</th>
              <th className="px-3 py-2 text-right">Commandes</th>
              <th className="px-3 py-2 text-right">Total dépensé</th>
              <th className="px-3 py-2">Dernière commande</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.email}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="px-3 py-2 text-right">{c.orders_count}</td>
                <td className="px-3 py-2 text-right">{formatPrice(c.total_spent_cents)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/admin/clients/$id"
                    params={{ id: c.id }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Historique →
                  </Link>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Aucun client.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}