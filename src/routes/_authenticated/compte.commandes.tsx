import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/products";
import { InvoiceDownloadButton } from "@/components/invoice-download-button";

export const Route = createFileRoute("/_authenticated/compte/commandes")({
  component: OrdersPage,
});

const STATUS_LABELS: Record<string, string> = {
  a_preparer: "À préparer",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée",
};

function OrdersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total_cents, currency, created_at, tracking_number, order_items(product_name, quantity, unit_price_cents, base_price_cents, boosters_count, booster_unit_price_cents, nicotine_mg, volume_ml, flavor)",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Vous n'avez pas encore passé de commande.
        </p>
        <Link
          to="/boutique"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Découvrir le catalogue
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {data.map((o) => (
        <li
          key={o.id}
          className="rounded-lg border border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Commande {o.order_number}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              {STATUS_LABELS[o.status] ?? o.status}
            </span>
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            {o.order_items?.map((it, i) => (
              <li key={i} className="text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <span>
                    {it.quantity} × {it.product_name}
                  </span>
                  <span>
                    {formatPrice(it.unit_price_cents * it.quantity, o.currency)}
                  </span>
                </div>
                {it.boosters_count && it.boosters_count > 0 &&
                it.booster_unit_price_cents != null &&
                it.base_price_cents != null ? (
                  <div className="ml-4 text-[11px]">
                    Flacon {formatPrice(it.base_price_cents, o.currency)} + {it.boosters_count} booster
                    {it.boosters_count > 1 ? "s" : ""} ×{" "}
                    {formatPrice(it.booster_unit_price_cents, o.currency)} ={" "}
                    {formatPrice(
                      it.boosters_count * it.booster_unit_price_cents,
                      o.currency,
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">
              {o.tracking_number
                ? `Suivi : ${o.tracking_number}`
                : "Suivi communiqué à l'expédition"}
            </span>
            <span className="text-base font-semibold">
              {formatPrice(o.total_cents, o.currency)}
            </span>
          </div>
          <div className="mt-3 flex justify-end">
            <InvoiceDownloadButton orderId={o.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}