import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { LogOut, MapPin, Package, User as UserIcon } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { isAdmin as isAdminFn } from "@/lib/admin.functions";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/compte")({
  head: () => ({
    meta: [
      { title: "Mon compte | Break and Vap" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountLayout,
});

function AccountLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = pathname === "/compte";
  const { data: adminCheck } = useQuery({
    queryKey: ["admin", "self-check", user?.id ?? "none"],
    queryFn: () => isAdminFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const isAdmin = !!adminCheck?.isAdmin;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Espace client
            </p>
            <h1
              className="mt-1 text-3xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Bonjour{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>

        <nav className="mt-8 flex flex-wrap gap-2 border-b border-border">
          <TabLink to="/compte" exact icon={<UserIcon className="h-4 w-4" />}>
            Tableau de bord
          </TabLink>
          <TabLink to="/compte/commandes" icon={<Package className="h-4 w-4" />}>
            Commandes
          </TabLink>
          <TabLink to="/compte/adresses" icon={<MapPin className="h-4 w-4" />}>
            Adresses
          </TabLink>
          {isAdmin ? (
            <TabLink to="/admin" icon={<ShieldCheck className="h-4 w-4" />}>
              Espace admin
            </TabLink>
          ) : null}
        </nav>

        <div className="mt-8">
          {isIndex ? <AccountDashboard isAdmin={isAdmin} /> : <Outlet />}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function TabLink({
  to,
  exact,
  icon,
  children,
}: {
  to: string;
  exact?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className:
          "inline-flex items-center gap-2 border-b-2 border-primary px-3 py-2 text-sm text-foreground font-medium",
      }}
    >
      {icon} {children}
    </Link>
  );
}

function AccountDashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <DashCard
        title="Mes commandes"
        text="Suivi, statut, historique de vos achats."
        to="/compte/commandes"
      />
      <DashCard
        title="Mes adresses"
        text="Gérez vos adresses de livraison."
        to="/compte/adresses"
      />
    </div>
  );
}

function DashCard({ title, text, to }: { title: string; text: string; to: string }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      <span className="mt-4 inline-block text-sm text-accent">Ouvrir →</span>
    </Link>
  );
}