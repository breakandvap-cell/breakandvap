import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetOrder, adminUpdateOrder } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

const opts = (id: string) =>
  queryOptions({
    queryKey: ["admin", "order", id],
    queryFn: () => adminGetOrder({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/admin/commandes/")({
  ssr: false,
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.id)),
  component: OrderDetail,
});

type Status = "a_preparer" | "expediee" | "livree" | "annulee";

function OrderDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(opts(id));
  const { order, items } = data;
  const shipping = order.shipping_address as {
    full_name?: string;
    line1?: string;
    line2?: string | null;
    postal_code?: string;
    city?: string;
    country?: string;
    phone?: string | null;
  };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const upd = useServerFn(adminUpdateOrder);
  const [status, setStatus] = useState<Status>(order.status);
  const [tracking, setTracking] = useState(order.tracking_number ?? "");

  useEffect(() => {
    setStatus(order.status);
    setTracking(order.tracking_number ?? "");
  }, [order.id, order.status, order.tracking_number]);

  const m = useMutation({
    mutationFn: () => upd({ data: { id, status, tracking_number: tracking } }),
    onSuccess: async () => {
      toast.success("Commande mise à jour.");
      await qc.invalidateQueries({ queryKey: ["admin", "order", id] });
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      await qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate({ to: "/admin/commandes" })} className="text-xs text-muted-foreground hover:text-foreground">
            ← Commandes
          </button>
          <h1 className="mt-1 text-2xl font-semibold">Commande #{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(order.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-md border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Livraison
          </h2>
          <div className="text-sm">
            <div className="font-medium">{shipping.full_name}</div>
            <div>{shipping.line1}</div>
            {shipping.line2 ? <div>{shipping.line2}</div> : null}
            <div>{shipping.postal_code} {shipping.city}</div>
            <div>{shipping.country}</div>
            {shipping.phone ? <div className="mt-1 text-muted-foreground">Tél. {shipping.phone}</div> : null}
            <div className="mt-2 text-muted-foreground">
              {order.guest_email ?? "Compte client"}
            </div>
          </div>
        </section>

        <section className="rounded-md border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Statut & suivi
          </h2>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Statut</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="a_preparer">À préparer</option>
                <option value="expediee">Expédiée</option>
                <option value="livree">Livrée</option>
                <option value="annulee">Annulée</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Numéro de suivi</span>
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ex. 1Z999..." />
            </label>
            <button type="submit" disabled={m.isPending} className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {m.isPending ? "…" : "Enregistrer"}
            </button>
          </form>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Articles</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Produit</th>
                <th className="px-3 py-2">Qté</th>
                <th className="px-3 py-2 text-right">Prix unitaire</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2">
                    {it.product_id ? (
                      <Link to="/admin/produits/$id" params={{ id: it.product_id }} className="hover:underline">
                        {it.product_name}
                      </Link>
                    ) : (
                      it.product_name
                    )}
                  </td>
                  <td className="px-3 py-2">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(it.unit_price_cents, order.currency)}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(it.unit_price_cents * it.quantity, order.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-medium">Total</td>
                <td className="px-3 py-2 text-right font-semibold">{formatPrice(order.total_cents, order.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
