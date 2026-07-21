import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminTechnicalReferences } from "@/lib/admin.functions";
import { boosterTypeLabel } from "@/lib/products";
import { computeProductStatus, StatusBadge } from "@/lib/product-status";
import { AlertTriangle, Loader2, Package } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/admin/references-techniques",
)({
  ssr: false,
  component: TechnicalReferencesPage,
});

type TabKey = "boosters" | "bottles";

function TechnicalReferencesPage() {
  const fn = useServerFn(adminTechnicalReferences);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "technical-references"],
    queryFn: () => fn(),
    retry: false,
  });
  const [tab, setTab] = useState<TabKey>("boosters");
  const [openList, setOpenList] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }
  if (!data) return null;

  const rows = tab === "boosters" ? data.boosters : data.bottles;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Références techniques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Boosters de nicotine et flacons vides utilisés par les fiches
          e-liquides. Ces produits sont protégés dès qu'ils sont référencés.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === "boosters"} onClick={() => setTab("boosters")}>
          Boosters nicotine ({data.boosters.length})
        </TabButton>
        <TabButton active={tab === "bottles"} onClick={() => setTab("bottles")}>
          Flacons vides ({data.bottles.length})
        </TabButton>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Produit</th>
              <th className="px-3 py-2">Rôle</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Utilisé par</th>
              <th className="px-3 py-2">Dernière modification</th>
              <th className="px-3 py-2">Alerte</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const status = computeProductStatus({
                is_published: r.is_published,
                name: r.name,
                slug: r.slug,
                photos: r.photo ? [r.photo] : [],
                price_cents: 1,
                isProtected: r.is_protected,
              });
              const alerts: string[] = [];
              if (r.stock_status === "out_of_stock") alerts.push("Épuisé");
              else if (r.stock_status === "low_stock") alerts.push("Stock faible");
              if (!r.is_published && r.is_protected)
                alerts.push("Dépublié alors qu'utilisé");
              if (!r.is_published && !r.is_protected) alerts.push("Brouillon");
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/produits/$id"
                      params={{ id: r.id }}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      {r.photo ? (
                        <img
                          src={r.photo}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </span>
                      )}
                      <span>{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {tab === "boosters"
                      ? `Booster ${boosterTypeLabel(
                          (r as { booster_type?: string | null }).booster_type,
                        )}`
                      : `Flacon vide${r.volume_ml ? ` · ${r.volume_ml} ml` : ""}`}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-3 py-2">
                    {r.used_by.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenList((cur) => (cur === r.id ? null : r.id))
                          }
                          className="text-primary hover:underline"
                        >
                          {r.used_by.length} e-liquide
                          {r.used_by.length > 1 ? "s" : ""}
                        </button>
                        {openList === r.id && (
                          <ul className="mt-2 space-y-1 text-xs">
                            {r.used_by.map((u) => (
                              <li key={u.id}>
                                <Link
                                  to="/admin/produits/$id"
                                  params={{ id: u.id }}
                                  className="hover:underline"
                                >
                                  · {u.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString("fr-FR", {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {alerts.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {alerts.map((a) => (
                          <span
                            key={a}
                            className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200"
                          >
                            <AlertTriangle className="h-3 w-3" /> {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Aucune référence dans cet onglet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "border-b-2 px-3 py-2 text-sm transition-colors " +
        (active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}