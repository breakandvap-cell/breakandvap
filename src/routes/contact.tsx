import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Break and Vap" },
      {
        name: "description",
        content:
          "Contactez Break and Vap : boutiques du Creusot et de Montceau-les-Mines, ou par e-mail pour toute question sur votre commande.",
      },
      { property: "og:title", content: "Contact — Break and Vap" },
      {
        property: "og:description",
        content: "Nous joindre par e-mail ou en boutique.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://breakandvap.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://breakandvap.lovable.app/contact" }],
  }),
  component: Contact,
});

function Contact() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words">Contact</h1>
        <p className="mt-6 text-muted-foreground">
          Une question sur une commande, un produit ou un partenariat ? Écrivez-
          nous ou passez en boutique.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-md border p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              E-mail
            </h2>
            <p className="mt-2 text-lg">
              <a href="mailto:contact@breakandvap.fr" className="hover:underline">
                contact@breakandvap.fr
              </a>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Réponse sous 24 à 48 h ouvrées.
            </p>
          </div>
          <div className="rounded-md border p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Boutiques
            </h2>
            <ul className="mt-2 space-y-3 text-sm">
              <li>
                <div className="font-medium">Break and Vap — Le Creusot</div>
                <div className="text-muted-foreground">
                  Adresse à compléter par le gérant.
                </div>
              </li>
              <li>
                <div className="font-medium">
                  Break and Vap — Montceau-les-Mines
                </div>
                <div className="text-muted-foreground">
                  Adresse à compléter par le gérant.
                </div>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Vente strictement interdite aux mineurs. La nicotine crée une forte
          dépendance.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
