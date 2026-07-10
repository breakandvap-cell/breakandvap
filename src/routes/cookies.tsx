import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookies — Break and Vap" },
      {
        name: "description",
        content:
          "Utilisation des cookies et du stockage local sur le site Break and Vap.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/cookies" },
    ],
  }),
  component: Cookies,
});

function Cookies() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 text-sm leading-relaxed">
        <h1 className="text-4xl font-semibold tracking-tight">Cookies</h1>
        <div className="mt-8 space-y-4 text-muted-foreground">
          <p>
            Le site Break and Vap utilise uniquement du stockage local
            strictement nécessaire à son fonctionnement :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Confirmation de majorité (vérification d'âge).</li>
            <li>Contenu du panier avant validation de la commande.</li>
            <li>Session utilisateur lorsque vous êtes connecté à votre compte.</li>
          </ul>
          <p>
            Aucun cookie publicitaire ou de mesure d'audience tiers n'est
            déposé. Si cela évolue, cette page sera mise à jour et une bannière
            de consentement sera ajoutée.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
