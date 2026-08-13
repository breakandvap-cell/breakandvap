import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { pendingRestockCountsQueryOptions } from "@/lib/stock-notifications";

/** Nombre de clients en attente d'un réapprovisionnement pour ce produit. */
export function RestockPendingBadge({ productId }: { productId: string | null }) {
  const { data } = useQuery(pendingRestockCountsQueryOptions(productId ? [productId] : []));
  const count = productId ? data?.[productId] ?? 0 : 0;
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-foreground">
      <Bell className="h-3.5 w-3.5" />
      {count} client{count > 1 ? "s" : ""} en attente de réapprovisionnement
    </span>
  );
}