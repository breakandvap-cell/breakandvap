import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/a-propos")({
  head: () => ({
    meta: [
      { title: "À propos — Break and Vap, CBD & vapotage en Bourgogne" },
      {
        name: "description",
        content:
          "Depuis 2018, Break and Vap accompagne les vapoteurs et amateurs de CBD depuis ses boutiques du Creusot et de Montceau-les-Mines.",
      },
      { property: "og:title", content: "À propos — Break and Vap" },
      {
        property: "og:description",
        content:
          "Boutique française CBD et vape née en 2018, deux points de vente en Bourgogne.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://breakandvap.lovable.app/a-propos" },
    ],
    links: [{ rel: "canonical", href: "https://breakandvap.lovable.app/a-propos" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "LocalBusiness",
              name: "Break and Vap — Le Creusot",
              url: "https://breakandvap.lovable.app/a-propos",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Le Creusot",
                postalCode: "71200",
                addressCountry: "FR",
              },
            },
            {
              "@type": "LocalBusiness",
              name: "Break and Vap — Montceau-les-Mines",
              url: "https://breakandvap.lovable.app/a-propos",
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
  component: About,
});

function About() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words">Notre histoire</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Break and Vap est une SAS française fondée en 2018. Nous exploitons
          deux boutiques physiques au Creusot et à Montceau-les-Mines, et
          proposons désormais une sélection de produits en ligne.
        </p>
        <div className="mt-10 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold">Notre sélection</h2>
            <p className="mt-2 text-muted-foreground">
              Nous distribuons exclusivement des e-liquides, des produits à base
              de CBD et des accessoires de vape. Nous ne vendons pas d'appareils
              électroniques. Chaque référence est sélectionnée par notre équipe
              et accompagnée de ses avertissements sanitaires.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Nos engagements</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Vente strictement réservée aux personnes majeures.</li>
              <li>Fiches produits transparentes : taux CBD, THC, nicotine.</li>
              <li>Expédition depuis nos boutiques en Bourgogne.</li>
              <li>Conseil disponible en boutique et par e-mail.</li>
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
