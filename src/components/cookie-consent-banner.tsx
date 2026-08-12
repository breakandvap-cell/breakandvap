import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCookieConsent } from "@/lib/cookie-consent";

const BUTTON =
  "inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70";

export function CookieConsentBanner() {
  const { bannerOpen, panelOpen, openPanel, closePanel, acceptAll, rejectAll, consent, save } =
    useCookieConsent();

  return (
    <>
      {bannerOpen && !panelOpen ? (
        <div
          role="region"
          aria-label="Consentement aux cookies"
          className="fixed inset-x-0 bottom-0 z-[9000] border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm sm:p-5"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nous utilisons des cookies strictement nécessaires au
              fonctionnement du site, et — avec votre accord — des cookies de
              mesure d'audience et de marketing. Vous pouvez accepter, refuser
              ou personnaliser votre choix.{" "}
              <Link to="/cookies" className="underline hover:text-foreground">
                Politique de cookies
              </Link>
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:shrink-0">
              <button type="button" className={BUTTON} onClick={acceptAll}>
                Tout accepter
              </button>
              <button type="button" className={BUTTON} onClick={rejectAll}>
                Tout refuser
              </button>
              <button type="button" className={BUTTON} onClick={openPanel}>
                Personnaliser
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PreferencesDialog
        open={panelOpen}
        onOpenChange={(o) => (o ? openPanel() : closePanel())}
        initial={{
          analytics: consent?.prefs.analytics ?? false,
          marketing: consent?.prefs.marketing ?? false,
        }}
        onSave={save}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
      />
    </>
  );
}

function PreferencesDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  onAcceptAll,
  onRejectAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { analytics: boolean; marketing: boolean };
  onSave: (prefs: { analytics: boolean; marketing: boolean }) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}) {
  const [analytics, setAnalytics] = useState(initial.analytics);
  const [marketing, setMarketing] = useState(initial.marketing);

  useEffect(() => {
    if (open) {
      setAnalytics(initial.analytics);
      setMarketing(initial.marketing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[9100] max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Personnaliser mes cookies</DialogTitle>
          <DialogDescription>
            Choisissez les catégories que vous acceptez. Votre choix est
            conservé 6 mois et modifiable à tout moment via « Gérer mes
            cookies » en pied de page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Category
            title="Strictement nécessaires"
            description="Fonctionnement du site : panier, session de connexion, vérification d'âge. Ces cookies ne peuvent pas être désactivés."
            checked
            disabled
          />
          <Category
            title="Mesure d'audience"
            description="Statistiques de fréquentation anonymisées (ex. Google Analytics). Aucun outil n'est actif tant que vous n'avez pas donné votre accord."
            checked={analytics}
            onChange={setAnalytics}
          />
          <Category
            title="Marketing / publicité"
            description="Personnalisation des offres et mesure des campagnes publicitaires. Désactivé par défaut."
            checked={marketing}
            onChange={setMarketing}
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <button type="button" className={BUTTON} onClick={onRejectAll}>
            Tout refuser
          </button>
          <button type="button" className={BUTTON} onClick={onAcceptAll}>
            Tout accepter
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => onSave({ analytics, marketing })}
          >
            Enregistrer mes choix
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Category({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </div>
  );
}

export function ManageCookiesLink({ className }: { className?: string }) {
  const { reopen } = useCookieConsent();
  return (
    <button type="button" onClick={reopen} className={className}>
      Gérer mes cookies
    </button>
  );
}
