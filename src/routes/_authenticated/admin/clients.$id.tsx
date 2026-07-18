import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { adminGetCustomer } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";
import { itemDescription, productRef } from "@/lib/order-item-format";

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
  const { profile, orders, total_spent_cents, favorite_product } = data;

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Commandes" value={String(orders.length)} />
        <Card
          label="Total dépensé"
          value={formatPrice(total_spent_cents)}
          hint="Expédiées + livrées"
        />
        <Card
          label="Dernière commande"
          value={orders[0] ? new Date(orders[0].created_at).toLocaleDateString("fr-FR") : "—"}
        />
        <Card
          label="Produit favori"
          value={favorite_product ? favorite_product.name : "Pas encore assez de données"}
          hint={favorite_product ? `Commandé ${favorite_product.qty} fois` : undefined}
        />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Historique des commandes</h2>
        {orders.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            Aucune commande.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to="/admin/commandes/$id"
                      params={{ id: o.id }}
                      className="font-medium hover:underline"
                    >
                      #{o.order_number}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("fr-FR")}
                    </span>
                    <StatusBadge status={o.status} />
                    {o.tracking_number && (
                      <span className="text-xs text-muted-foreground">
                        Suivi : {o.tracking_number}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {formatPrice(o.total_cents, o.currency)}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Réf.</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">PU TTC</th>
                        <th className="px-3 py-2 text-right">Qté</th>
                        <th className="px-3 py-2 text-right">Total TTC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {o.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-mono text-xs">
                            {it.variant_sku ?? productRef(it.product_name, it.volume_ml)}
                          </td>
                          <td className="px-3 py-2">{itemDescription(it)}</td>
                          <td className="px-3 py-2 text-right">
                            {formatPrice(it.unit_price_cents, o.currency)}
                          </td>
                          <td className="px-3 py-2 text-right">{it.quantity}</td>
                          <td className="px-3 py-2 text-right">
                            {formatPrice(it.unit_price_cents * it.quantity, o.currency)}
                          </td>
                        </tr>
                      ))}
                      {o.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                            Aucune ligne.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}