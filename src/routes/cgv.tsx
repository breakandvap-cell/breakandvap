import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/cgv")({
  head: () => ({
    meta: [
      { title: "CGV — Conditions générales de vente — Break and Vap" },
      {
        name: "description",
        content:
          "Conditions générales de vente de Break and Vap : commandes, paiement, livraison, rétractation et garanties.",
      },
      { property: "og:title", content: "CGV — Break and Vap" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://breakandvap.lovable.app/cgv" },
    ],
    links: [{ rel: "canonical", href: "https://breakandvap.lovable.app/cgv" }],
  }),
  component: CGV,
});

function CGV() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16 text-sm leading-relaxed">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words">
          Conditions générales de vente
        </h1>
        <p className="mt-4 text-xs text-muted-foreground">
          Version simplifiée à finaliser par le gérant avec un conseil juridique
          avant mise en ligne définitive.
        </p>

        <div className="mt-10 space-y-8">
          <Section title="1. Objet">
            Les présentes CGV régissent les ventes conclues entre la SAS Break
            and Vap et ses clients particuliers majeurs, via le site
            breakandvap.fr.
          </Section>
          <Section title="2. Public autorisé">
            La vente de produits de vape (e-liquides, accessoires) et de CBD est
            strictement réservée aux personnes majeures. Le client s'engage à
            confirmer sa majorité lors de sa première visite sur le site.
          </Section>
          <Section title="3. Produits">
            Les fiches produits mentionnent les caractéristiques essentielles :
            taux de CBD, taux de THC, taux de nicotine, avertissements
            sanitaires et éventuel certificat d'analyse (COA). Les photos sont
            non contractuelles.
          </Section>
          <Section title="4. Commande et prix">
            Les prix sont indiqués en euros TTC. La commande est enregistrée
            après validation du panier et confirmation à l'écran. Un email
            récapitulatif est envoyé au client.
          </Section>
          <Section title="5. Paiement">
            Le règlement s'effectue selon les modalités indiquées lors du
            passage de commande. Aucun envoi n'est effectué avant réception du
            paiement.
          </Section>
          <Section title="6. Livraison">
            Les commandes sont expédiées depuis nos boutiques de Bourgogne. Les
            délais sont indicatifs et dépendent du transporteur choisi.
          </Section>
          <Section title="7. Droit de rétractation">
            Conformément au Code de la consommation, le client dispose d'un
            délai de 14 jours à compter de la réception pour se rétracter, sauf
            exclusions légales applicables aux produits scellés ouverts ou
            consommables.
          </Section>
          <Section title="8. Garanties">
            Les produits bénéficient des garanties légales de conformité et des
            vices cachés.
          </Section>
          <Section title="9. Données personnelles">
            Voir la page{" "}
            <a href="/confidentialite" className="underline">
              Politique de confidentialité
            </a>
            .
          </Section>
          <Section title="10. Litiges">
            Le droit français s'applique. À défaut de résolution amiable, tout
            litige sera porté devant les tribunaux compétents.
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </section>
  );
}
