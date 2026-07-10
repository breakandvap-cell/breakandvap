import { createFileRoute, Link } from "@tanstack/react-router";
import { Store, Truck, Leaf, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getGoogleReviews } from "@/lib/google-reviews.functions";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="relative min-h-screen text-foreground">
      <div className="relative z-10">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 py-24 sm:py-32">
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

          <ReassuranceBar />

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

          <FeatureRow />

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

function FeatureRow() {
  const items = [
    {
      icon: <Leaf strokeWidth={1.25} className="h-7 w-7" />,
      title: "CBD & e-liquides",
      text: "Fiches conformes, taux affichés.",
    },
    {
      icon: <Truck strokeWidth={1.25} className="h-7 w-7" />,
      title: "Expédition rapide",
      text: "Postées dans la journée.",
    },
    {
      icon: <Store strokeWidth={1.25} className="h-7 w-7" />,
      title: "Boutiques physiques",
      text: "Le Creusot & Montceau, depuis 2018.",
    },
  ];
  return (
    <div className="mt-16 flex flex-col divide-y divide-border/60 sm:flex-row sm:divide-y-0 sm:divide-x">
      {items.map((it) => (
        <div
          key={it.title}
          className="flex flex-1 items-center gap-4 py-6 sm:flex-col sm:items-start sm:gap-3 sm:px-6 sm:py-2 sm:first:pl-0 sm:last:pr-0"
        >
          <span style={{ color: "var(--accent)" }} className="shrink-0">
            {it.icon}
          </span>
          <div>
            <div className="text-sm font-medium tracking-wide text-foreground">
              {it.title}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{it.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReassuranceBar() {
  const { data } = useQuery({
    queryKey: ["google-reviews"],
    queryFn: () => getGoogleReviews(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--accent)" }}
        />
        Boutiques physiques depuis 2018
      </span>
      {data?.rating != null && data.total > 0 ? (
        <>
          <span aria-hidden className="opacity-40">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Star
              className="h-3.5 w-3.5"
              style={{ color: "var(--accent)", fill: "var(--accent)" }}
            />
            <span className="font-medium text-foreground">
              {data.rating.toFixed(1)}/5
            </span>
            <span>
              sur {data.total} avis Google
            </span>
          </span>
        </>
      ) : null}
    </div>
  );
}