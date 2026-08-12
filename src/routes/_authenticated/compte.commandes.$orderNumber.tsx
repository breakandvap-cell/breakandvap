import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/products";
import { itemDescription } from "@/lib/order-item-format";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { InvoiceDownloadButton } from "@/components/invoice-download-button";

export const Route = createFileRoute(
  "/_authenticated/compte/commandes/$orderNumber",
)({
  component: OrderDetailPage,
});

type Shipping = {
  full_name?: string;
  phone?: string | null;
  line1?: string;
  line2?: string | null;
  postal_code?: string;
  city?: string;
  country?: string;
};

function OrderDetailPage() {
  const { orderNumber } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-order", orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total_cents, currency, created_at, tracking_number, shipping_address, order_items(id, product_name, quantity, unit_price_cents, base_price_cents, boosters_count, booster_unit_price_cents, nicotine_mg, volume_ml, flavor, variant_sku, products(photos, slug)), invoices(id)",
        )
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw notFound();
      return data;
    },
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data) return null;

  const shipping = (data.shipping_address ?? {}) as Shipping;
  const hasInvoice = (data.invoices ?? []).length > 0;

  return (
    <div className="space-y-6">
      <Link
        to="/compte/commandes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à mes commandes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Commande {data.order_number}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(data.created_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={data.status} />
          <span className="text-lg font-semibold">
            {formatPrice(data.total_cents, data.currency)}
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Articles commandés</h2>
        <ul className="mt-4 divide-y divide-border">
          {(data.order_items ?? []).map((it) => {
            const photo = it.products?.photos?.[0];
            return (
              <li key={it.id} className="flex gap-4 py-3">
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-md border border-dashed border-border" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{it.product_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {itemDescription(it)}
                  </p>
                  {it.variant_sku ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Réf. {it.variant_sku}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {it.quantity} ×{" "}
                    {formatPrice(it.unit_price_cents, data.currency)}
                  </p>
                </div>
                <div className="shrink-0 text-sm font-medium">
                  {formatPrice(it.unit_price_cents * it.quantity, data.currency)}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 text-sm">
          <h2 className="text-sm font-semibold">Adresse de livraison</h2>
          <address className="mt-3 not-italic text-muted-foreground">
            {shipping.full_name}
            <br />
            {shipping.line1}
            {shipping.line2 ? (
              <>
                <br />
                {shipping.line2}
              </>
            ) : null}
            <br />
            {shipping.postal_code} {shipping.city}
            <br />
            {shipping.country}
            {shipping.phone ? (
              <>
                <br />
                {shipping.phone}
              </>
            ) : null}
          </address>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 text-sm">
          <h2 className="text-sm font-semibold">Suivi & facture</h2>
          <div className="mt-3 space-y-3 text-muted-foreground">
            {data.tracking_number ? (
              <p className="flex flex-wrap items-center gap-2">
                <Truck className="h-4 w-4" />
                <span>Suivi : {data.tracking_number}</span>
                <a
                  href={`https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(data.tracking_number)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Suivre le colis
                </a>
              </p>
            ) : (
              <p>Numéro de suivi communiqué à l'expédition.</p>
            )}
            {hasInvoice ? (
              <InvoiceDownloadButton orderId={data.id} />
            ) : (
              <p className="text-xs">
                La facture sera disponible dès la confirmation du règlement.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
