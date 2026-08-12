const STATUS: Record<string, { label: string; className: string }> = {
  a_preparer: {
    label: "En préparation",
    className: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  },
  expediee: {
    label: "Expédiée",
    className: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  },
  livree: {
    label: "Livrée",
    className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  },
  annulee: {
    label: "Annulée",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? {
    label: status,
    className: "bg-secondary text-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
