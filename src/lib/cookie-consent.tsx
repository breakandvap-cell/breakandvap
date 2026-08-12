import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Consentement cookies (RGPD) — indépendant du cookie de vérification d'âge.
export const CONSENT_COOKIE_NAME = "bnv_cookie_consent";
export const CONSENT_MAX_AGE_DAYS = 180; // 6 mois
export const CONSENT_VERSION = 1;

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentPreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type StoredConsent = {
  v: number;
  date: string;
  prefs: ConsentPreferences;
};

export const DEFAULT_PREFERENCES: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
};

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

export function parseStoredConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredConsent;
    if (!parsed || parsed.v !== CONSENT_VERSION || !parsed.prefs) return null;
    return {
      v: CONSENT_VERSION,
      date: typeof parsed.date === "string" ? parsed.date : new Date().toISOString(),
      prefs: {
        necessary: true,
        analytics: parsed.prefs.analytics === true,
        marketing: parsed.prefs.marketing === true,
      },
    };
  } catch {
    return null;
  }
}

type ConsentContextValue = {
  /** null tant que le choix n'a pas été fait (ou expiré). */
  consent: StoredConsent | null;
  ready: boolean;
  /** Le bandeau doit-il être affiché. */
  bannerOpen: boolean;
  /** Le panneau de personnalisation doit-il être affiché. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  save: (prefs: Omit<ConsentPreferences, "necessary">) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** Réouvre le bandeau (lien « Gérer mes cookies »). */
  reopen: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<StoredConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [forceBanner, setForceBanner] = useState(false);

  useEffect(() => {
    setConsent(parseStoredConsent(readCookie(CONSENT_COOKIE_NAME)));
    setReady(true);
  }, []);

  const persist = useCallback((prefs: ConsentPreferences) => {
    const record: StoredConsent = {
      v: CONSENT_VERSION,
      date: new Date().toISOString(),
      prefs,
    };
    writeCookie(CONSENT_COOKIE_NAME, JSON.stringify(record), CONSENT_MAX_AGE_DAYS);
    setConsent(record);
    setForceBanner(false);
    setPanelOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("bnv:cookie-consent", { detail: record.prefs }),
      );
    }
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      ready,
      bannerOpen: ready && (forceBanner || consent === null),
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      save: (prefs) => persist({ necessary: true, ...prefs }),
      acceptAll: () => persist({ necessary: true, analytics: true, marketing: true }),
      rejectAll: () => persist({ ...DEFAULT_PREFERENCES }),
      reopen: () => {
        setForceBanner(true);
        setPanelOpen(true);
      },
    }),
    [consent, ready, forceBanner, panelOpen, persist],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useCookieConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useCookieConsent must be used within CookieConsentProvider");
  return ctx;
}

/** Utilitaire prêt à l'emploi pour brancher un futur outil d'analytics. */
export function hasConsentFor(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  const stored = parseStoredConsent(readCookie(CONSENT_COOKIE_NAME));
  return stored ? stored.prefs[category] === true : false;
}
