import { useEffect, useState } from "react";
import logoAsset from "@/assets/logo-break-vap-cbd.png.asset.json";

const STORAGE_KEY = "bnv_age_verified";
const STORAGE_VALUE = "1";
const REFUSED_KEY = "bnv_age_refused";

type Status = "loading" | "verified" | "prompt" | "refused";

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    try {
      if (localStorage.getItem(REFUSED_KEY) === "1") {
        setStatus("refused");
        return;
      }
      if (localStorage.getItem(STORAGE_KEY) === STORAGE_VALUE) {
        setStatus("verified");
        return;
      }
    } catch {
      // storage blocked → still show prompt
    }
    setStatus("prompt");
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, STORAGE_VALUE);
      localStorage.removeItem(REFUSED_KEY);
    } catch {
      /* ignore */
    }
    setStatus("verified");
  };

  const refuse = () => {
    try {
      localStorage.setItem(REFUSED_KEY, "1");
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setStatus("refused");
  };

  if (status === "loading") {
    // Render children but hidden to avoid layout flash; SSR HTML remains intact for SEO
    return (
      <div aria-hidden="true" style={{ visibility: "hidden" }}>
        {children}
      </div>
    );
  }

  if (status === "verified") {
    return <>{children}</>;
  }

  if (status === "refused") {
    return <RefusedScreen onReconsider={() => setStatus("prompt")} />;
  }

  return <PromptScreen onAccept={accept} onRefuse={refuse} />;
}

function PromptScreen({
  onAccept,
  onRefuse,
}: {
  onAccept: () => void;
  onRefuse: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg sm:p-8">
        <div className="mb-4 flex justify-center">
          <img
            src={logoAsset.url}
            alt="Break & Vap CBD"
            className="h-24 w-auto sm:h-28"
            width={280}
            height={180}
          />
        </div>
        <h2
          id="age-gate-title"
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Confirmez votre âge
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Ce site propose des produits à base de nicotine et de CBD dont la
          vente est strictement réservée aux personnes majeures. Vous devez
          avoir au moins <strong>18 ans</strong> pour continuer.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          La nicotine crée une forte dépendance. Vente interdite aux mineurs
          (art. L.3513-5 du Code de la santé publique).
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            J'ai 18 ans ou plus — Entrer
          </button>
          <button
            type="button"
            onClick={onRefuse}
            className="inline-flex flex-1 items-center justify-center rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Je suis mineur — Sortir
          </button>
        </div>
      </div>
    </div>
  );
}

function RefusedScreen({ onReconsider }: { onReconsider: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Accès refusé
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          L'accès à ce site est réservé aux personnes majeures. Merci de votre
          visite.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Si vous avez confirmé votre âge par erreur, vous pouvez{" "}
          <button
            type="button"
            onClick={onReconsider}
            className="underline underline-offset-2 hover:text-foreground"
          >
            revenir à la vérification
          </button>
          .
        </p>
      </div>
    </div>
  );
}