import { useState } from "react";
import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react";
import { formatPrice } from "@/lib/products";
import { SORT_OPTIONS, type SortValue } from "@/lib/product-search";
import type { Facets, ShopFilters } from "@/lib/product-search";

export function SortSelect({
  value,
  onChange,
  className,
}: {
  value: SortValue;
  onChange: (v: SortValue) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 ${className ?? ""}`}
    >
      <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      <label htmlFor="tri-catalogue" className="sr-only">
        Trier le catalogue
      </label>
      <select
        id="tri-catalogue"
        value={value}
        onChange={(e) => onChange(e.target.value as SortValue)}
        className="min-w-0 bg-transparent pr-1 text-base outline-none sm:text-sm"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-card">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type FilterPatch = Partial<ShopFilters>;

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function toggleNum(list: number[], value: number): number[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value].sort((a, b) => a - b);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function CheckList({
  values,
  selected,
  onToggle,
}: {
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? values : values.slice(0, 8);
  return (
    <div className="space-y-1.5">
      {shown.map((v) => (
        <label
          key={v}
          className="flex cursor-pointer items-center gap-2 text-sm text-foreground/90"
        >
          <input
            type="checkbox"
            checked={selected.includes(v)}
            onChange={() => onToggle(v)}
            className="h-4 w-4 shrink-0 rounded border-border accent-[var(--accent)]"
          />
          <span className="min-w-0 truncate">{v}</span>
        </label>
      ))}
      {values.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {expanded ? "Voir moins" : `Voir les ${values.length} valeurs`}
        </button>
      )}
    </div>
  );
}

export function FiltersPanelBody({
  facets,
  filters,
  onChange,
  onReset,
  resultCount,
}: {
  facets: Facets;
  filters: ShopFilters;
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
  resultCount: number;
}) {
  const priceMin = filters.prix_min ?? facets.minPriceCents;
  const priceMax = filters.prix_max ?? facets.maxPriceCents;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {resultCount} produit{resultCount > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-accent/60 hover:text-foreground"
        >
          Réinitialiser
        </button>
      </div>

      <Section title="Disponibilité">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.en_stock}
            onChange={(e) => onChange({ en_stock: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-[var(--accent)]"
          />
          En stock uniquement
        </label>
      </Section>

      {facets.brands.length > 0 && (
        <Section title="Marque">
          <CheckList
            values={facets.brands}
            selected={filters.marques}
            onToggle={(v) => onChange({ marques: toggle(filters.marques, v) })}
          />
        </Section>
      )}

      {facets.ranges.length > 0 && (
        <Section title="Gamme">
          <CheckList
            values={facets.ranges}
            selected={filters.gammes}
            onToggle={(v) => onChange({ gammes: toggle(filters.gammes, v) })}
          />
        </Section>
      )}

      {facets.flavors.length > 0 && (
        <Section title="Goût">
          <CheckList
            values={facets.flavors}
            selected={filters.gouts}
            onToggle={(v) => onChange({ gouts: toggle(filters.gouts, v) })}
          />
        </Section>
      )}

      {facets.volumes.length > 0 && (
        <Section title="Contenance">
          <div className="flex flex-wrap gap-1.5">
            {facets.volumes.map((v) => {
              const active = filters.volumes.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ volumes: toggleNum(filters.volumes, v) })}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v} ml
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {facets.maxPriceCents > facets.minPriceCents && (
        <Section title="Prix">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatPrice(priceMin)}</span>
              <span>{formatPrice(priceMax)}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                aria-label="Prix minimum"
                min={facets.minPriceCents}
                max={facets.maxPriceCents}
                step={100}
                value={priceMin}
                onChange={(e) =>
                  onChange({
                    prix_min: Math.min(Number(e.target.value), priceMax),
                  })
                }
                className="w-full accent-[var(--accent)]"
              />
              <input
                type="range"
                aria-label="Prix maximum"
                min={facets.minPriceCents}
                max={facets.maxPriceCents}
                step={100}
                value={priceMax}
                onChange={(e) =>
                  onChange({
                    prix_max: Math.max(Number(e.target.value), priceMin),
                  })
                }
                className="w-full accent-[var(--accent)]"
              />
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

export function ActiveFilterChips({
  filters,
  onChange,
  onReset,
}: {
  filters: ShopFilters;
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
}) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.q.trim())
    chips.push({
      key: "q",
      label: `« ${filters.q.trim()} »`,
      clear: () => onChange({ q: "" }),
    });
  for (const b of filters.marques)
    chips.push({
      key: `m-${b}`,
      label: b,
      clear: () => onChange({ marques: filters.marques.filter((x) => x !== b) }),
    });
  for (const g of filters.gammes)
    chips.push({
      key: `g-${g}`,
      label: g,
      clear: () => onChange({ gammes: filters.gammes.filter((x) => x !== g) }),
    });
  for (const f of filters.gouts)
    chips.push({
      key: `f-${f}`,
      label: f,
      clear: () => onChange({ gouts: filters.gouts.filter((x) => x !== f) }),
    });
  for (const v of filters.volumes)
    chips.push({
      key: `v-${v}`,
      label: `${v} ml`,
      clear: () => onChange({ volumes: filters.volumes.filter((x) => x !== v) }),
    });
  if (filters.en_stock)
    chips.push({
      key: "stock",
      label: "En stock",
      clear: () => onChange({ en_stock: false }),
    });
  if (filters.prix_min != null || filters.prix_max != null)
    chips.push({
      key: "prix",
      label: `Prix ${filters.prix_min != null ? formatPrice(filters.prix_min) : "—"} à ${
        filters.prix_max != null ? formatPrice(filters.prix_max) : "—"
      }`,
      clear: () => onChange({ prix_min: null, prix_max: null }),
    });

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-foreground hover:border-accent"
        >
          <span className="min-w-0 truncate">{c.label}</span>
          <X className="h-3 w-3 shrink-0" />
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Tout réinitialiser
      </button>
    </div>
  );
}

export function MobileFiltersToggle({
  open,
  onToggle,
  count,
}: {
  open: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm lg:hidden"
    >
      <span className="inline-flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        Filtres
        {count > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
            {count}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {open ? "Masquer" : "Afficher"}
      </span>
    </button>
  );
}