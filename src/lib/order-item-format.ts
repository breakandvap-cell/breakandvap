// Helpers partagés pour l'affichage détaillé des lignes de commande /
// factures (page admin + PDF).

import { formatNicotineMg } from "@/lib/site-settings.functions";

export type OrderLineLike = {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  volume_ml?: number | null;
  nicotine_mg?: number | null;
  flavor?: string | null;
  boosters_count?: number | null;
};

// Référence produit courte : lettres/chiffres du nom (sans accents), + volume.
// Ex. "Ice Berg" 50 ml → "ICEBERG50".
export function productRef(name: string, volumeMl?: number | null): string {
  const base = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  const suffix = volumeMl ? String(volumeMl) : "";
  return (base + suffix).slice(0, 16) || "PROD";
}

// Description longue : "Nom — 50 ml — 9 mg — goût (+3 boost)".
// Les segments déjà présents dans le nom sont ignorés pour éviter les doublons.
export function itemDescription(item: OrderLineLike): string {
  const name = item.product_name ?? "";
  const lower = name.toLowerCase();
  const parts: string[] = [name];
  if (item.volume_ml && !lower.includes(`${item.volume_ml} ml`)) {
    parts.push(`${item.volume_ml} ml`);
  }
  if (item.nicotine_mg != null) {
    parts.push(formatNicotineMg(item.nicotine_mg));
  }
  if (item.flavor) {
    parts.push(item.flavor);
  }
  let out = parts.filter(Boolean).join(" — ");
  if (item.boosters_count && item.boosters_count > 0) {
    out += ` (+${item.boosters_count} boost${item.boosters_count > 1 ? "s" : ""})`;
  }
  return out;
}

// Décomposition HT / TVA / TTC à partir d'un prix unitaire TTC et d'une qté.
// Le prix stocké en base est TTC.
export function lineTaxBreakdown(
  unitTtcCents: number,
  quantity: number,
  ratePct: number,
): { ht: number; tva: number; ttc: number } {
  const ttc = unitTtcCents * quantity;
  const ht = Math.round(ttc / (1 + ratePct / 100));
  const tva = ttc - ht;
  return { ht, tva, ttc };
}

export function sumBreakdowns(
  items: OrderLineLike[],
  ratePct: number,
): { ht: number; tva: number; ttc: number } {
  return items.reduce(
    (acc, it) => {
      const b = lineTaxBreakdown(it.unit_price_cents, it.quantity, ratePct);
      return { ht: acc.ht + b.ht, tva: acc.tva + b.tva, ttc: acc.ttc + b.ttc };
    },
    { ht: 0, tva: 0, ttc: 0 },
  );
}