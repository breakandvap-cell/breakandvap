import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { getInvoiceDownloadUrl } from "@/lib/invoices.functions";

export function InvoiceDownloadButton({
  orderId,
  className,
  label = "Télécharger la facture (PDF)",
}: {
  orderId: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const fetchUrl = useServerFn(getInvoiceDownloadUrl);

  const onClick = async () => {
    setBusy(true);
    try {
      const { url, number } = await fetchUrl({ data: { orderId } });
      // Utilise un <a download> plutôt que window.open : évite le blocage
      // pop-up déclenché quand l'ouverture arrive après un await (Chrome/Safari).
      const a = document.createElement("a");
      a.href = url;
      a.download = `${number}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error("Facture indisponible", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-60"
      }
    >
      <FileDown className="h-4 w-4" />
      {busy ? "Préparation…" : label}
    </button>
  );
}
