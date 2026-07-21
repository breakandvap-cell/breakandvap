import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { adminTechnicalReferences } from "@/lib/admin.functions";
import {
  siteSettingsQueryOptions,
  adminUpdateDefaultBooster,
} from "@/lib/site-settings.functions";
import { boosterTypeLabel, formatPrice } from "@/lib/products";
import { computeProductStatus, StatusBadge } from "@/lib/product-status";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Package, RefreshCw } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/admin/references-techniques",
)({
  ssr: false,
  component: TechnicalReferencesPage,
});

type TabKey = "boosters" | "bottles";

type BoosterRow = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  is_published: boolean;
  stock: number;
  stock_status: string;
  booster_type: string | null;
  volume_ml: number | null;
  updated_at: string;
  used_by: Array<{ id: string; name: string; slug: string }>;
  is_protected: boolean;
};

const BOOSTER_ROLES = [
  { type: "normale" as const, label: "Booster classique (Normal)" },
  { type: "sel" as const, label: "Booster Sel de nicotine" },
  { type: "ice" as const, label: "Booster Ice" },
];

function TechnicalReferencesPage() {
  const fn = useServerFn(adminTechnicalReferences);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "technical-references"],
    queryFn: () => fn(),
    retry: false,
  });
  const { data: cfg } = useQuery(siteSettingsQueryOptions());
  const [tab, setTab] = useState<TabKey>("boosters");
  const [replaceRole, setReplaceRole] = useState<
    null | { type: "normale" | "sel" | "ice"; label: string }
  >(null);

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

  const boostersByType = new Map<string, BoosterRow[]>();
  for (const b of data.boosters as BoosterRow[]) {
    const t = ((b.booster_type ?? "normale").toString().trim().toLowerCase()) || "normale";
    (boostersByType.get(t) ?? boostersByType.set(t, []).get(t)!).push(b);
  }
  const currentByType: Record<string, string | null> = {
    normale: cfg?.defaultBoosterNormaleId ?? null,
    sel: cfg?.defaultBoosterSelId ?? null,
    ice: cfg?.defaultBoosterIceId ?? null,
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "technical-references"] });
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Références techniques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Boosters de nicotine et flacons vides utilisés par toutes les fiches
          e-liquides. Un seul produit officiel par rôle, appliqué globalement.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === "boosters"} onClick={() => setTab("boosters")}>
          Boosters nicotine
        </TabButton>
        <TabButton active={tab === "bottles"} onClick={() => setTab("bottles")}>
          Flacons vides ({data.bottles.length})
        </TabButton>
      </div>

      {tab === "boosters" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {BOOSTER_ROLES.map((role) => {
            const candidates = boostersByType.get(role.type) ?? [];
            const currentId = currentByType[role.type];
            const resolved =
              (currentId && candidates.find((c) => c.id === currentId)) ||
              candidates.find((c) => c.is_published) ||
              candidates[0] ||
              null;
            return (
              <BoosterRoleCard
                key={role.type}
                role={role}
                product={resolved}
                isExplicit={Boolean(currentId && resolved && resolved.id === currentId)}
                candidates={candidates}
                onReplace={() => setReplaceRole(role)}
              />
            );
          })}
        </div>
      ) : (
        <BottlesTable rows={data.bottles as BoosterRow[]} />
      )}

      {replaceRole && (
        <ReplaceBoosterDialog
          role={replaceRole}
          candidates={boostersByType.get(replaceRole.type) ?? []}
          currentId={currentByType[replaceRole.type] ?? null}
          onClose={() => setReplaceRole(null)}
          onDone={() => {
            setReplaceRole(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function BoosterRoleCard({
  role,
  product,
  isExplicit,
  candidates,
  onReplace,
}: {
  role: { type: string; label: string };
  product: BoosterRow | null;
  isExplicit: boolean;
  candidates: BoosterRow[];
  onReplace: () => void;
}) {
  if (!product) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {role.label}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Aucun produit défini pour ce rôle.
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Crée d'abord un produit « Accessoire Vape » marqué comme booster de
          nicotine de type « {role.type} », puis reviens ici pour le désigner
          comme référence globale.
        </p>
      </div>
    );
  }
  const status = computeProductStatus({
    is_published: product.is_published,
    name: product.name,
    slug: product.slug,
    photos: product.photo ? [product.photo] : [],
    price_cents: 1,
    isProtected: product.is_protected,
  });
  return (
    <div className="rounded-md border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {role.label}
          </div>
          <Link
            to="/admin/produits/$id"
            params={{ id: product.id }}
            className="mt-1 flex items-center gap-2 font-medium hover:underline"
          >
            {product.photo ? (
              <img
                src={product.photo}
                alt=""
                loading="lazy"
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Package className="h-4 w-4" />
              </span>
            )}
            <span className="truncate">{product.name}</span>
          </Link>
        </div>
        <StatusBadge status={status} />
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Stock</dt>
        <dd className="text-right font-medium">
          {product.stock}{" "}
          {product.stock_status === "out_of_stock" ? (
            <span className="text-destructive">(épuisé)</span>
          ) : product.stock_status === "low_stock" ? (
            <span className="text-amber-500">(faible)</span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">E-liquides dépendants</dt>
        <dd className="text-right font-medium">
          {product.used_by.length}
        </dd>
      </dl>
      {!isExplicit && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          Repli automatique (aucune référence explicite définie). Confirme la
          sélection via « Remplacer ».
        </p>
      )}
      <button
        type="button"
        onClick={onReplace}
        disabled={candidates.length === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Remplacer cette référence
      </button>
    </div>
  );
}

function ReplaceBoosterDialog({
  role,
  candidates,
  currentId,
  onClose,
  onDone,
}: {
  role: { type: "normale" | "sel" | "ice"; label: string };
  candidates: BoosterRow[];
  currentId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const fn = useServerFn(adminUpdateDefaultBooster);
  const [selected, setSelected] = useState<string | null>(currentId);
  const [busy, setBusy] = useState(false);
  const impacted = useMemo(() => {
    const cur = candidates.find((c) => c.id === currentId);
    return cur?.used_by.length ?? 0;
  }, [candidates, currentId]);
  const submit = async () => {
    if (!selected || selected === currentId) return;
    setBusy(true);
    try {
      await fn({ data: { booster_type: role.type, product_id: selected } });
      toast.success("Référence mise à jour.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remplacer « {role.label} »</DialogTitle>
          <DialogDescription>
            {impacted > 0 ? (
              <span className="text-amber-500">
                Attention : {impacted} e-liquide
                {impacted > 1 ? "s" : ""} utilise{impacted > 1 ? "nt" : ""}{" "}
                actuellement ce booster comme référence de prix. Le changement
                s'appliquera à toutes les futures commandes.
              </span>
            ) : (
              <>Choisis le produit officiel qui joue ce rôle.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun produit disponible. Crée d'abord un booster de type «{" "}
              {role.type} ».
            </p>
          ) : (
            candidates.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-3 rounded-md border p-2 text-sm cursor-pointer ${
                  selected === c.id
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:bg-secondary/40"
                }`}
              >
                <input
                  type="radio"
                  name="booster-candidate"
                  checked={selected === c.id}
                  onChange={() => setSelected(c.id)}
                />
                {c.photo ? (
                  <img
                    src={c.photo}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                    <Package className="h-3 w-3" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {boosterTypeLabel(c.booster_type)} · stock {c.stock}
                    {!c.is_published && " · brouillon"}
                  </div>
                </div>
                {c.id === currentId && (
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                    Actuel
                  </span>
                )}
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !selected || selected === currentId}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Confirmer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BottlesTable({ rows }: { rows: BoosterRow[] }) {
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Le site sélectionne automatiquement, dans cette liste, le flacon vide
        le plus adapté selon le volume manquant à combler au moment de
        l'ajout au panier. Aucune association manuelle par e-liquide n'est
        nécessaire — publie simplement les flacons vides que tu vends.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Produit</th>
              <th className="px-3 py-2">Contenance</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Stock</th>
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
                  <td className="px-3 py-2">
                    {r.volume_ml ? `${r.volume_ml} ml` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-3 py-2">{r.stock}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Aucun flacon vide publié dans le catalogue.
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