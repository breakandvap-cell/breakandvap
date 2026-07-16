import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — Break and Vap" },
      {
        name: "description",
        content:
          "Comment Break and Vap collecte et utilise les données personnelles de ses clients (compte, commandes, e-mails).",
      },
      { property: "og:title", content: "Politique de confidentialité — Break and Vap" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/confidentialite" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16 text-sm leading-relaxed">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words">
          Politique de confidentialité
        </h1>
        <p className="mt-4 text-xs text-muted-foreground">
          Cette page est maintenue par le gérant de Break and Vap et doit être
          adaptée à la réalité des traitements avant mise en ligne définitive.
        </p>

        <div className="mt-10 space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Responsable de traitement</h2>
            <p className="mt-2">
              SAS Break and Vap — coordonnées complètes sur la page{" "}
              <a href="/mentions-legales" className="underline">
                mentions légales
              </a>
              .
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Données collectées</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Compte client : e-mail, nom, mot de passe (haché).</li>
              <li>Adresses de livraison et de facturation.</li>
              <li>Historique de commandes et statuts de livraison.</li>
              <li>Vérification d'âge (attestation de majorité).</li>
              <li>Données techniques minimales nécessaires au fonctionnement du site.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Finalités</h2>
            <p className="mt-2">
              Ces données sont utilisées pour gérer votre compte, traiter et
              expédier vos commandes, respecter la réglementation applicable aux
              produits de vape et de CBD, et vous contacter en cas de besoin.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Conservation</h2>
            <p className="mt-2">
              Les commandes sont conservées le temps requis par les obligations
              comptables et fiscales. Le compte client peut être supprimé sur
              demande.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Vos droits</h2>
            <p className="mt-2">
              Conformément au RGPD, vous disposez d'un droit d'accès, de
              rectification, d'effacement, de limitation et de portabilité de
              vos données. Contact :{" "}
              <a href="mailto:contact@breakandvap.fr" className="underline">
                contact@breakandvap.fr
              </a>
              .
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Sous-traitants</h2>
            <p className="mt-2">
              Le site s'appuie sur des prestataires techniques (hébergement,
              base de données, authentification). La liste détaillée est
              maintenue par le gérant et disponible sur demande.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
