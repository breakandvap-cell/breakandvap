import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/products";
import { OrderStatusBadge } from "@/components/order-status-badge";

export const Route = createFileRoute("/_authenticated/compte/commandes/")({
  component: OrdersListPage,
});

function OrdersListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total_cents, currency, created_at, tracking_number, order_items(product_name, quantity, products(photos))",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Vous n'avez pas encore de commande.
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
    <ul className="space-y-3">
      {data.map((o) => {
        const photos = (o.order_items ?? [])
          .map((it) => it.products?.photos?.[0])
          .filter((p): p is string => !!p)
          .slice(0, 4);
        const itemCount = (o.order_items ?? []).reduce(
          (n, it) => n + (it.quantity ?? 0),
          0,
        );
        return (
          <li key={o.id}>
            <Link
              to="/compte/commandes/$orderNumber"
              params={{ orderNumber: o.order_number }}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary/40 sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Commande {o.order_number}
                  </p>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                  {itemCount > 0
                    ? ` · ${itemCount} article${itemCount > 1 ? "s" : ""}`
                    : ""}
                </p>
                {photos.length > 0 ? (
                  <div className="mt-3 flex items-center gap-2">
                    {photos.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 rounded-md border border-border object-cover"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-base font-semibold">
                  {formatPrice(o.total_cents, o.currency)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
