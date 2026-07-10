import { createFileRoute, Link } from "@tanstack/react-router";
import { Store, Truck, Leaf } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="home-ambient relative min-h-screen overflow-hidden text-foreground">
      {/* Ambient premium background layers — decorative, aria-hidden */}
      <div aria-hidden className="home-ambient__bg" />
      <div aria-hidden className="home-ambient__grain" />
      <div aria-hidden className="home-ambient__halo home-ambient__halo--1" />
      <div aria-hidden className="home-ambient__halo home-ambient__halo--2" />
      <div aria-hidden className="home-ambient__halo home-ambient__halo--3" />
      <div aria-hidden className="home-ambient__smoke home-ambient__smoke--a" />
      <div aria-hidden className="home-ambient__smoke home-ambient__smoke--b" />
      <div aria-hidden className="home-ambient__vignette" />

      <div className="relative z-10">
      <SiteHeader />

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

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/boutique"
              className="home-cta-primary inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Découvrir le catalogue
            </Link>
            <Link
              to="/boutique"
              search={{ categorie: "cbd" }}
              className="home-cta-secondary inline-flex items-center justify-center rounded-md border border-border bg-card/70 px-5 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
            >
              Voir les produits CBD
            </Link>
          </div>

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
            Étapes 1 à 3/7 livrées : fondations, vérification d'âge, catalogue
            et fiches produits. Panier, compte client et espace admin arrivent
            aux prochaines étapes.
          </p>
        </div>
      </section>

      <SiteFooter />
      </div>
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
    <div className="home-feature-card rounded-lg border border-border bg-card/70 p-5 backdrop-blur-sm">
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