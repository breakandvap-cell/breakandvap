import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Store, Truck, Leaf } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="w-full border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-xs uppercase tracking-wide">
          <ShieldCheck className="h-3.5 w-3.5" />
          Vente réservée aux adultes de 18 ans et plus
        </div>
      </div>

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <div className="flex items-baseline gap-2">
            <span
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Break <span style={{ color: "var(--accent)" }}>&amp;</span> Vap
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              — depuis 2018
            </span>
          </div>
          <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
            <span>Boutique</span>
            <span>Nos magasins</span>
            <span>À propos</span>
            <span>Contact</span>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            SAS Break and Vap · Le Creusot · Montceau-les-Mines
          </p>
          <h1 className="text-4xl leading-tight sm:text-6xl">
            L'expertise de nos boutiques,{" "}
            <span style={{ color: "var(--accent)" }}>en ligne.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            E-liquides, produits CBD et accessoires de vape sélectionnés par
            nos équipes depuis plus de cinq ans. Commande en ligne le matin,
            colis déposé à La Poste le soir.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Feature
              icon={<Leaf className="h-4 w-4" />}
              title="CBD & e-liquides"
              text="Fiches conformes, taux affichés, avertissements sanitaires."
            />
            <Feature
              icon={<Truck className="h-4 w-4" />}
              title="Expédition rapide"
              text="Commandes préparées et postées dans la journée."
            />
            <Feature
              icon={<Store className="h-4 w-4" />}
              title="Boutiques physiques"
              text="Deux points de vente en Bourgogne depuis 2018."
            />
          </div>

          <p className="mt-12 text-xs text-muted-foreground">
            Fondations techniques posées (Étape 1/7) — vérification d'âge,
            catalogue, panier, compte client et espace admin arrivent aux
            prochaines étapes.
          </p>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} SAS Break and Vap. La nicotine crée
          une forte dépendance. Vente strictement interdite aux mineurs.
        </div>
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div
        className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)", color: "var(--accent)" }}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}