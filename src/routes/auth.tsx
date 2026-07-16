import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth-context";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).default("signin").optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Connexion | Break and Vap" },
      { name: "description", content: "Connectez-vous ou créez votre compte Break and Vap." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode = "signin", redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: redirect ?? "/compte", replace: true });
    }
  }, [user, loading, navigate, redirect]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "signup") {
        const normalizedPhone = normalizeFrPhone(phone);
        if (!normalizedPhone) {
          toast.error("Téléphone invalide", {
            description:
              "Merci de saisir un numéro de téléphone français valide (ex. 06 12 34 56 78).",
          });
          setBusy(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName || null, phone: normalizedPhone },
          },
        });
        if (error) throw error;
        toast.success("Compte créé", {
          description: "Vérifiez votre boîte mail pour confirmer votre adresse.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Connexion réussie");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(tab === "signup" ? "Échec de l'inscription" : "Échec de la connexion", {
        description: translateAuthError(msg),
      });
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Email envoyé", {
        description: "Si un compte existe, un lien de réinitialisation vient d'être envoyé.",
      });
      setForgotOpen(false);
    } catch (err) {
      toast.error("Impossible d'envoyer l'email", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
        <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
          {tab === "signup" ? "Créer un compte" : "Se connecter"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Suivez vos commandes, retrouvez vos adresses et gagnez du temps au
          passage en caisse.
        </p>

        <div className="mt-6 inline-flex w-full rounded-md border border-border bg-card p-1 text-sm sm:w-auto sm:self-start">
          <button
            className={`flex-1 rounded px-3 py-2 sm:flex-none sm:py-1 ${tab === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab("signin")}
            type="button"
          >
            Connexion
          </button>
          <button
            className={`flex-1 rounded px-3 py-2 sm:flex-none sm:py-1 ${tab === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab("signup")}
            type="button"
          >
            Inscription
          </button>
        </div>

        {forgotOpen ? (
          <form onSubmit={onForgot} className="mt-8 space-y-4">
            <p className="text-sm text-muted-foreground">
              Entrez l'email associé à votre compte. Nous vous enverrons un lien
              pour réinitialiser votre mot de passe.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Email
              </span>
              <input
                type="email"
                required
                maxLength={255}
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="input"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                Envoyer le lien
              </button>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {tab === "signup" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Nom complet
                </span>
                <input
                  type="text"
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                />
              </label>
            ) : null}
            {tab === "signup" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Téléphone *
                </span>
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={20}
                  placeholder="06 12 34 56 78"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Numéro français (mobile ou fixe), utilisé pour la livraison.
                </span>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Mot de passe
              </span>
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
              {tab === "signup" ? (
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  8 caractères minimum.
                </span>
              ) : null}
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy
                ? "Veuillez patienter…"
                : tab === "signup"
                  ? "Créer mon compte"
                  : "Se connecter"}
            </button>

            {tab === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Mot de passe oublié ?
              </button>
            ) : null}
          </form>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          En créant un compte, vous certifiez avoir 18 ans ou plus et acceptez
          nos conditions générales de vente.
        </p>
        <Link
          to="/"
          className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Retour à l'accueil
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function translateAuthError(msg: string): string {
  if (msg.includes("Invalid login credentials"))
    return "Email ou mot de passe incorrect.";
  if (msg.includes("User already registered"))
    return "Un compte existe déjà avec cet email.";
  if (msg.includes("Email not confirmed"))
    return "Confirmez votre email avant de vous connecter.";
  return msg;
}

export function normalizeFrPhone(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[\s.\-()]/g, "");
  let national: string | null = null;
  if (/^0[1-9]\d{8}$/.test(digits)) national = digits;
  else if (/^\+33[1-9]\d{8}$/.test(digits)) national = "0" + digits.slice(3);
  else if (/^0033[1-9]\d{8}$/.test(digits)) national = "0" + digits.slice(4);
  if (!national) return null;
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}