import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetOrder, adminUpdateOrder } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { InvoiceDownloadButton } from "@/components/invoice-download-button";
import {
  itemDescription,
  lineTaxBreakdown,
  productRef,
  sumBreakdowns,
} from "@/lib/order-item-format";
import { INVOICE_VAT_RATE } from "@/lib/invoice-config";

const opts = (id: string) =>
  queryOptions({
    queryKey: ["admin", "order", id],
    queryFn: () => adminGetOrder({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/admin/commandes/$id")({
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

      <div className="flex justify-end">
        <InvoiceDownloadButton orderId={order.id} />
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
                <th className="px-3 py-2">Réf</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">PU TTC</th>
                <th className="px-3 py-2 text-right">Qté</th>
                <th className="px-3 py-2 text-right">Montant HT</th>
                <th className="px-3 py-2 text-right">TVA</th>
                <th className="px-3 py-2 text-right">Montant TTC</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => {
                const b = lineTaxBreakdown(it.unit_price_cents, it.quantity, INVOICE_VAT_RATE);
                return (
                  <tr key={it.id} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs">
                      {productRef(it.product_name, it.volume_ml)}
                    </td>
                    <td className="px-3 py-2">
                      {it.product_id ? (
                        <Link to="/admin/produits/$id" params={{ id: it.product_id }} className="hover:underline">
                          {itemDescription(it)}
                        </Link>
                      ) : (
                        itemDescription(it)
                      )}
                      {it.boosters_count && it.boosters_count > 0 &&
                      it.booster_unit_price_cents != null &&
                      it.base_price_cents != null ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          À préparer : flacon {it.volume_ml} ml ({formatPrice(it.base_price_cents, order.currency)}) + {it.boosters_count} booster{it.boosters_count > 1 ? "s" : ""} × {formatPrice(it.booster_unit_price_cents, order.currency)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(it.unit_price_cents, order.currency)}</td>
                    <td className="px-3 py-2 text-right">{it.quantity}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(b.ht, order.currency)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(b.tva, order.currency)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatPrice(b.ttc, order.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/20">
              {(() => {
                const totals = sumBreakdowns(items, INVOICE_VAT_RATE);
                return (
                  <>
                    <tr>
                      <td colSpan={6} className="px-3 py-1.5 text-right text-muted-foreground">Sous-total HT</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatPrice(totals.ht, order.currency)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="px-3 py-1.5 text-right text-muted-foreground">TVA ({INVOICE_VAT_RATE} %)</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatPrice(totals.tva, order.currency)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-right font-semibold">Total TTC</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatPrice(order.total_cents, order.currency)}</td>
                    </tr>
                  </>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
