import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AgeGate } from "../components/age-gate";
import { CartProvider } from "../lib/cart";
import { Toaster } from "../components/ui/sonner";
import { AuthProvider } from "../lib/auth-context";
import { SiteAmbient } from "../components/site-ambient";
import { CookieConsentProvider } from "../lib/cookie-consent";
import { CookieConsentBanner } from "../components/cookie-consent-banner";
import { AppErrorBoundary } from "../components/error-boundary";
import { logClientError } from "../lib/client-error-log.functions";
import { WelcomeWheelGate } from "../components/welcome-wheel";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void logClientError({
      data: {
        message: error.message,
        stack: error.stack ?? undefined,
        boundary: "tanstack_root_error_component",
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
      },
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Un incident technique nous empêche d'afficher cette page. Merci de réessayer
          dans un instant.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Recharger la page
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Retour à l'accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Break and Vap — CBD, e-liquides & accessoires de vape" },
      {
        name: "description",
        content:
          "Boutique française CBD & vapotage depuis 2018. E-liquides, produits CBD et accessoires livrés depuis Le Creusot et Montceau-les-Mines.",
      },
      { name: "author", content: "SAS Break and Vap" },
      { property: "og:title", content: "Break and Vap — CBD & vapotage" },
      {
        property: "og:description",
        content:
          "Boutique française CBD & vapotage depuis 2018. E-liquides, CBD et accessoires expédiés depuis nos deux boutiques.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <AppErrorBoundary boundary="app_root">
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <CookieConsentProvider>
            <AgeGate>
              <SiteAmbient />
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <AppErrorBoundary boundary="app_page">
                <Outlet />
              </AppErrorBoundary>
              {/* Le bandeau cookies vit dans l'arbre de l'AgeGate : il reste
                  masqué tant que la vérification d'âge n'est pas validée. */}
              <CookieConsentBanner />
              <WelcomeWheelGate />
              <Toaster />
            </AgeGate>
          </CookieConsentProvider>
        </CartProvider>
      </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
