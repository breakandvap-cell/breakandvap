import type { ReactNode } from "react";

export type ProductStatus = "draft" | "ready" | "published" | "protected";

export type ProductStatusInput = {
  is_published: boolean;
  name?: string | null;
  slug?: string | null;
  price_cents?: number | null;
  photos?: string[] | null;
  category?: string | null;
  isProtected?: boolean;
  hasVariantsCoveringPrice?: boolean;
};

/** Détermine le statut affiché pour un produit.
 *  « Référence protégée » écrase les autres statuts : c'est le signal le plus
 *  important pour l'admin (ce produit est utilisé par un e-liquide). */
export function computeProductStatus(p: ProductStatusInput): ProductStatus {
  if (p.isProtected) return "protected";
  if (p.is_published) return "published";
  const hasPhoto = Array.isArray(p.photos) && p.photos.length > 0;
  const hasName = Boolean((p.name ?? "").trim());
  const hasSlug = Boolean((p.slug ?? "").trim());
  const hasPrice = (p.price_cents ?? 0) > 0 || Boolean(p.hasVariantsCoveringPrice);
  const complete = hasName && hasSlug && hasPrice && hasPhoto;
  return complete ? "ready" : "draft";
}

export const STATUS_META: Record<
  ProductStatus,
  { label: string; className: string; description: string }
> = {
  draft: {
    label: "Brouillon",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-200",
    description: "Fiche incomplète — non visible en boutique.",
  },
  ready: {
    label: "Prêt à publier",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-200",
    description: "Fiche complète, en attente de publication.",
  },
  published: {
    label: "Publié",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    description: "Visible en boutique.",
  },
  protected: {
    label: "Référence protégée",
    className:
      "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
    description:
      "Utilisé comme booster ou flacon vide par au moins un e-liquide actif.",
  },
};

export function StatusBadge({
  status,
  className = "",
  children,
}: {
  status: ProductStatus;
  className?: string;
  children?: ReactNode;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      title={meta.description}
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium " +
        meta.className +
        (className ? " " + className : "")
      }
    >
      {meta.label}
      {children}
    </span>
  );
}