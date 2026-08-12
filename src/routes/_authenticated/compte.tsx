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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAdmin as isAdminFn } from "@/lib/admin.functions";
import { ShieldCheck, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeFrPhone } from "@/routes/auth";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

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
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Espace client
            </p>
            <h1
              className="mt-1 text-2xl sm:text-3xl break-words"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Bonjour{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>

        <nav className="mt-8 -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:flex-wrap sm:gap-2 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabLink to="/compte" exact icon={<UserIcon className="h-4 w-4" />}>
            Tableau de bord
          </TabLink>
          <TabLink to="/compte/commandes" icon={<Package className="h-4 w-4" />}>
            Mes commandes
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

        <MissingPhoneBanner />

        <div className="mt-8">
          {isIndex ? <AccountDashboard isAdmin={isAdmin} /> : <Outlet />}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function MissingPhoneBanner() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["me", "profile-phone", user?.id ?? "none"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const normalized = normalizeFrPhone(phone);
      if (!normalized) throw new Error("Numéro invalide (ex. 06 12 34 56 78).");
      const { error } = await supabase
        .from("profiles")
        .update({ phone: normalized })
        .eq("id", user!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Téléphone enregistré");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["me", "profile-phone"] });
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  if (!profile || profile.phone) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <div className="flex items-start gap-3">
        <PhoneCall className="mt-0.5 h-5 w-5 text-amber-400" />
        <div className="flex-1">
          <p className="font-medium text-amber-100">
            Complétez votre numéro de téléphone
          </p>
          <p className="mt-1 text-amber-100/80">
            Le téléphone est désormais requis pour faciliter la livraison de vos commandes.
            Merci de renseigner un numéro français valide.
          </p>
          {open ? (
            <form onSubmit={onSubmit} className="mt-3 flex flex-wrap gap-2">
              <input
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input flex-1 min-w-[200px]"
              />
              <button
                type="submit"
                disabled={save.isPending}
                className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
              >
                {save.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-secondary"
              >
                Annuler
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
            >
              Ajouter mon téléphone
            </button>
          )}
        </div>
      </div>
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
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className:
          "inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-primary px-3 py-2 text-sm text-foreground font-medium",
      }}
    >
      {icon} {children}
    </Link>
  );
}

function AccountDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
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
      {isAdmin ? (
        <DashCard
          title="Espace admin"
          text="Gérer les produits, commandes et clients."
          to="/admin"
        />
      ) : null}
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