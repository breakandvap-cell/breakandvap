import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/connexion-admin")({
  head: () => ({
    meta: [
      { title: "Connexion sécurisée gérant | Break and Vap" },
      {
        name: "description",
        content:
          "Accès réservé à l'équipe Break and Vap : connexion sécurisée avec double authentification.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Connexion sécurisée gérant" },
      {
        property: "og:description",
        content: "Espace de gestion Break and Vap protégé par double authentification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLoginPage,
});

type Step = "credentials" | "totp";

function AdminLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Si une session aal2 existe déjà, on entre directement dans l'espace gérant.
  useEffect(() => {
    let active = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (!active || !data) return;
      const ok =
        data.currentLevel === "aal2" ||
        (data.currentLevel === "aal1" && data.nextLevel === "aal1");
      supabase.auth.getUser().then(({ data: u }) => {
        if (active && u.user && ok) navigate({ to: "/admin", replace: true });
      });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  const onCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: aal, error: aalErr } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalErr) throw aalErr;
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
        if (fErr) throw fErr;
        const totp = factors?.totp?.[0];
        if (!totp) throw new Error("Aucun facteur d'authentification disponible.");
        setFactorId(totp.id);
        setStep("totp");
        return;
      }
      toast.success("Connexion réussie");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error("Échec de la connexion", {
        description: translate(err instanceof Error ? err.message : "Erreur inconnue"),
      });
    } finally {
      setBusy(false);
    }
  };

  const onTotp = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.replace(/\s/g, ""),
      });
      if (error) throw error;
      toast.success("Double authentification validée");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error("Code invalide", {
        description: err instanceof Error ? translate(err.message) : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await supabase.auth.signOut();
    setStep("credentials");
    setCode("");
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
        <h1 className="text-2xl sm:text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
          Connexion sécurisée gérant
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Espace réservé à l'équipe Break and Vap. La double authentification est
          exigée dès qu'elle est activée sur le compte.
        </p>

        {step === "credentials" ? (
          <form onSubmit={onCredentials} className="mt-8 space-y-4">
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Veuillez patienter…" : "Continuer"}
            </button>
          </form>
        ) : (
          <form onSubmit={onTotp} className="mt-8 space-y-4">
            <p className="text-sm text-muted-foreground">
              Saisissez le code à 6 chiffres affiché par votre application
              d'authentification.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Code de vérification
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9 ]{6,9}"
                maxLength={9}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input tracking-[0.4em]"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "Vérification…" : "Valider"}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-md border border-border bg-card px-4 py-3 text-sm hover:bg-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <Link
          to="/auth"
          className="mt-8 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Je suis un client — connexion boutique
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function translate(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (msg.toLowerCase().includes("invalid totp") || msg.includes("invalid_code"))
    return "Code de vérification incorrect ou expiré.";
  if (msg.includes("Email not confirmed")) return "Confirmez votre email avant de vous connecter.";
  return msg;
}