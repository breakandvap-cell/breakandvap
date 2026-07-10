import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { adminListOrders } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";
import { z } from "zod";

const searchSchema = z.object({
  status: z.enum(["a_preparer", "expediee", "livree", "annulee"]).optional(),
});

const ordersOptions = (status?: "a_preparer" | "expediee" | "livree" | "annulee") =>
  queryOptions({
    queryKey: ["admin", "orders", status ?? "all"],
    queryFn: () => adminListOrders({ data: { status } }),
  });

export const Route = createFileRoute("/_authenticated/admin/commandes")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(ordersOptions(deps.status)),
  component: OrdersList,
});

const STATUSES = [
  { value: undefined, label: "Toutes" },
  { value: "a_preparer" as const, label: "À préparer" },
  { value: "expediee" as const, label: "Expédiées" },
  { value: "livree" as const, label: "Livrées" },
  { value: "annulee" as const, label: "Annulées" },
];

function OrdersList() {
  const { status } = Route.useSearch();
  const { data } = useSuspenseQuery(ordersOptions(status));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Commandes</h1>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s.label}
            to="/admin/commandes"
            search={s.value ? { status: s.value } : {}}
            className={
              (status === s.value
                ? "bg-primary text-primary-foreground"
                : "bg-card border") + " rounded-md px-3 py-1.5 text-xs"
            }
          >
            {s.label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Numéro</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Suivi</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2">
                  <Link to="/admin/commandes/$id" params={{ id: o.id }} className="font-medium hover:underline">
                    #{o.order_number}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("fr-FR")}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {o.guest_email ?? (o.user_id ? "Compte client" : "—")}
                </td>
                <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-2 text-muted-foreground">{o.tracking_number ?? "—"}</td>
                <td className="px-3 py-2 text-right">{formatPrice(o.total_cents, o.currency)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Aucune commande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
