import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { isAdmin, claimAdminIfNone } from "@/lib/admin.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  loader: async () => {
    const res = await isAdmin();
    if (!res.isAdmin) {
      // Not admin — try graceful redirect to /compte with a claim option
      return { isAdmin: false as const };
    }
    return { isAdmin: true as const };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin: ok } = Route.useLoaderData();
  if (!ok) return <NotAdmin />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const links = [
    { to: "/admin", label: "Tableau de bord", exact: true },
    { to: "/admin/produits", label: "Produits" },
    { to: "/admin/commandes", label: "Commandes" },
  ] as const;
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Espace gérant
        </span>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          {links.map((l) => {
            const active = l.exact ? pathname === l.to : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← Retour boutique
        </Link>
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
