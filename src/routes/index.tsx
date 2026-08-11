import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getSatisfactionAggregate } from "@/lib/google-reviews.functions";
import { featuredTestimonialsQueryOptions } from "@/lib/testimonials.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Break and Vap — CBD, e-liquides & accessoires de vape" },
      {
        name: "description",
        content:
          "Boutique française CBD & vapotage depuis 2018. E-liquides, produits CBD et accessoires livrés depuis Le Creusot et Montceau-les-Mines.",
      },
      { property: "og:title", content: "Break and Vap — CBD & vapotage" },
      {
        property: "og:description",
        content:
          "L'expertise de nos boutiques de Bourgogne, en ligne : e-liquides, CBD et accessoires de vape.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://breakandvap.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://breakandvap.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: "Break and Vap",
              url: "https://breakandvap.lovable.app/",
            },
            {
              "@type": "Organization",
              name: "SAS Break and Vap",
              url: "https://breakandvap.lovable.app/",
              address: {
                "@type": "PostalAddress",
                streetAddress: "5 Boulevard de Lattre de Tassigny",
                addressLocality: "Montceau-les-Mines",
                postalCode: "71300",
                addressCountry: "FR",
              },
            },
          ],
        }),
      },
    ],
  }),
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

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/boutique"
              className="home-cta-primary inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Découvrir le catalogue
            </Link>
          </div>
        </div>
      </section>

      <SatisfactionSection />
      <TestimonialsSection />

      <SiteFooter />
      </div>
    </main>
  );
}

function SatisfactionSection() {
  const { data } = useQuery({
    queryKey: ["satisfaction-aggregate"],
    queryFn: () => getSatisfactionAggregate(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  if (!data || data.rating == null || data.total === 0) return null;

  const rating = data.rating;
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.25 && rating - full < 0.75;
  const totalStars = 5;
  const sourcesLabel = data.sources
    .filter((s) => s.total > 0)
    .map((s) => (s.key === "google" ? "avis Google" : "avis clients du site"))
    .join(" et ");

  return (
    <section
      aria-label="Satisfaction client"
      className="mx-auto max-w-6xl px-4 pb-16 sm:pb-24"
    >
      <div className="flex flex-col items-start gap-6 border-t border-border/60 pt-16 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Satisfaction client
          </p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-5xl font-light tracking-tight text-foreground">
              {rating.toFixed(1)}
            </span>
            <span className="text-sm text-muted-foreground">/ 5</span>
          </div>
          <div
            className="mt-3 flex items-center gap-1"
            aria-label={`Note ${rating.toFixed(1)} sur 5`}
          >
            {Array.from({ length: totalStars }).map((_, i) => {
              const filled = i < full;
              const half = !filled && hasHalf && i === full;
              return (
                <Star
                  key={i}
                  className="h-4 w-4"
                  strokeWidth={1.25}
                  style={{
                    color: "var(--accent)",
                    fill: filled || half ? "var(--accent)" : "transparent",
                    opacity: half ? 0.5 : 1,
                  }}
                />
              );
            })}
          </div>
        </div>
        <p className="max-w-sm text-sm text-muted-foreground sm:text-right">
          Moyenne calculée sur <span className="text-foreground">{data.total}</span>{" "}
          {sourcesLabel || "avis"} de nos boutiques du Creusot et de
          Montceau-les-Mines.
        </p>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const { data } = useQuery(featuredTestimonialsQueryOptions());
  if (!data || data.length === 0) return null;
  return (
    <section
      aria-label="Avis clients"
      className="mx-auto max-w-6xl px-4 pb-24 sm:pb-32"
    >
      <div className="mb-10 max-w-2xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Ils nous font confiance
        </p>
        <h2 className="text-3xl sm:text-4xl">Quelques mots de nos clients.</h2>
      </div>
      <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((t) => (
          <figure key={t.id} className="flex flex-col">
            {t.rating ? (
              <div className="mb-3 flex items-center gap-0.5" aria-label={`Note ${t.rating}/5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-3.5 w-3.5"
                    strokeWidth={1.25}
                    style={{
                      color: "var(--accent)",
                      fill: i < (t.rating ?? 0) ? "var(--accent)" : "transparent",
                    }}
                  />
                ))}
              </div>
            ) : null}
            <blockquote className="text-base leading-relaxed text-foreground">
              « {t.content} »
            </blockquote>
            <figcaption className="mt-4 text-xs uppercase tracking-[0.15em] text-muted-foreground">
              — {t.author_name}
              {t.review_date ? (
                <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                  · {formatRelativeReviewDate(t.review_date)}
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function formatRelativeReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const months =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth()) -
    (now.getDate() < d.getDate() ? 1 : 0);
  if (months < 1) return "récemment";
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(months / 12);
  return years === 1 ? "il y a 1 an" : `il y a ${years} ans`;
}