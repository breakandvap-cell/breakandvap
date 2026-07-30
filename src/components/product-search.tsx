import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, productsQueryOptions } from "@/lib/products";
import { matchesSearch } from "@/lib/product-search";

const MAX_RESULTS = 8;

export function ProductSearch({
  className,
  autoFocus,
  onNavigate,
}: {
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: products } = useQuery(productsQueryOptions());

  const trimmed = query.trim();
  const results = useMemo(() => {
    if (trimmed.length < 2) return [];
    return (products ?? []).filter((p) => matchesSearch(p, trimmed));
  }, [products, trimmed]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const submit = () => {
    if (!trimmed) return;
    setOpen(false);
    onNavigate?.();
    navigate({
      to: "/boutique",
      search: {
        categorie: "",
        sous_categorie: "",
        tout: true,
        q: trimmed,
        marques: [],
        gammes: [],
        gouts: [],
        volumes: [],
        en_stock: false,
        prix_min: 0,
        prix_max: 0,
        tri: "pertinence",
      },
    });
  };

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-2 focus-within:border-accent/60">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Rechercher un produit, une marque, un goût…"
          aria-label="Rechercher dans le catalogue"
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
              Aucun produit ne correspond à votre recherche.
            </p>
          ) : (
            <>
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                {results.slice(0, MAX_RESULTS).map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/produit/$slug"
                      params={{ slug: p.slug }}
                      onClick={() => {
                        setOpen(false);
                        onNavigate?.();
                      }}
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
              <button
                type="button"
                onClick={submit}
                className="w-full border-t border-border p-3 text-center text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              >
                Voir les {results.length} résultats dans la boutique →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}