import { Link } from "@tanstack/react-router";

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
          <nav className="flex gap-6 text-sm text-muted-foreground">
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
          </nav>
        </div>
      </header>
    </>
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