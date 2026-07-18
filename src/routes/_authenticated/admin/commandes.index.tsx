import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminSearchOrders,
  adminUpdateOrder,
  adminMarkOrderDelivered,
  adminCancelOrder,
} from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";
import { z } from "zod";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { toast } from "sonner";

const statusEnum = z.enum(["a_preparer", "expediee", "livree", "annulee"]);
const searchSchema = z.object({
  status: statusEnum.optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
type SearchParams = z.infer<typeof searchSchema>;

const ordersOptions = (s: SearchParams) =>
  queryOptions({
    queryKey: ["admin", "orders", "search", s],
    queryFn: () =>
      adminSearchOrders({
        data: { status: s.status, q: s.q ?? "", from: s.from ?? "", to: s.to ?? "" },
      }),
  });

export const Route = createFileRoute("/_authenticated/admin/commandes/")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(ordersOptions(deps)),
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
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(ordersOptions(search));
  const [q, setQ] = useState(search.q ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate({
      to: "/admin/commandes",
      search: { ...search, q: q || undefined, from: from || undefined, to: to || undefined },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Historique des commandes</h1>
        <span className="text-xs text-muted-foreground">{data.length} résultat(s)</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s.label}
            to="/admin/commandes"
            search={{ ...search, status: s.value }}
            className={
              (search.status === s.value
                ? "bg-primary text-primary-foreground"
                : "bg-card border") + " rounded-md px-3 py-1.5 text-xs"
            }
          >
            {s.label}
          </Link>
        ))}
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-md border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <input
          type="search"
          placeholder="Rechercher (n° commande, client, email)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          maxLength={160}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Du
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Au
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
            Filtrer
          </button>
          <Link
            to="/admin/commandes"
            search={{}}
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
            }}
            className="rounded-md border px-3 py-2 text-xs"
          >
            Réinitialiser
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Numéro</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Produits</th>
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
                  {new Date(o.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-3 py-2">
                  <div className="text-foreground">{o.customer_name ?? "Invité"}</div>
                  <div className="text-xs text-muted-foreground">{o.customer_email ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {o.items.length === 0
                    ? "—"
                    : o.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}
                </td>
                <td className="px-3 py-2">
                  <RowStatusControl
                    id={o.id}
                    status={o.status}
                    trackingNumber={o.tracking_number}
                  />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{o.tracking_number ?? "—"}</td>
                <td className="px-3 py-2 text-right">{formatPrice(o.total_cents, o.currency)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
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
