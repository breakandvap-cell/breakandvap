import { parseFlavors, type ProductRow } from "@/lib/products";

/** Minuscules + suppression des accents, pour une recherche tolérante. */
export function normalizeText(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function productFlavorNames(p: ProductRow): string[] {
  return parseFlavors(p.flavors)
    .filter((f) => f.is_active)
    .map((f) => f.name);
}

/** Texte indexé d'un produit : nom, marque, gamme, goûts, sous-catégorie. */
export function productSearchHaystack(p: ProductRow): string {
  return normalizeText(
    [p.name, p.brand, p.product_range, p.subcategory, ...productFlavorNames(p)]
      .filter(Boolean)
      .join(" "),
  );
}

/** Tous les mots de la requête doivent être présents (ET logique). */
export function matchesSearch(p: ProductRow, query: string): boolean {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = productSearchHaystack(p);
  return terms.every((t) => hay.includes(t));
}

export type ShopFilters = {
  q: string;
  marques: string[];
  gammes: string[];
  gouts: string[];
  volumes: number[];
  en_stock: boolean;
  prix_min: number | null;
  prix_max: number | null;
};

export const EMPTY_FILTERS: ShopFilters = {
  q: "",
  marques: [],
  gammes: [],
  gouts: [],
  volumes: [],
  en_stock: false,
  prix_min: null,
  prix_max: null,
};

export function hasActiveFilters(f: ShopFilters): boolean {
  return (
    f.q.trim().length > 0 ||
    f.marques.length > 0 ||
    f.gammes.length > 0 ||
    f.gouts.length > 0 ||
    f.volumes.length > 0 ||
    f.en_stock ||
    f.prix_min != null ||
    f.prix_max != null
  );
}

/** Volumes disponibles pour un produit (contenance propre + variantes). */
export function productVolumes(
  p: ProductRow,
  variantVolumes: Record<string, number[]>,
): number[] {
  const out = new Set<number>();
  if (typeof p.volume_ml === "number" && p.volume_ml > 0) out.add(p.volume_ml);
  for (const v of variantVolumes[p.id] ?? []) if (v > 0) out.add(v);
  return [...out].sort((a, b) => a - b);
}

export function applyShopFilters(
  products: ProductRow[],
  filters: ShopFilters,
  variantVolumes: Record<string, number[]> = {},
): ProductRow[] {
  const marques = new Set(filters.marques.map(normalizeText));
  const gammes = new Set(filters.gammes.map(normalizeText));
  const gouts = new Set(filters.gouts.map(normalizeText));
  const volumes = new Set(filters.volumes);

  return products.filter((p) => {
    if (!p.is_published) return false;
    if (!matchesSearch(p, filters.q)) return false;
    if (marques.size > 0 && !marques.has(normalizeText(p.brand))) return false;
    if (gammes.size > 0 && !gammes.has(normalizeText(p.product_range)))
      return false;
    if (gouts.size > 0) {
      const names = productFlavorNames(p).map(normalizeText);
      if (!names.some((n) => gouts.has(n))) return false;
    }
    if (volumes.size > 0) {
      const vols = productVolumes(p, variantVolumes);
      if (!vols.some((v) => volumes.has(v))) return false;
    }
    if (filters.en_stock && p.stock_status === "out_of_stock") return false;
    if (filters.prix_min != null && p.price_cents < filters.prix_min) return false;
    if (filters.prix_max != null && p.price_cents > filters.prix_max) return false;
    return true;
  });
}

export type Facets = {
  brands: string[];
  ranges: string[];
  flavors: string[];
  volumes: number[];
  minPriceCents: number;
  maxPriceCents: number;
};

/** Valeurs réellement présentes dans le sous-catalogue affiché. */
export function buildFacets(
  products: ProductRow[],
  variantVolumes: Record<string, number[]> = {},
): Facets {
  const brands = new Map<string, string>();
  const ranges = new Map<string, string>();
  const flavors = new Map<string, string>();
  const volumes = new Set<number>();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  for (const p of products) {
    const b = (p.brand ?? "").trim();
    if (b) brands.set(normalizeText(b), b);
    const r = (p.product_range ?? "").trim();
    if (r) ranges.set(normalizeText(r), r);
    for (const f of productFlavorNames(p)) {
      const name = f.trim();
      if (name) flavors.set(normalizeText(name), name);
    }
    for (const v of productVolumes(p, variantVolumes)) volumes.add(v);
    if (p.price_cents < min) min = p.price_cents;
    if (p.price_cents > max) max = p.price_cents;
  }

  const sortFr = (a: string, b: string) => a.localeCompare(b, "fr");
  return {
    brands: [...brands.values()].sort(sortFr),
    ranges: [...ranges.values()].sort(sortFr),
    flavors: [...flavors.values()].sort(sortFr),
    volumes: [...volumes].sort((a, b) => a - b),
    minPriceCents: Number.isFinite(min) ? min : 0,
    maxPriceCents: max,
  };
}