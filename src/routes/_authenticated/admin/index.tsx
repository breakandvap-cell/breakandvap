import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { adminDashboard } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/products";

const dashOptions = queryOptions({
  queryKey: ["admin", "dashboard"],
  queryFn: () => adminDashboard(),
});

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(dashOptions),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashOptions);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Commandes à préparer" value={data.counts.toPrepare} accent />
        <Stat label="Commandes expédiées" value={data.counts.shipped} />
        <Stat label="Produits au catalogue" value={data.counts.totalProducts} />
      </div>

      {data.boosterIssues && data.boosterIssues.length > 0 ? (
        <section className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <h2 className="text-sm font-semibold text-destructive">
            Boosters de nicotine indisponibles
          </h2>
          <p className="mt-1 text-xs text-destructive/90">
            Ces types de nicotine sont utilisés par des e-liquides publiés mais
            leur produit booster de référence n'est plus utilisable. Toute
            commande d'e-liquide avec ce type de boosters échouera tant que le
            problème n'est pas corrigé.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {data.boosterIssues.map((b) => (
              <li key={b.type + (b.product?.id ?? "none")} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                  {b.type}
                </span>
                {b.issue === "missing" ? (
                  <span>
                    Aucun produit marqué comme « Booster de nicotine » pour ce type.
                    Créez-en un (catégorie Accessoires Vape → coche « Booster de
                    nicotine » → type « {b.type} »).
                  </span>
                ) : b.issue === "unpublished" ? (
                  <>
                    <span>Le booster</span>
                    <Link
                      to="/admin/produits/$id"
                      params={{ id: b.product!.id }}
                      className="font-medium underline"
                    >
                      {b.product!.name}
                    </Link>
                    <span>n'est pas publié.</span>
                  </>
                ) : (
                  <>
                    <span>Le booster</span>
                    <Link
                      to="/admin/produits/$id"
                      params={{ id: b.product!.id }}
                      className="font-medium underline"
                    >
                      {b.product!.name}
                    </Link>
                    <span>est en rupture de stock — réapprovisionnez-le.</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Stock faible / rupture</h2>
          <Link to="/admin/produits" className="text-sm text-muted-foreground hover:text-foreground">
            Voir tous les produits →
          </Link>
        </div>
        {data.lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tous les stocks sont OK.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {data.lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link to="/admin/produits/$id" params={{ id: p.id }} className="hover:underline">
                  {p.name}
                </Link>
                <span
                  className={
                    p.stock_status === "out_of_stock"
                      ? "text-destructive font-medium"
                      : "text-amber-700"
                  }
                >
                  Stock: {p.stock} — {p.stock_status === "out_of_stock" ? "Rupture" : "Faible"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Dernières commandes</h2>
          <Link to="/admin/commandes" className="text-sm text-muted-foreground hover:text-foreground">
            Voir toutes les commandes →
          </Link>
        </div>
        {data.latestOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune commande pour l'instant.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {data.latestOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <Link to="/admin/commandes/$id" params={{ id: o.id }} className="font-medium hover:underline">
                    #{o.order_number}
                  </Link>
                  <span className="ml-3 text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={o.status} />
                  <span>{formatPrice(o.total_cents, o.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={"rounded-lg border p-4 " + (accent ? "bg-primary text-primary-foreground" : "bg-card")}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    a_preparer: { label: "À préparer", cls: "bg-amber-100 text-amber-800" },
    expediee: { label: "Expédiée", cls: "bg-blue-100 text-blue-800" },
    livree: { label: "Livrée", cls: "bg-green-100 text-green-800" },
    annulee: { label: "Annulée", cls: "bg-red-100 text-red-800" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
  return <span className={"inline-flex rounded px-2 py-0.5 text-xs font-medium " + s.cls}>{s.label}</span>;
}
