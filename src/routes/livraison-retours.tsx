import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/livraison-retours")({
  head: () => ({
    meta: [
      { title: "Livraison et retours — Break and Vap" },
      {
        name: "description",
        content:
          "Modalités de livraison, délais et conditions de retour des commandes Break and Vap.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/livraison-retours" },
    ],
  }),
  component: Shipping,
});

function Shipping() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 text-sm leading-relaxed">
        <h1 className="text-4xl font-semibold tracking-tight">
          Livraison & retours
        </h1>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Préparation</h2>
            <p className="mt-2 text-muted-foreground">
              Les commandes passées avant midi du lundi au vendredi sont
              préparées le jour même dans nos boutiques de Bourgogne. Les
              commandes du week-end sont préparées le lundi.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Expédition</h2>
            <p className="mt-2 text-muted-foreground">
              Les colis sont remis à La Poste ou à un transporteur partenaire.
              Un numéro de suivi est ajouté à votre commande dès l'expédition
              et visible depuis votre espace client.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Retours</h2>
            <p className="mt-2 text-muted-foreground">
              Conformément à la réglementation, vous disposez de 14 jours après
              réception pour vous rétracter, sauf produits descellés ou
              consommables ouverts. Contactez-nous à{" "}
              <a href="mailto:contact@breakandvap.fr" className="underline">
                contact@breakandvap.fr
              </a>{" "}
              avant tout renvoi.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Litiges & SAV</h2>
            <p className="mt-2 text-muted-foreground">
              En cas de colis endommagé ou d'article défectueux, contactez-nous
              sous 7 jours avec photos à l'appui pour trouver une solution.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
