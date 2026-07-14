import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import logoAsset from "@/assets/logo-break-vap-cbd.png.asset.json";

// Cookie de validation de majorité — valable 30 jours.
const COOKIE_NAME = "bnv_age_verified";
const COOKIE_VALUE = "1";
const COOKIE_MAX_AGE_DAYS = 30;
// URL neutre externe pour rediriger les visiteurs mineurs.
const MINOR_REDIRECT_URL = "https://www.google.com/";

type Status = "checking" | "prompt" | "verified";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax` +
    secure;
}

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  // Vérifie le cookie côté client au montage. Tant que le check n'est pas
  // terminé, on garde l'overlay affiché : la modal ne se ferme JAMAIS sans
  // interaction utilisateur ou cookie valide déjà présent.
  useEffect(() => {
    setStatus(readCookie(COOKIE_NAME) === COOKIE_VALUE ? "verified" : "prompt");
  }, []);

  const onVerified = () => {
    writeCookie(COOKIE_NAME, COOKIE_VALUE, COOKIE_MAX_AGE_DAYS);
    setStatus("verified");
  };

  const showOverlay = status !== "verified";

  return (
    <>
      {/* Le contenu du site est conservé dans le DOM (utile pour le SEO / SSR)
          mais masqué et inerte tant que la vérification n'est pas passée. */}
      <div
        aria-hidden={showOverlay ? "true" : undefined}
        {...(showOverlay ? { inert: "" as unknown as boolean } : {})}
        style={showOverlay ? { visibility: "hidden" } : undefined}
      >
        {children}
      </div>
      <AgeGateOverlay
        open={showOverlay}
        checking={status === "checking"}
        onVerified={onVerified}
      />
    </>
  );
}

// Calcule l'âge complet en années à la date "today" à partir d'une date de
// naissance (year/month/day). Retourne un entier ≥ 0.
export function computeAge(
  birth: { year: number; month: number; day: number },
  today: Date = new Date(),
): number {
  let age = today.getFullYear() - birth.year;
  const m = today.getMonth() + 1 - birth.month;
  if (m < 0 || (m === 0 && today.getDate() < birth.day)) age -= 1;
  return age;
}

// Une date est plausible si les champs saisis existent réellement dans le
// calendrier (ex. 31/02/2000 est refusé) et sont dans une fourchette
// raisonnable pour une date de naissance.
export function isPlausibleBirthDate(
  y: number,
  m: number,
  d: number,
  today: Date = new Date(),
): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const currentYear = today.getFullYear();
  if (y < currentYear - 120 || y > currentYear) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

function AgeGateOverlay({
  open,
  checking,
  onVerified,
}: {
  open: boolean;
  checking: boolean;
  onVerified: () => void;
}) {
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();
  const errorId = useId();
  const dayLabelId = useId();
  const monthLabelId = useId();
  const yearLabelId = useId();
  const dayHintId = useId();
  const monthHintId = useId();
  const yearHintId = useId();

  const parsed = useMemo(() => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!year || !month || !day) return null;
    if (!isPlausibleBirthDate(y, m, d)) return null;
    return { y, m, d };
  }, [day, month, year]);

  const canSubmit = parsed !== null && !rejected && !checking;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed) return;
    const age = computeAge({ year: parsed.y, month: parsed.m, day: parsed.d });
    if (age < 18) {
      setRejected(true);
      setError(
        "L'accès à ce site est strictement réservé aux personnes majeures. Vous allez être redirigé.",
      );
      window.setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.replace(MINOR_REDIRECT_URL);
        }
      }, 2500);
      return;
    }
    setError(null);
    onVerified();
  };

  const onDigitChange =
    (
      setter: (v: string) => void,
      max: number,
      next?: React.RefObject<HTMLInputElement | null>,
    ) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "").slice(0, max);
      setter(raw);
      if (raw.length === max && next?.current) next.current.focus();
    };

  return (
    <DialogPrimitive.Root open={open} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-background/95 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={descId}
          // Empêche toute fermeture non voulue : Escape, clic hors modal,
          // interactions sous-jacentes. Radix conserve le focus-trap et
          // renvoie le focus au bon endroit à la fermeture.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          // Donne le focus initial au premier champ plutôt qu'au wrapper.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            dayRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg outline-none sm:p-8"
        >
        <div className="mb-4 flex justify-center">
          <img
            src={logoAsset.url}
            alt="Break & Vap CBD"
            className="h-24 w-auto sm:h-28"
            width={280}
            height={180}
          />
        </div>
        <DialogPrimitive.Title
          id={titleId}
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Confirmez votre âge
        </DialogPrimitive.Title>
        <DialogPrimitive.Description id={descId} className="mt-3 text-sm text-muted-foreground">
          Ce site propose des produits à base de nicotine et de CBD dont la
          vente est strictement réservée aux personnes majeures. Merci
          d'indiquer votre date de naissance pour continuer.
        </DialogPrimitive.Description>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Date de naissance</legend>
            <div className="flex items-center gap-2">
              <label className="flex flex-1 flex-col text-xs text-muted-foreground">
                <span className="mb-1">Jour</span>
                <input
                  ref={dayRef}
                  inputMode="numeric"
                  autoComplete="bday-day"
                  placeholder="JJ"
                  value={day}
                  onChange={onDigitChange(setDay, 2, monthRef)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-center text-base text-foreground"
                  aria-label="Jour de naissance (1 à 31)"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  maxLength={2}
                  disabled={rejected}
                  required
                />
              </label>
              <label className="flex flex-1 flex-col text-xs text-muted-foreground">
                <span className="mb-1">Mois</span>
                <input
                  ref={monthRef}
                  inputMode="numeric"
                  autoComplete="bday-month"
                  placeholder="MM"
                  value={month}
                  onChange={onDigitChange(setMonth, 2, yearRef)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-center text-base text-foreground"
                  aria-label="Mois de naissance (1 à 12)"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  maxLength={2}
                  disabled={rejected}
                  required
                />
              </label>
              <label className="flex flex-[1.4] flex-col text-xs text-muted-foreground">
                <span className="mb-1">Année</span>
                <input
                  ref={yearRef}
                  inputMode="numeric"
                  autoComplete="bday-year"
                  placeholder="AAAA"
                  value={year}
                  onChange={onDigitChange(setYear, 4)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-center text-base text-foreground"
                  aria-label="Année de naissance (4 chiffres)"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  maxLength={4}
                  disabled={rejected}
                  required
                />
              </label>
            </div>
          </fieldset>

          {error ? (
            <p
              id={errorId}
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? "Vérification…" : "Valider"}
          </button>

          <p className="text-xs text-muted-foreground">
            La nicotine crée une forte dépendance. Vente interdite aux
            mineurs (art. L.3513-5 du Code de la santé publique). Votre date
            de naissance n'est pas transmise à nos serveurs ; seule une
            confirmation de majorité est mémorisée dans un cookie pendant
            {" "}
            {COOKIE_MAX_AGE_DAYS} jours.
          </p>
        </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}