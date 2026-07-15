import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { isAdmin as isAdminFn } from "@/lib/admin.functions";
import logoAsset from "@/assets/logo-break-vap-cbd.png.asset.json";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="w-full border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-2 text-center text-[11px] uppercase tracking-wide sm:text-xs">
          Vente réservée aux adultes de 18 ans et plus
        </div>
      </div>
      <header className="border-b border-border bg-background/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:py-5">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Break & Vap CBD — Accueil">
            <img
              src={logoAsset.url}
              alt="Break & Vap CBD"
              className="h-10 w-auto shrink-0 sm:h-14"
              width={280}
              height={180}
            />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              depuis 2018
            </span>
          </Link>
          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link
              to="/boutique"
              activeProps={{ className: "nav-link nav-link--active" }}
              inactiveProps={{ className: "nav-link" }}
            >
              Boutique
            </Link>
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: "nav-link nav-link--active" }}
              inactiveProps={{ className: "nav-link" }}
            >
              Accueil
            </Link>
            <CartLink />
            <AccountLink />
            <AdminLink />
          </nav>
          {/* Mobile actions */}
          <div className="flex items-center gap-1 md:hidden">
            <CartLink compact />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Ouvrir le menu"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
                <SheetHeader className="border-b border-border p-5 text-left">
                  <SheetTitle className="text-base">Menu</SheetTitle>
                </SheetHeader>
                <MobileMenu onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}

function CartLink({ compact = false }: { compact?: boolean }) {
  const { count, hydrated } = useCart();
  return (
    <Link
      to="/panier"
      activeProps={{ className: "nav-link nav-link--active nav-link--icon" }}
      inactiveProps={{ className: "nav-link nav-link--icon" }}
      aria-label="Voir le panier"
      className={compact ? "relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" : undefined}
    >
      <ShoppingBag className="h-4 w-4" />
      {!compact && <span className="hidden sm:inline">Panier</span>}
      {hydrated && count > 0 ? (
        <span
          className={
            compact
              ? "absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
              : "ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
          }
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
      activeProps={{ className: "nav-link nav-link--active nav-link--icon" }}
      inactiveProps={{ className: "nav-link nav-link--icon" }}
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

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, loading } = useAuth();
  const { data: adminData } = useQuery({
    queryKey: ["admin", "self-check", user?.id ?? "none"],
    queryFn: () => isAdminFn(),
    enabled: !loading && !!user,
    staleTime: 60_000,
  });
  const isAdminUser = !!adminData?.isAdmin;

  const linkCls =
    "flex items-center gap-3 rounded-md px-3 py-3 text-base text-foreground hover:bg-secondary";

  return (
    <nav className="flex flex-col gap-1 p-3">
      <SheetClose asChild>
        <Link to="/" activeOptions={{ exact: true }} className={linkCls} onClick={onNavigate}>
          Accueil
        </Link>
      </SheetClose>
      <SheetClose asChild>
        <Link to="/boutique" className={linkCls} onClick={onNavigate}>
          Boutique
        </Link>
      </SheetClose>
      <SheetClose asChild>
        <Link to="/panier" className={linkCls} onClick={onNavigate}>
          <ShoppingBag className="h-4 w-4" /> Panier
        </Link>
      </SheetClose>
      <SheetClose asChild>
        <Link
          to={user ? "/compte" : "/auth"}
          className={linkCls}
          onClick={onNavigate}
        >
          <User className="h-4 w-4" /> {user ? "Mon compte" : "Connexion"}
        </Link>
      </SheetClose>
      {isAdminUser && (
        <SheetClose asChild>
          <Link to="/admin" className={linkCls} onClick={onNavigate}>
            Espace admin
          </Link>
        </SheetClose>
      )}
      <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        <div className="px-3 py-1">
          <SheetClose asChild>
            <Link to="/contact" className="hover:text-foreground" onClick={onNavigate}>
              Contact
            </Link>
          </SheetClose>
        </div>
        <div className="px-3 py-1">
          <SheetClose asChild>
            <Link to="/livraison-retours" className="hover:text-foreground" onClick={onNavigate}>
              Livraison & retours
            </Link>
          </SheetClose>
        </div>
        <div className="px-3 py-1">
          <SheetClose asChild>
            <Link to="/a-propos" className="hover:text-foreground" onClick={onNavigate}>
              À propos
            </Link>
          </SheetClose>
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3 text-sm">
          <div>
            <img
              src={logoAsset.url}
              alt="Break & Vap CBD"
              className="h-14 w-auto"
              width={280}
              height={180}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              CBD, e-liquides et accessoires de vape depuis 2018. Boutiques au
              Creusot et à Montceau-les-Mines.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Boutique
            </div>
            <ul className="mt-3 space-y-1 text-muted-foreground">
              <li><Link to="/boutique" className="hover:text-foreground">Catalogue</Link></li>
              <li><Link to="/livraison-retours" className="hover:text-foreground">Livraison & retours</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
              <li><Link to="/a-propos" className="hover:text-foreground">À propos</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Informations légales
            </div>
            <ul className="mt-3 space-y-1 text-muted-foreground">
              <li><Link to="/mentions-legales" className="hover:text-foreground">Mentions légales</Link></li>
              <li><Link to="/cgv" className="hover:text-foreground">CGV</Link></li>
              <li><Link to="/confidentialite" className="hover:text-foreground">Confidentialité</Link></li>
              <li><Link to="/cookies" className="hover:text-foreground">Cookies</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} SAS Break and Vap. La nicotine crée une
          forte dépendance. Vente strictement interdite aux mineurs.
        </div>
      </div>
    </footer>
  );
}