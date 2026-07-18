import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetOrder,
  adminUpdateOrder,
  adminMarkOrderDelivered,
  adminCancelOrder,
  adminSetOrderRefundProcessed,
  adminForceOrderStatus,
  adminGetOrderAuditLog,
  type OrderAuditEntry,
} from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";
import { StatusBadge } from "./index";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { InvoiceDownloadButton } from "@/components/invoice-download-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

const auditOpts = (id: string) =>
  queryOptions({
    queryKey: ["admin", "order", id, "audit"],
    queryFn: () => adminGetOrderAuditLog({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/admin/commandes/$id")({
  ssr: false,
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(opts(params.id)),
      context.queryClient.ensureQueryData(auditOpts(params.id)),
    ]),
  component: OrderDetail,
});

type Status = "a_preparer" | "expediee" | "livree" | "annulee";

const TRACKING_RE = /^[A-Za-z0-9-]+$/;

/** Retourne un message d'erreur si le numéro de suivi est invalide pour le
 *  statut visé, sinon null. */
function validateTracking(raw: string, targetStatus: Status): string | null {
  const v = raw.trim();
  if (!v) {
    return targetStatus === "expediee"
      ? "Le numéro de suivi est obligatoire pour passer la commande en « Expédiée »."
      : null;
  }
  if (v.length < 8) return "Le numéro de suivi doit contenir au moins 8 caractères.";
  if (v.length > 40) return "Le numéro de suivi ne peut pas dépasser 40 caractères.";
  if (!TRACKING_RE.test(v))
    return "Caractères autorisés : lettres, chiffres et tirets uniquement (pas d'espace).";
  return null;
}

function OrderDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(opts(id));
  const { order, items } = data;
  const orderExt = order as typeof order & {
    delivered_at?: string | null;
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
    refund_processed_at?: string | null;
  };
  const isFinal = order.status === "livree" || order.status === "annulee";
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
  const deliver = useServerFn(adminMarkOrderDelivered);
  const cancel = useServerFn(adminCancelOrder);
  const setRefund = useServerFn(adminSetOrderRefundProcessed);
  const forceStatus = useServerFn(adminForceOrderStatus);
  const [status, setStatus] = useState<Status>(order.status);
  const [tracking, setTracking] = useState(order.tracking_number ?? "");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [trackingTouched, setTrackingTouched] = useState(false);
  const [manualStatus, setManualStatus] = useState<Status>(order.status);

  const trackingError = validateTracking(tracking, status);
  const showTrackingError = trackingError !== null && (trackingTouched || tracking.length > 0);

  useEffect(() => {
    setStatus(order.status);
    setTracking(order.tracking_number ?? "");
    setManualStatus(order.status);
  }, [order.id, order.status, order.tracking_number]);

  async function refreshAll() {
    // Refetch the current order immediately so the status badge and
    // action panel reflect the change without a manual reload; then
    // invalidate the surrounding lists so they update in the background.
    await qc.refetchQueries({ queryKey: ["admin", "order", id] });
    await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    await qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  }

  const m = useMutation({
    mutationFn: () => upd({ data: { id, status, tracking_number: tracking } }),
    onSuccess: async () => {
      toast.success("Statut mis à jour avec succès.");
      await refreshAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mDeliver = useMutation({
    mutationFn: () => deliver({ data: { id } }),
    onSuccess: async () => {
      toast.success("Commande marquée comme livrée.");
      await refreshAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mCancel = useMutation({
    mutationFn: () => cancel({ data: { id, reason: cancelReason } }),
    onSuccess: async () => {
      toast.success("Commande annulée.");
      setCancelOpen(false);
      setCancelReason("");
      await refreshAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mRefund = useMutation({
    mutationFn: (processed: boolean) => setRefund({ data: { id, processed } }),
    onSuccess: async () => {
      toast.success("Statut de remboursement mis à jour.");
      await refreshAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mForce = useMutation({
    mutationFn: (next: Status) => forceStatus({ data: { id, status: next } }),
    onSuccess: async () => {
      toast.success("Statut modifié manuellement (aucun email envoyé).");
      await refreshAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setTrackingTouched(true);
    if (trackingError) {
      toast.error(trackingError);
      return;
    }
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
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Statut actuel :</span>
            <StatusBadge status={order.status} />
          </div>
          {isFinal ? (
            <div className="space-y-3 text-sm">
              {order.status === "livree" ? (
                <p className="text-muted-foreground">
                  Livrée le{" "}
                  {orderExt.delivered_at
                    ? new Date(orderExt.delivered_at).toLocaleString("fr-FR")
                    : "—"}
                  . Cet état est définitif.
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    Annulée le{" "}
                    {orderExt.cancelled_at
                      ? new Date(orderExt.cancelled_at).toLocaleString("fr-FR")
                      : "—"}
                    . Cet état est définitif.
                  </p>
                  {orderExt.cancellation_reason ? (
                    <div className="rounded-md bg-muted/40 p-3 text-xs">
                      <div className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">
                        Motif interne
                      </div>
                      <div>{orderExt.cancellation_reason}</div>
                    </div>
                  ) : null}
                  <label className="flex items-start gap-2 pt-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(orderExt.refund_processed_at)}
                      disabled={mRefund.isPending}
                      onChange={(e) => mRefund.mutate(e.target.checked)}
                    />
                    <span>
                      Remboursement traité chez le prestataire de paiement
                      {orderExt.refund_processed_at
                        ? ` (${new Date(orderExt.refund_processed_at).toLocaleDateString("fr-FR")})`
                        : ""}
                      . Action manuelle à effectuer côté prestataire.
                    </span>
                  </label>
                </>
              )}
              {order.tracking_number ? (
                <p className="text-xs text-muted-foreground">
                  Suivi : {order.tracking_number}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={submit} className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Statut</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="a_preparer" disabled={order.status === "expediee"}>
                      À préparer
                    </option>
                    <option value="expediee">Expédiée</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Numéro de suivi
                    {status === "expediee" ? <span className="text-red-600"> *</span> : null}
                  </span>
                  <input
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    onBlur={() => setTrackingTouched(true)}
                    placeholder="Ex. 1Z999..."
                    aria-invalid={showTrackingError || undefined}
                    aria-describedby={showTrackingError ? "tracking-error" : "tracking-hint"}
                    className={`block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                      showTrackingError
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                        : "border-input focus:border-primary focus:ring-primary"
                    }`}
                  />
                  {showTrackingError ? (
                    <span
                      id="tracking-error"
                      role="alert"
                      className="mt-1 block text-xs font-medium text-red-600"
                    >
                      {trackingError}
                    </span>
                  ) : status === "expediee" ? (
                    <span id="tracking-hint" className="mt-1 block text-xs text-muted-foreground">
                      Obligatoire pour passer la commande en « Expédiée ». Un email de suivi sera envoyé au client.
                      <br />
                      Format attendu : 8 à 40 caractères, lettres, chiffres et tirets uniquement.
                    </span>
                  ) : null}
                </label>
                <button
                  type="submit"
                  disabled={m.isPending || Boolean(trackingError)}
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {m.isPending ? "…" : "Enregistrer"}
                </button>
              </form>

              <div className="border-t pt-3">
                {order.status === "expediee" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Confirmer la réception du colis par le client ? Cette action est définitive.",
                        )
                      ) {
                        mDeliver.mutate();
                      }
                    }}
                    disabled={mDeliver.isPending}
                    className="mr-2 inline-flex items-center rounded-md border border-green-600 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
                  >
                    {mDeliver.isPending ? "…" : "Marquer comme livrée"}
                  </button>
                )}
                {!cancelOpen ? (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="inline-flex items-center rounded-md border border-red-600 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                  >
                    Annuler la commande
                  </button>
                ) : (
                  <div className="mt-3 space-y-3 rounded-md border border-red-200 bg-red-50/50 p-3">
                    <p className="text-sm font-medium text-red-900">
                      Confirmer l'annulation de cette commande ?
                    </p>
                    <label className="block text-xs">
                      <span className="mb-1 block text-red-900">
                        Motif interne (optionnel)
                      </span>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Ex. rupture de stock, demande client…"
                        className="w-full rounded-md border border-red-200 bg-white p-2 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={mCancel.isPending}
                        onClick={() => mCancel.mutate()}
                        className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {mCancel.isPending ? "…" : "Confirmer l'annulation"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCancelOpen(false);
                          setCancelReason("");
                        }}
                        className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
                      >
                        Revenir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-md border border-dashed border-amber-400 bg-amber-50/50 p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-amber-900">
            Modification manuelle (usage test / exception)
          </h2>
          <p className="mb-3 text-xs text-amber-900/80">
            Force n'importe quel statut sans respecter les transitions
            normales. Aucun email de confirmation d'expédition, de livraison
            ou d'annulation n'est envoyé au client. À réserver aux commandes
            de test ou aux corrections exceptionnelles.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-amber-900">
                Nouveau statut
              </span>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value as Status)}
                className="block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="a_preparer">À préparer</option>
                <option value="expediee">Expédiée</option>
                <option value="livree">Livrée</option>
                <option value="annulee">Annulée</option>
              </select>
            </label>
            <button
              type="button"
              disabled={mForce.isPending || manualStatus === order.status}
              onClick={() => {
                if (
                  window.confirm(
                    `Forcer le statut à « ${STATUS_LABELS[manualStatus]} » sans envoyer d'email au client ?`,
                  )
                ) {
                  mForce.mutate(manualStatus);
                }
              }}
              className="inline-flex items-center rounded-md border border-amber-600 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
            >
              {mForce.isPending ? "…" : "Forcer le statut"}
            </button>
          </div>
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
                      {((it as { variant_sku?: string | null }).variant_sku ?? "") ||
                        productRef(it.product_name, it.volume_ml)}
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

      <OrderAuditTimeline orderId={id} />
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  a_preparer: "À préparer",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée",
};

function describeEntry(e: OrderAuditEntry): { title: string; detail?: string } {
  const from = e.from_status ? STATUS_LABELS[e.from_status] ?? e.from_status : null;
  const to = e.to_status ? STATUS_LABELS[e.to_status] ?? e.to_status : null;
  switch (e.action) {
    case "order.manual_status_change":
      return {
        title: `Changement manuel de statut${from && to ? ` : ${from} → ${to}` : to ? ` → ${to}` : ""}`,
        detail: "Modification manuelle (aucun email envoyé au client).",
      };
    case "order.deliver":
      return { title: `Commande marquée « Livrée »${from ? ` (depuis ${from})` : ""}` };
    case "order.cancel":
      return {
        title: `Commande annulée${from ? ` (depuis ${from})` : ""}`,
        detail: e.reason ? `Motif : ${e.reason}` : undefined,
      };
    case "order.refund":
      return {
        title:
          e.refund_processed === true
            ? "Remboursement marqué comme traité"
            : e.refund_processed === false
              ? "Remboursement marqué comme non traité"
              : "Statut de remboursement mis à jour",
      };
    case "order.update":
    default:
      if (from && to && from !== to) {
        return {
          title: `Statut : ${from} → ${to}`,
          detail: e.tracking_number ? `Suivi : ${e.tracking_number}` : undefined,
        };
      }
      return {
        title: e.tracking_number
          ? `Suivi mis à jour : ${e.tracking_number}`
          : "Commande mise à jour",
      };
  }
}

function OrderAuditTimeline({ orderId }: { orderId: string }) {
  const { data } = useSuspenseQuery(auditOpts(orderId));
  const [selected, setSelected] = useState<OrderAuditEntry | null>(null);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Journal d'activité</h2>
      {data.length === 0 ? (
        <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
          Aucune action enregistrée sur cette commande.
        </p>
      ) : (
        <ol className="space-y-3">
          {data.map((e) => {
            const d = describeEntry(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelected(e)}
                  className="w-full rounded-md border bg-card p-3 text-left text-sm transition hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Par {e.admin_label}
                  </div>
                  {d.detail ? (
                    <div className="mt-1 text-xs text-muted-foreground">{d.detail}</div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <AuditEntryDialog entry={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "order.update": "Mise à jour",
  "order.deliver": "Livraison confirmée",
  "order.cancel": "Annulation",
  "order.refund": "Statut de remboursement",
  "order.manual_status_change": "Changement manuel de statut",
};

function AuditEntryDialog({
  entry,
  onClose,
}: {
  entry: OrderAuditEntry | null;
  onClose: () => void;
}) {
  const open = entry !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        {entry ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {ACTION_LABELS[entry.action] ?? entry.action}
              </DialogTitle>
              <DialogDescription>
                {new Date(entry.created_at).toLocaleString("fr-FR")}
              </DialogDescription>
            </DialogHeader>
            <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <Row label="Auteur" value={entry.admin_label} />
              <Row
                label="Ancien statut"
                value={
                  entry.from_status
                    ? STATUS_LABELS[entry.from_status] ?? entry.from_status
                    : "—"
                }
              />
              <Row
                label="Nouveau statut"
                value={
                  entry.to_status
                    ? STATUS_LABELS[entry.to_status] ?? entry.to_status
                    : "—"
                }
              />
              <Row label="N° de suivi" value={entry.tracking_number ?? "—"} />
              <Row label="Motif" value={entry.reason ?? "—"} multiline />
              {entry.action === "order.refund" ? (
                <Row
                  label="Remboursement"
                  value={
                    entry.refund_processed === true
                      ? "Marqué comme traité"
                      : entry.refund_processed === false
                        ? "Marqué comme non traité"
                        : "—"
                  }
                />
              ) : null}
              <Row label="Identifiant" value={entry.id} mono />
              <Row label="Action" value={entry.action} mono />
            </dl>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          (mono ? "font-mono text-xs " : "") +
          (multiline ? "whitespace-pre-wrap " : "break-words ") +
          "text-foreground"
        }
      >
        {value}
      </dd>
    </>
  );
}
