import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { claimAdminIfNone } from "@/lib/admin.functions";
import { adminAccessStatus } from "@/lib/admin-security.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useIdleTimeout } from "@/lib/use-idle-timeout";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  loader: async () => {
    const res = await adminAccessStatus();
    return { isAdmin: res.isAdmin, needsMfa: res.needsMfa, mfaEnabled: res.mfaEnabled };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin: ok, needsMfa, mfaEnabled } = Route.useLoaderData();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // Verrouillage automatique de l'espace gérant après inactivité.
  useIdleTimeout(30, async () => {
    await signOut();
    toast.info("Session gérant verrouillée après 30 minutes d'inactivité.");
    navigate({ to: "/connexion-admin", replace: true });
  });

  if (!ok) return <NotAdmin />;
  if (needsMfa) return <NeedsMfa />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {!mfaEnabled ? (
          <div className="mb-4 rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm">
            La double authentification n'est pas activée sur ce compte gérant.{" "}
            <Link to="/admin/securite" className="underline">
              L'activer maintenant
            </Link>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

function NeedsMfa() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Double authentification requise</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Votre session n'a pas été validée par un code d'authentification. Reconnectez-vous
        via la connexion sécurisée gérant.
      </p>
      <Link
        to="/connexion-admin"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Connexion sécurisée
      </Link>
    </div>
  );
}

function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const links: Array<{
    to:
      | "/admin"
      | "/admin/produits"
      | "/admin/produits/a-completer"
      | "/admin/commandes"
      | "/admin/clients"
      | "/admin/factures"
      | "/admin/categories"
      | "/admin/references-techniques"
      | "/admin/reception-marchandise"
      | "/admin/temoignages"
      | "/admin/promotions"
      | "/admin/parametres"
      | "/admin/securite";
    label: string;
    exact?: boolean;
  }> = [
    { to: "/admin", label: "Tableau de bord", exact: true },
    { to: "/admin/produits", label: "Produits" },
    { to: "/admin/produits/a-completer", label: "Produits à compléter" },
    { to: "/admin/categories", label: "Catégories" },
    { to: "/admin/references-techniques", label: "Références techniques" },
    { to: "/admin/reception-marchandise", label: "Réception marchandise" },
    { to: "/admin/commandes", label: "Commandes" },
    { to: "/admin/clients", label: "Clients" },
    { to: "/admin/factures", label: "Factures" },
    { to: "/admin/temoignages", label: "Témoignages" },
    { to: "/admin/promotions", label: "Promotions" },
    { to: "/admin/parametres", label: "Paramètres" },
    { to: "/admin/securite", label: "Sécurité" },
  ];
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
            Espace gérant
          </span>
          <Link
            to="/"
            className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
          >
            ← Boutique
          </Link>
        </div>
        <nav className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:mt-2 sm:flex-wrap sm:gap-4 sm:px-0 sm:pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((l) => {
            const active = l.exact ? pathname === l.to : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={
                  "shrink-0 whitespace-nowrap border-b-2 px-2 py-2 transition-colors sm:border-b-0 sm:px-0 sm:py-2 " +
                  (active
                    ? "border-primary font-medium text-foreground sm:border-transparent"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function NotAdmin() {
  const qc = useQueryClient();
  const claim = useServerFn(claimAdminIfNone);
  const m = useMutation({
    mutationFn: () => claim(),
    onSuccess: async (res) => {
      if (res.claimed) {
        toast.success("Vous êtes maintenant administrateur.");
        await qc.invalidateQueries();
        window.location.reload();
      } else {
        toast.error("Un administrateur existe déjà. Contactez-le pour obtenir l'accès.");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Accès réservé au gérant</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cet espace est réservé aux administrateurs. Si vous êtes le premier utilisateur
        du site, vous pouvez réclamer le rôle admin ci-dessous.
      </p>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {m.isPending ? "…" : "Réclamer le rôle admin"}
      </button>
      <div className="mt-4">
        <Link to="/compte" className="text-sm text-muted-foreground hover:text-foreground">
          Retour au compte
        </Link>
      </div>
    </div>
  );
}
