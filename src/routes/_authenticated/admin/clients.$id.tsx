import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { adminGetCustomer } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";

const opts = (id: string) =>
  queryOptions({
    queryKey: ["admin", "customer", id],
    queryFn: () => adminGetCustomer({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/admin/clients/$id")({
  ssr: false,
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.id)),
  component: CustomerDetail,
});

function CustomerDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(opts(id));
  const { profile, orders } = data;
  const total = orders.reduce((s, o) => s + o.total_cents, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/clients" className="text-xs text-muted-foreground hover:text-foreground">
          ← Retour à l'annuaire
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{profile.full_name ?? "Client"}</h1>
        <div className="mt-1 text-sm text-muted-foreground">
          {profile.email} {profile.phone ? `· ${profile.phone}` : ""}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Compte créé le {new Date(profile.created_at).toLocaleDateString("fr-FR")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Commandes" value={String(orders.length)} />
        <Card label="Total dépensé" value={formatPrice(total)} />
        <Card
          label="Dernière commande"
          value={orders[0] ? new Date(orders[0].created_at).toLocaleDateString("fr-FR") : "—"}
        />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Historique des commandes</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Numéro</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Suivi</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2">
                    <Link to="/admin/commandes/$id" params={{ id: o.id }} className="font-medium hover:underline">
                      #{o.order_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{o.tracking_number ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(o.total_cents, o.currency)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Aucune commande.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}