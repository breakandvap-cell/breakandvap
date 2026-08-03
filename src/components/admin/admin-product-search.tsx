import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice, type ProductRow } from "@/lib/products";

const MAX_RESULTS = 8;

/** Recherche floue côté base via la fonction SQL `search_products`. */
function useProductSearch(term: string) {
  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(t);
  }, [term]);

  return useQuery({
    queryKey: ["admin", "search_products", debounced] as const,
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_products", {
        search_term: debounced.trim(),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductRow[];
    },
  });
}

/**
 * Barre de recherche produits de l'espace admin.
 * Même rendu que la recherche boutique (miniature, nom, prix) mais les
 * suggestions ouvrent la fiche de modification admin du produit.
 */
export function AdminProductSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const trimmed = query.trim();
  const { data, isFetching } = useProductSearch(query);
  const results = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const editTarget = (p: ProductRow) =>
    p.category === "e_liquide"
      ? ({ to: "/admin/produits/eliquide/$id", params: { id: p.id } } as const)
      : ({ to: "/admin/produits/$id", params: { id: p.id } } as const);

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-2 focus-within:border-accent/60">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results[0]) {
              setOpen(false);
              navigate(editTarget(results[0]));
            }
          }}
          placeholder="Rechercher un produit…"
          aria-label="Rechercher un produit dans le catalogue admin"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {query && (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && trimmed.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {isFetching ? "Recherche…" : "Aucun produit ne correspond."}
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {results.slice(0, MAX_RESULTS).map((p) => (
                <li key={p.id}>
                  <Link
                    {...editTarget(p)}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-3 hover:bg-secondary/60"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                      {p.photos?.[0] && (
                        <img
                          src={p.photos[0]}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.brand, p.product_range].filter(Boolean).join(" · ") ||
                          "Catalogue"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatPrice(p.price_cents, p.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
