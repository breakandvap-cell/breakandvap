import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ManageCookiesLink } from "@/components/cookie-consent-banner";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Politique de cookies — Break and Vap" },
      {
        name: "description",
        content:
          "Catégories de cookies utilisées sur Break and Vap, leur finalité, leur durée de conservation et la gestion de votre consentement.",
      },
      { property: "og:title", content: "Politique de cookies — Break and Vap" },
      {
        property: "og:description",
        content:
          "Finalité et durée de conservation de chaque catégorie de cookies, et gestion de votre consentement.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://breakandvap.lovable.app/cookies" },
    ],
    links: [{ rel: "canonical", href: "https://breakandvap.lovable.app/cookies" }],
  }),
  component: Cookies,
});

function Cookies() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16 text-sm leading-relaxed">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words">
          Politique de cookies
        </h1>
        <div className="mt-8 space-y-4 text-muted-foreground">
          <p>
            Le site Break and Vap distingue trois catégories de cookies. Seuls
            les cookies strictement nécessaires sont déposés sans votre accord ;
            les autres restent désactivés tant que vous ne les avez pas acceptés.
          </p>
        </div>

        <section className="mt-8 space-y-6">
          <article className="rounded-lg border border-border p-4">
            <h2 className="text-base font-semibold">
              1. Cookies strictement nécessaires (toujours actifs)
            </h2>
            <p className="mt-2 text-muted-foreground">
              Indispensables au fonctionnement du site, ils ne peuvent pas être
              désactivés et ne servent à aucun suivi publicitaire.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong>bnv_age_verified</strong> — confirmation de majorité
                (vérification d'âge). Durée : 30 jours.
              </li>
              <li>
                <strong>bnv_cookie_consent</strong> — mémorisation de votre choix
                de consentement. Durée : 6 mois.
              </li>
              <li>
                Panier en cours (stockage local du navigateur), conservé jusqu'à
                la validation de la commande ou son effacement.
              </li>
              <li>
                Session de connexion à votre compte, conservée le temps de la
                session d'authentification.
              </li>
            </ul>
          </article>

          <article className="rounded-lg border border-border p-4">
            <h2 className="text-base font-semibold">
              2. Cookies de mesure d'audience (optionnels)
            </h2>
            <p className="mt-2 text-muted-foreground">
              Finalité : mesurer la fréquentation et améliorer le site. Aucun
              outil de mesure d'audience n'est actuellement actif ; le cadre de
              consentement est en place pour un usage futur (ex. Google
              Analytics). Durée de conservation prévue : 13 mois maximum.
              Désactivés par défaut.
            </p>
          </article>

          <article className="rounded-lg border border-border p-4">
            <h2 className="text-base font-semibold">
              3. Cookies marketing / publicitaires (optionnels)
            </h2>
            <p className="mt-2 text-muted-foreground">
              Finalité : personnalisation des offres et mesure des campagnes.
              Aucun outil publicitaire n'est actuellement actif. Durée de
              conservation prévue : 13 mois maximum. Désactivés par défaut.
            </p>
          </article>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Gérer votre consentement</h2>
          <p className="mt-2 text-muted-foreground">
            Votre choix est conservé 6 mois, après quoi le bandeau réapparaît
            pour le renouveler. Vous pouvez le modifier à tout moment :
          </p>
          <ManageCookiesLink className="mt-3 inline-flex h-11 items-center justify-center rounded-md border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
