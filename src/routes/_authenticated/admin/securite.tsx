import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin/securite")({
  head: () => ({
    meta: [
      { title: "Sécurité & sessions | Espace gérant" },
      {
        name: "description",
        content:
          "Gérez la double authentification et les sessions actives de l'espace gérant Break and Vap.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sécurité & sessions — Espace gérant" },
      {
        property: "og:description",
        content: "Double authentification TOTP et gestion des sessions administrateur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [aal, setAal] = useState<string>("aal1");

  const factorsQuery = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data?.totp ?? [];
    },
  });

  useEffect(() => {
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data }) => setAal(data?.currentLevel ?? "aal1"));
  }, [factorsQuery.data]);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Admin ${new Date().toLocaleDateString("fr-FR")}`,
      });
      if (error) throw error;
      setEnroll({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (e) {
      toast.error("Impossible de démarrer l'activation", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enroll) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enroll.id,
        code: code.replace(/\s/g, ""),
      });
      if (error) throw error;
      toast.success("Double authentification activée");
      setEnroll(null);
      setCode("");
      await qc.invalidateQueries();
      factorsQuery.refetch();
    } catch (e) {
      toast.error("Code invalide", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (id: string) => {
    if (!confirm("Désactiver ce facteur d'authentification ?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(error.message);
    toast.success("Facteur supprimé");
    factorsQuery.refetch();
  };

  const signOutEverywhere = async () => {
    await supabase.auth.signOut({ scope: "global" });
    await signOut();
    window.location.href = "/connexion-admin";
  };

  const factors = factorsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Sécurité & sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protégez l'espace gérant avec la double authentification et gardez la main
          sur vos sessions actives.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-medium">Double authentification (TOTP)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Application recommandée : Google Authenticator, Authy, 1Password…
        </p>

        {factors.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {factors.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  {f.friendly_name || "Application d'authentification"}{" "}
                  <span className="text-muted-foreground">
                    · {f.status === "verified" ? "actif" : "en attente"}
                  </span>
                </span>
                <button
                  onClick={() => removeFactor(f.id)}
                  className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary"
                >
                  Désactiver
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Aucune double authentification active sur ce compte.
          </p>
        )}

        {enroll ? (
          <div className="mt-4 space-y-3 rounded-md border border-border p-3">
            <p className="text-sm">
              Scannez ce QR code, puis saisissez le code à 6 chiffres pour confirmer.
            </p>
            <img
              src={enroll.qr}
              alt="QR code d'activation de la double authentification"
              className="h-44 w-44 rounded bg-white p-2"
            />
            <p className="break-all text-xs text-muted-foreground">
              Clé manuelle : {enroll.secret}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                inputMode="numeric"
                maxLength={9}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="input max-w-[10rem] tracking-[0.3em]"
              />
              <button
                onClick={confirmEnroll}
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                Confirmer
              </button>
              <button
                onClick={() => setEnroll(null)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startEnroll}
            disabled={busy}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Activer une application d'authentification
          </button>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-medium">Session en cours</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Compte :</dt>
            <dd>{user?.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Niveau de sécurité :</dt>
            <dd>{aal === "aal2" ? "Double authentification vérifiée" : "Mot de passe seul"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Dernière connexion :</dt>
            <dd>
              {user?.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString("fr-FR")
                : "—"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Verrouillage auto :</dt>
            <dd>après 30 minutes d'inactivité</dd>
          </div>
        </dl>
        <button
          onClick={signOutEverywhere}
          className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
        >
          Déconnecter tous les appareils
        </button>
      </section>
    </div>
  );
}