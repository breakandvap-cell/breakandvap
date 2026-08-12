import { Component, type ErrorInfo, type ReactNode } from "react";

import logoAsset from "@/assets/logo-break-vap-cbd.png.asset.json";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { logClientError } from "@/lib/client-error-log.functions";

type Props = {
  children: ReactNode;
  /** Nom de la zone protégée, utilisé uniquement dans les logs techniques. */
  boundary?: string;
};

type State = { hasError: boolean };

function ErrorFallback() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <img
        src={logoAsset.url}
        alt="Break and Vap"
        className="h-16 w-auto"
        loading="eager"
      />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
        Une erreur est survenue
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Un incident technique nous empêche d'afficher cette page. Nos équipes en ont
        été informées automatiquement. Merci de réessayer dans un instant.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Recharger la page
        </button>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Retour à l'accueil
        </a>
      </div>
    </div>
  );
}

/**
 * Error Boundary global : intercepte les erreurs de rendu React, affiche un
 * message générique au client et envoie le détail technique au monitoring.
 * N'altère aucun comportement normal de l'application.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const boundary = this.props.boundary ?? "app_root";
    // Log navigateur (dev tools) + monitoring Lovable.
    console.error(`[${boundary}]`, error);
    reportLovableError(error, { boundary });
    // Log serveur : le détail technique n'est jamais rendu au client.
    void logClientError({
      data: {
        message: error.message,
        stack: error.stack ?? undefined,
        componentStack: info.componentStack ?? undefined,
        boundary,
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      },
    }).catch(() => {
      /* le log ne doit jamais casser l'affichage de repli */
    });
  }

  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}
