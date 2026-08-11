import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { formatNicotineMg } from "@/lib/site-settings.functions";
import { productRef } from "@/lib/order-item-format";
import { getPickingSheetPdf } from "@/lib/picking.functions";

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

/**
 * Liste de picking : une ligne par article, pensée pour la préparation
 * physique du colis. Affichage simple sans suivi d'état.
 */
export function OrderPickingList({
  orderId,
  items,
}: {
  orderId: string;
  items: PickingItem[];
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const fetchPdf = useServerFn(getPickingSheetPdf);

  const downloadSheet = async () => {
    setPdfBusy(true);
    try {
      const { filename, base64 } = await fetchPdf({ data: { orderId } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error("Fiche de picking indisponible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Préparation du colis</h2>
        <button
          type="button"
          onClick={downloadSheet}
          disabled={pdfBusy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary disabled:opacity-60"
        >
          <Printer className="h-3.5 w-3.5" />
          {pdfBusy ? "Préparation…" : "Fiche de picking (PDF)"}
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((it) => {
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
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 sm:gap-4"
            >
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
                <p className="truncate text-base font-semibold">
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
              <span className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xl font-bold tabular-nums text-primary sm:text-2xl">
                ×{it.quantity}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
