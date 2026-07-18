import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { adminListInvoices, adminRegenerateInvoicePdf } from "@/lib/invoices.functions";
import { formatPrice } from "@/lib/products";
import { InvoiceDownloadButton } from "@/components/invoice-download-button";
import { z } from "zod";
import { useMemo, useState, type FormEvent } from "react";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const searchSchema = z.object({
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.enum(["mois", "trimestre", "annee", "personnalise"]).optional(),
});
type SearchParams = z.infer<typeof searchSchema>;

const invoicesOptions = (s: SearchParams) =>
  queryOptions({
    queryKey: ["admin", "invoices", s],
    queryFn: () =>
      adminListInvoices({
        data: { q: s.q ?? "", from: s.from ?? "", to: s.to ?? "" },
      }),
  });

export const Route = createFileRoute("/_authenticated/admin/factures")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(invoicesOptions(deps)),
  component: InvoicesPage,
});

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function computePeriod(kind: "mois" | "trimestre" | "annee"): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (kind === "mois") {
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
  if (kind === "trimestre") {
    const qStart = Math.floor(m / 3) * 3;
    return { from: iso(new Date(y, qStart, 1)), to: iso(new Date(y, qStart + 3, 0)) };
  }
  return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
}

type StatusKey = "a_preparer" | "expediee" | "livree" | "annulee";
const STATUS_LABEL: Record<StatusKey, string> = {
  a_preparer: "À préparer",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée",
};

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function centsToEuros(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",");
}

function InvoicesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(invoicesOptions(search));
  const regenFn = useServerFn(adminRegenerateInvoicePdf);
  const qc = useQueryClient();
  const [regenLoading, setRegenLoading] = useState(false);

  const [q, setQ] = useState(search.q ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");

  const regenerateMissing = async () => {
    setRegenLoading(true);
    try {
      const res = await regenFn({ data: { all: true } });
      const ok = res.results.filter((r) => r.ok).length;
      const ko = res.results.length - ok;
      toast.success(`PDFs générés : ${ok} · Échecs : ${ko}`);
      if (ko > 0) console.warn("[regen] failures", res.results.filter((r) => !r.ok));
      await qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRegenLoading(false);
    }
  };

  const totals = useMemo(() => {
    let ht = 0, tva = 0, ttc = 0;
    for (const inv of data) {
      ht += inv.subtotal_cents;
      tva += inv.tax_cents;
      ttc += inv.total_cents;
    }
    return { ht, tva, ttc };
  }, [data]);

  const applyPeriod = (kind: "mois" | "trimestre" | "annee") => {
    const { from: f, to: t } = computePeriod(kind);
    setFrom(f);
    setTo(t);
    navigate({
      to: "/admin/factures",
      search: { ...search, from: f, to: t, period: kind },
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate({
      to: "/admin/factures",
      search: {
        ...search,
        q: q || undefined,
        from: from || undefined,
        to: to || undefined,
        period: "personnalise",
      },
    });
  };

  const reset = () => {
    setQ("");
    setFrom("");
    setTo("");
    navigate({ to: "/admin/factures", search: {} });
  };

  const exportCsv = () => {
    const header = [
      "Numéro de facture",
      "Date",
      "Client",
      "Numéro de commande",
      "Statut commande",
      "Montant HT (€)",
      "Montant TVA (€)",
      "Montant TTC (€)",
      "Devise",
    ];
    const lines = [header.map(csvEscape).join(";")];
    for (const inv of data) {
      const buyerName =
        (inv.buyer as { full_name?: string } | null)?.full_name ?? "";
      const status = inv.orders?.status as StatusKey | undefined;
      lines.push(
        [
          inv.number,
          new Date(inv.issued_at).toLocaleDateString("fr-FR"),
          buyerName,
          inv.orders?.order_number ?? "",
          status ? STATUS_LABEL[status] : "",
          centsToEuros(inv.subtotal_cents),
          centsToEuros(inv.tax_cents),
          centsToEuros(inv.total_cents),
          inv.currency,
        ]
          .map(csvEscape)
          .join(";"),
      );
    }
    // BOM pour compatibilité Excel avec les accents
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const suffix =
      from && to ? `_${from}_${to}` : from ? `_depuis_${from}` : to ? `_jusqu_${to}` : "";
    a.href = url;
    a.download = `factures${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Factures</h1>
          <p className="text-sm text-muted-foreground">
            Suivi comptable de toutes les factures émises.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {data.length} facture(s) affichée(s)
        </span>
      </div>

      <div>
        <button
          type="button"
          onClick={regenerateMissing}
          disabled={regenLoading}
          data-testid="regen-missing-pdfs"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={"h-4 w-4 " + (regenLoading ? "animate-spin" : "")} />
          {regenLoading ? "Génération en cours…" : "Régénérer les PDF manquants"}
        </button>
      </div>

      {/* Totaux période */}
      <div className="grid gap-3 sm:grid-cols-3">
        <TotalCard label="Total hors taxes" value={formatPrice(totals.ht, "EUR")} />
        <TotalCard label="Total TVA" value={formatPrice(totals.tva, "EUR")} />
        <TotalCard
          label="Total toutes taxes comprises"
          value={formatPrice(totals.ttc, "EUR")}
          accent
        />
      </div>

      {/* Filtres période rapides */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Période :
        </span>
        {(
          [
            { k: "mois", label: "Ce mois-ci" },
            { k: "trimestre", label: "Ce trimestre" },
            { k: "annee", label: "Cette année" },
          ] as const
        ).map((p) => {
          const active = search.period === p.k;
          return (
            <button
              key={p.k}
              type="button"
              onClick={() => applyPeriod(p.k)}
              className={
                (active ? "bg-primary text-primary-foreground" : "bg-card border") +
                " rounded-md px-3 py-1.5 text-xs"
              }
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={reset}
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground"
        >
          Toutes les dates
        </button>
      </div>

      {/* Filtres personnalisés + recherche + export */}
      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 rounded-md border bg-card p-4 md:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <input
          type="search"
          placeholder="Rechercher par n° de facture ou nom de client…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          maxLength={160}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Du
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Au
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          Appliquer
        </button>
        <button
          type="button"
          onClick={exportCsv}
          disabled={data.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-600/50 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-300"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exporter en CSV
        </button>
      </form>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">N° facture</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Commande</th>
              <th className="px-3 py-2">Statut commande</th>
              <th className="px-3 py-2 text-right">Montant TTC</th>
              <th className="px-3 py-2 text-right">Facture</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((inv) => {
              const buyerName =
                (inv.buyer as { full_name?: string } | null)?.full_name ?? "—";
              const status = inv.orders?.status as StatusKey | undefined;
              return (
                <tr key={inv.id}>
                  <td className="px-3 py-2 font-medium">{inv.number}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(inv.issued_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-3 py-2">{buyerName}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    #{inv.orders?.order_number ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {status ? (
                      <span className="rounded-md border bg-secondary/40 px-2 py-1 text-xs">
                        {STATUS_LABEL[status]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatPrice(inv.total_cents, inv.currency)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <InvoiceDownloadButton orderId={inv.order_id} label="PDF" />
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Aucune facture pour cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Astuce : sélectionnez une période puis cliquez sur « Exporter en CSV » pour
        obtenir un fichier prêt à envoyer à votre comptable (numéro de facture, date,
        client, HT, TVA, TTC).
      </p>
    </div>
  );
}

function TotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border bg-card p-4 " +
        (accent ? "border-emerald-600/40 bg-emerald-600/5" : "")
      }
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 text-2xl font-semibold " + (accent ? "text-emerald-700 dark:text-emerald-300" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}