import { createFileRoute, Link } from "@tanstack/react-router";
import { Leaf, Droplets, Zap, Sparkles, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/produits/nouveau")({
  ssr: false,
  component: NewProductChoice,
});

type Choice = {
  slug: "cbd" | "e-liquide" | "accessoire-vape" | "accessoire-cbd";
  title: string;
  helper: string;
  time: string;
  icon: typeof Leaf;
  accent: string;
};

const CHOICES: Choice[] = [
  {
    slug: "cbd",
    title: "CBD",
    helper: "Fleurs, résines, huiles, infusions…",
    time: "environ 45 secondes",
    icon: Leaf,
    accent: "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-400",
  },
  {
    slug: "e-liquide",
    title: "E-liquide",
    helper: "Fiole avec contenance, nicotine et parfum",
    time: "environ 3 à 5 minutes",
    icon: Droplets,
    accent: "border-sky-500/40 bg-sky-500/5 hover:border-sky-400",
  },
  {
    slug: "accessoire-vape",
    title: "Accessoire Vape",
    helper: "Batteries, résistances, flacons vides, boosters…",
    time: "environ 45 secondes",
    icon: Zap,
    accent: "border-amber-500/40 bg-amber-500/5 hover:border-amber-400",
  },
  {
    slug: "accessoire-cbd",
    title: "Accessoire CBD",
    helper: "Grinders, papiers, briquets, feuilles…",
    time: "environ 45 secondes",
    icon: Sparkles,
    accent: "border-fuchsia-500/40 bg-fuchsia-500/5 hover:border-fuchsia-400",
  },
];

function NewProductChoice() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/produits"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la liste
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Nouveau produit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choisis la catégorie du produit à créer. Le formulaire s'adapte à
          chaque type pour n'afficher que les champs pertinents.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHOICES.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.slug}
              to="/admin/produits/nouveau/$categorie"
              params={{ categorie: c.slug }}
              className={`group flex flex-col gap-3 rounded-lg border p-5 transition-colors ${c.accent}`}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/60 p-2">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-medium">{c.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{c.helper}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                Durée : {c.time}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}