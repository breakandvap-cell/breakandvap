import { Link } from "@tanstack/react-router";
import { ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { isAdmin as isAdminFn } from "@/lib/admin.functions";

export function SiteHeader() {
  return (
    <>
      <div className="w-full border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs uppercase tracking-wide">
          Vente réservée aux adultes de 18 ans et plus
        </div>
      </div>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Link to="/" className="flex items-baseline gap-2">
            <span
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Break <span style={{ color: "var(--accent)" }}>&amp;</span> Vap
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              — depuis 2018
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link
              to="/boutique"
              activeProps={{ className: "text-foreground font-medium" }}
              className="transition-colors hover:text-foreground"
            >
              Boutique
            </Link>
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-foreground font-medium" }}
              className="transition-colors hover:text-foreground"
            >
              Accueil
            </Link>
            <CartLink />
            <AccountLink />
            <AdminLink />
          </nav>
        </div>
      </header>
    </>
  );
}

function CartLink() {
  const { count, hydrated } = useCart();
  return (
    <Link
      to="/panier"
      activeProps={{ className: "text-foreground font-medium" }}
      className="relative inline-flex items-center gap-1 transition-colors hover:text-foreground"
      aria-label="Voir le panier"
    >
      <ShoppingBag className="h-4 w-4" />
      <span className="hidden sm:inline">Panier</span>
      {hydrated && count > 0 ? (
        <span
          className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-foreground)",
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function AccountLink() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Link
      to={user ? "/compte" : "/auth"}
      activeProps={{ className: "text-foreground font-medium" }}
      className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      aria-label={user ? "Mon compte" : "Se connecter"}
    >
      <User className="h-4 w-4" />
      <span className="hidden sm:inline">{user ? "Compte" : "Connexion"}</span>
    </Link>
  );
}

function AdminLink() {
  const { user, loading } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin", "self-check", user?.id ?? "none"],
    queryFn: () => isAdminFn(),
    enabled: !loading && !!user,
    staleTime: 60_000,
  });
  if (!user || !data?.isAdmin) return null;
  return (
    <Link
      to="/admin"
      activeProps={{ className: "text-foreground font-medium" }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs uppercase tracking-wide transition-colors hover:text-foreground"
    >
      Admin
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} SAS Break and Vap. La nicotine crée une forte
        dépendance. Vente strictement interdite aux mineurs.
      </div>
    </footer>
  );
}