import { useEffect, useState } from "react";
import { formatNicotineMg } from "@/lib/site-settings.functions";
import { productRef } from "@/lib/order-item-format";

export type PickingItem = {
  id: string;
  product_name: string;
  quantity: number;
  volume_ml?: number | null;
  nicotine_mg?: number | null;
  flavor?: string | null;
  boosters_count?: number | null;
  variant_sku?: string | null;
  photo_url?: string | null;
};

const storageKey = (orderId: string) => `bnv_picking_${orderId}`;

function readState(orderId: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(orderId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Liste de picking : une ligne par article, pensée pour la préparation
 * physique du colis. L'état des cases est propre à chaque commande et
 * conservé localement (survit au rafraîchissement de la page).
 */
export function OrderPickingList({
  orderId,
  items,
}: {
  orderId: string;
  items: PickingItem[];
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setChecked(readState(orderId));
    setHydrated(true);
  }, [orderId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey(orderId), JSON.stringify(checked));
    } catch {
      /* quota / mode privé : la progression reste en mémoire */
    }
  }, [checked, hydrated, orderId]);

  const done = items.filter((i) => checked[i.id]).length;
  const allDone = items.length > 0 && done === items.length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Préparation du colis</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {done} / {items.length} préparé{done > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setChecked({})}
            className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {allDone ? (
        <div className="mb-3 rounded-md border border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✅ Commande prête à expédier — tous les articles ont été préparés.
        </div>
      ) : (
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${items.length ? (done / items.length) * 100 : 0}%`,
            }}
          />
        </div>
      )}

      <ul className="space-y-2">
        {items.map((it) => {
          const isDone = Boolean(checked[it.id]);
          const ref = (it.variant_sku ?? "") || productRef(it.product_name, it.volume_ml);
          const specs = [
            it.volume_ml ? `${it.volume_ml} ml` : null,
            it.nicotine_mg != null ? formatNicotineMg(it.nicotine_mg) : null,
            it.flavor || null,
            it.boosters_count && it.boosters_count > 0
              ? `+${it.boosters_count} booster${it.boosters_count > 1 ? "s" : ""}`
              : null,
          ].filter(Boolean) as string[];
          return (
            <li key={it.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors sm:gap-4 ${
                  isDone ? "border-emerald-500 bg-emerald-50/60" : "bg-card hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [it.id]: e.target.checked }))
                  }
                  className="h-6 w-6 shrink-0 accent-emerald-600"
                  aria-label={`Marquer ${it.product_name} comme préparé`}
                />
                {it.photo_url ? (
                  <img
                    src={it.photo_url}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
                    Photo
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-base font-semibold ${
                      isDone ? "line-through opacity-70" : ""
                    }`}
                  >
                    {it.product_name}
                  </p>
                  {specs.length > 0 && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {specs.join(" · ")}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Réf. {ref}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xl font-bold tabular-nums sm:text-2xl ${
                    isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  ×{it.quantity}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}