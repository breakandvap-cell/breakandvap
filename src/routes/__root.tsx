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
import {
  FloatingCartSummary,
  PendingRewardBadge,
} from "../components/floating-widgets";

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

const HYDRATION_FALLBACK_SCRIPT = `(function(){"use strict";try{var KEY="bnv_hydration_retry",MAX=3,count=0,handled=false;try{count=parseInt(window.sessionStorage.getItem(KEY)||"0",10)||0}catch(_){}function render(message,allowRetry){var s="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:2rem;background:#0f172a;color:#f8fafc;text-align:center;",c="max-width:28rem;",t="font-size:1.25rem;font-weight:600;margin:0 0 0.75rem;",p="color:#94a3b8;margin:0 0 1.5rem;line-height:1.5;",b="padding:0.625rem 1.25rem;border-radius:0.375rem;background:#3b82f6;color:#fff;border:none;cursor:pointer;font:inherit;font-weight:500;",h='<div style="'+s+'"><div style="'+c+'"><h1 style="'+t+'">Chargement interrompu</h1><p style="'+p+'">'+message+"</p>"+(allowRetry?'<button style="'+b+'" onclick="location.reload()">Réessayer</button>':"")+"</div></div>";if(document.body){document.body.innerHTML=h}else{document.write(h);document.close()}}function retry(){if(handled)return;handled=true;if(count<MAX){try{window.sessionStorage.setItem(KEY,String(count+1))}catch(_){}render("La page n'a pas pu s'initialiser correctement. Nouvelle tentative automatique...",false);setTimeout(function(){window.location.reload()},1200)}else{try{window.sessionStorage.removeItem(KEY)}catch(_){}render("Impossible de charger la page après plusieurs tentatives. Veuillez réessayer manuellement.",true)}}function isBootstrapError(msg){return typeof msg==="string"&&msg.indexOf("Expected to find bootstrap data")!==-1}window.addEventListener("error",function(e){if(isBootstrapError(e.message)){e.preventDefault();retry()}});window.addEventListener("unhandledrejection",function(e){var r=e.reason,msg=r&&(r.message||(r.toString&&r.toString()))||"";if(isBootstrapError(msg)){e.preventDefault();retry()}});function backup(){if(handled)return;if(!window.$_TSR){retry()}else{try{window.sessionStorage.removeItem(KEY)}catch(_){}}}if(document.readyState==="complete"){setTimeout(backup,500)}else{window.addEventListener("load",function(){setTimeout(backup,500)})}}catch(_){}})();`;

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
    scripts: [
      {
        type: "text/javascript",
        children: HYDRATION_FALLBACK_SCRIPT,
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
              <FloatingCartSummary />
              <PendingRewardBadge />
              <Toaster />
            </AgeGate>
          </CookieConsentProvider>
        </CartProvider>
      </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
