import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/mentions-legales")({
  head: () => ({
    meta: [
      { title: "Mentions légales — Break and Vap" },
      {
        name: "description",
        content:
          "Mentions légales du site Break and Vap : éditeur, hébergeur et informations relatives à la SAS Break and Vap.",
      },
      { property: "og:title", content: "Mentions légales — Break and Vap" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/mentions-legales" },
    ],
  }),
  component: Legal,
});

function Legal() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 text-sm leading-relaxed">
        <h1 className="text-4xl font-semibold tracking-tight">Mentions légales</h1>
        <p className="mt-4 text-xs text-muted-foreground">
          Cette page est maintenue par le gérant du site Break and Vap. Les
          informations ci-dessous doivent être complétées avec les données
          officielles de la société.
        </p>

        <section className="mt-10 space-y-2">
          <h2 className="text-lg font-semibold">Éditeur du site</h2>
          <p>
            SAS Break and Vap<br />
            Siège social : <em>à compléter</em><br />
            Capital social : <em>à compléter</em><br />
            RCS : <em>à compléter</em><br />
            SIRET : <em>à compléter</em><br />
            Numéro de TVA intracommunautaire : <em>à compléter</em><br />
            Directeur de la publication : <em>à compléter</em>
          </p>
        </section>

        <section className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p>
            E-mail :{" "}
            <a href="mailto:contact@breakandvap.fr" className="underline">
              contact@breakandvap.fr
            </a>
          </p>
        </section>

        <section className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold">Hébergement</h2>
          <p>
            Site hébergé par Lovable / Cloudflare Workers. Coordonnées de
            l'hébergeur : <em>à compléter par le gérant</em>.
          </p>
        </section>

        <section className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold">Propriété intellectuelle</h2>
          <p>
            L'ensemble des contenus présents sur ce site (textes, images, logos,
            marques) est protégé par le droit d'auteur. Toute reproduction sans
            autorisation écrite préalable est interdite.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
