import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/commande/$orderNumber")({
  head: () => ({
    meta: [
      { title: "Commande confirmée | Break and Vap" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderConfirmationPage,
});

function OrderConfirmationPage() {
  const { orderNumber } = Route.useParams();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--secondary)", color: "var(--accent)" }}
        >
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1
          className="mt-6 text-3xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Merci pour votre commande
        </h1>
        <p className="mt-3 text-muted-foreground">
          Votre commande <strong className="text-foreground">{orderNumber}</strong>{" "}
          a bien été enregistrée. Nous vous contactons par email pour confirmer
          le règlement et l'expédition depuis nos boutiques de Bourgogne.
        </p>
        <div className="mt-8 rounded-lg border border-border bg-card p-6 text-left text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Prochaines étapes</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>Réception d'un email récapitulatif.</li>
            <li>Confirmation du règlement par notre équipe.</li>
            <li>Préparation puis dépôt à La Poste dans la journée.</li>
          </ol>
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/boutique"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            Continuer mes achats
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Accueil
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}