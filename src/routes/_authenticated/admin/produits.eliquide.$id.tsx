// Wizard e-liquide « borne de commande » : une décision par écran, barre
// de progression permanente, navigation avant/arrière sans perte de
// données. Seules les étapes 1 (informations) et 2 (mode de vente) sont
// implémentées à ce stade ; les étapes suivantes (goûts, formats, stocks,
// nicotine, relecture) seront ajoutées ultérieurement. Le lien discret
// « Utiliser l'ancien formulaire » retombe sur le formulaire e-liquide
// historique le temps que ce parcours soit complet.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Droplets,
  FlaskConical,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminGetProduct,
  adminUploadProductPhoto,
} from "@/lib/admin.functions";
import { optimizeImage } from "@/lib/image-optimize";
import {
  siteSettingsQueryOptions,
  DEFAULT_BOOSTER_CONFIG,
  type BoosterConfig,
} from "@/lib/site-settings.functions";

export const Route = createFileRoute(
  "/_authenticated/admin/produits/eliquide/$id",
)({
  ssr: false,
  component: ELiquideWizardEntry,
});

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type SalesMode = "small_only" | "large_only" | "both";

type Flavor = {
  id: string;
  name: string;
  image: string | null;
  active: boolean;
};

type SmallFormatConfig = {
  nicotineMg: number[]; // taux cochés parmi NICOTINE_10ML_OPTIONS
  priceCents: number;
};

type LargeFormatRow = {
  id: string;
  volumeMl: number; // volume de base
  bottleCapacityMl: number; // capacité réelle du flacon
  priceCents: number;
};

type MatrixCell = {
  stock: number;
  sku: string;
  active: boolean;
};

type WizardData = {
  // Étape 1 — informations produit
  name: string;
  brand: string;
  shortDescription: string;
  description: string;
  mainPhoto: string | null;
  photos: string[]; // photos secondaires (hors principale)
  pgVg: string;
  country: string;
  // Étape 2 — comment est-il vendu
  salesMode: SalesMode | null;
  // Étape 3 — goûts (communs à tous les formats)
  flavors: Flavor[];
  // Étape 4 — formats & stocks
  smallFormat: SmallFormatConfig;
  largeFormats: LargeFormatRow[];
  // Matrice combinatoire : clé stable dérivée du goût + format.
  matrix: Record<string, MatrixCell>;
};

const EMPTY: WizardData = {
  name: "",
  brand: "",
  shortDescription: "",
  description: "",
  mainPhoto: null,
  photos: [],
  pgVg: "",
  country: "",
  salesMode: null,
  flavors: [],
  smallFormat: { nicotineMg: [], priceCents: 0 },
  largeFormats: [],
  matrix: {},
};

const NICOTINE_10ML_OPTIONS = [0, 3, 6, 9, 10, 11, 12, 16, 20] as const;

// -------------------------------------------------------------------
// Structure du parcours — active/inactive selon salesMode. Seules les
// étapes 1 et 2 sont visitables actuellement ; les suivantes sont
// pré-déclarées pour que la barre de progression affiche le bon total.
// -------------------------------------------------------------------

type StepId =
  | "info"
  | "mode"
  | "flavors"
  | "small_format"
  | "large_format"
  | "nicotine"
  | "review";

type StepDef = { id: StepId; label: string; implemented: boolean };

function buildSteps(mode: SalesMode | null): StepDef[] {
  const steps: StepDef[] = [
    { id: "info", label: "Informations du produit", implemented: true },
    { id: "mode", label: "Mode de vente", implemented: true },
    { id: "flavors", label: "Goûts", implemented: true },
  ];
  if (mode) {
    steps.push({ id: "formats", label: "Formats et stocks", implemented: true });
  }
  steps.push({ id: "review", label: "Relecture & publication", implemented: false });
  return steps;
}

// -------------------------------------------------------------------
// Persistance locale entre étapes (résiste à un rafraîchissement).
// -------------------------------------------------------------------

const storageKey = (id: string) => `bnv:eliquide-wizard:${id}`;

function loadDraft(id: string): WizardData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardData>;
    return { ...EMPTY, ...parsed };
  } catch {
    return null;
  }
}

function saveDraft(id: string, data: WizardData) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(id), JSON.stringify(data));
  } catch {
    /* quota exceeded — ignore */
  }
}

// -------------------------------------------------------------------
// Route entry
// -------------------------------------------------------------------

function ELiquideWizardEntry() {
  const { id } = Route.useParams();
  const isNew = id === "nouveau";
  const get = useServerFn(adminGetProduct);
  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: () => get({ data: { id } }),
    enabled: !isNew,
    retry: false,
  });

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du produit…
      </div>
    );
  }

  return <Wizard productId={id} existing={existing ?? null} />;
}

// -------------------------------------------------------------------
// Wizard
// -------------------------------------------------------------------

function Wizard({
  productId,
  existing,
}: {
  productId: string;
  existing: Awaited<ReturnType<typeof adminGetProduct>> | null;
}) {
  const isNew = productId === "nouveau";

  // Hydrate le brouillon depuis sessionStorage, sinon depuis le produit
  // existant. Les champs non encore stockés en base (marque, PG/VG, pays,
  // description courte) restent vides à l'édition tant que le schéma
  // n'est pas étendu par les étapes suivantes.
  const initial = useMemo<WizardData>(() => {
    const draft = loadDraft(productId);
    if (draft) return draft;
    if (existing) {
      const photos = Array.isArray(existing.photos) ? existing.photos : [];
      return {
        ...EMPTY,
        name: existing.name ?? "",
        description: existing.description ?? "",
        mainPhoto: photos[0] ?? null,
        photos: photos.slice(1),
      };
    }
    return EMPTY;
  }, [productId, existing]);

  const [data, setData] = useState<WizardData>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = useMemo(() => buildSteps(data.salesMode), [data.salesMode]);
  const currentStep = steps[stepIndex] ?? steps[0];

  // Persiste à chaque changement.
  useEffect(() => {
    saveDraft(productId, data);
  }, [productId, data]);

  // Si le mode de vente change et fait disparaître l'étape courante, on
  // recale sur la dernière étape valide.
  useEffect(() => {
    if (stepIndex >= steps.length) setStepIndex(steps.length - 1);
  }, [stepIndex, steps.length]);

  const patch = (p: Partial<WizardData>) => setData((d) => ({ ...d, ...p }));

  const canAdvance = (() => {
    if (currentStep.id === "info") {
      return data.name.trim().length >= 2 && data.description.trim().length > 0;
    }
    if (currentStep.id === "mode") {
      return data.salesMode !== null;
    }
    if (currentStep.id === "flavors") {
      // On autorise le passage même sans goût (produit à saveur unique).
      return true;
    }
    return false;
  })();

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };
  const goNext = () => {
    const next = steps[stepIndex + 1];
    if (!next) return;
    if (!next.implemented) {
      toast.info(
        `L'étape « ${next.label} » sera ajoutée dans une prochaine mise à jour.`,
      );
      return;
    }
    setStepIndex(stepIndex + 1);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      {/* Barre supérieure — retour & lien de secours */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/produits/nouveau"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Choisir un autre type
        </Link>
        <Link
          to="/admin/produits/$id"
          params={{ id: isNew ? "nouveau-eliquide" : productId }}
          className="text-xs text-muted-foreground underline hover:text-foreground"
          title="Bascule vers l'ancien formulaire complet en attendant que ce parcours soit finalisé."
        >
          Utiliser l'ancien formulaire
        </Link>
      </div>

      {/* Barre de progression */}
      <ProgressBar steps={steps} currentIndex={stepIndex} />

      {/* Contenu de l'étape */}
      <div className="rounded-xl border border-border bg-card/40 p-6">
        {currentStep.id === "info" ? (
          <StepInfo data={data} onPatch={patch} productId={productId} />
        ) : currentStep.id === "mode" ? (
          <StepMode data={data} onPatch={patch} />
        ) : currentStep.id === "flavors" ? (
          <StepFlavors data={data} onPatch={patch} />
        ) : (
          <StepPlaceholder label={currentStep.label} />
        )}
      </div>

      {/* Navigation bas de page — gros boutons */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!canAdvance}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-40"
        >
          Continuer <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Barre de progression
// -------------------------------------------------------------------

function ProgressBar({
  steps,
  currentIndex,
}: {
  steps: StepDef[];
  currentIndex: number;
}) {
  const pct = ((currentIndex + 1) / steps.length) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Étape {currentIndex + 1} sur {steps.length}
        </span>
        <span className="truncate">{steps[currentIndex]?.label}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Étape 1 — informations produit
// -------------------------------------------------------------------

function StepInfo({
  data,
  onPatch,
  productId,
}: {
  data: WizardData;
  onPatch: (p: Partial<WizardData>) => void;
  productId: string;
}) {
  const upload = useServerFn(adminUploadProductPhoto);
  const [uploading, setUploading] = useState<"main" | "extra" | null>(null);
  const mainRef = useRef<HTMLInputElement | null>(null);
  const extraRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    slot: "main" | "extra",
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(slot);
    try {
      const optimized = await optimizeImage(file);
      const res = await upload({
        data: {
          filename: optimized.filename,
          contentType: optimized.contentType,
          base64: optimized.base64,
        },
      });
      if (slot === "main") onPatch({ mainPhoto: res.url });
      else onPatch({ photos: [...data.photos, res.url] });
    } catch (err) {
      toast.error((err as Error).message || "Envoi impossible.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Informations du produit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Comment ce liquide s'appelle-t-il, et à quoi ressemble-t-il ?
        </p>
      </div>

      <Field label="Nom du produit" required>
        <input
          className="input h-11 text-base"
          value={data.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Ex. Frozen Mango"
          autoFocus
        />
      </Field>

      <Field label="Marque" hint="Optionnel">
        <input
          className="input h-11 text-base"
          value={data.brand}
          onChange={(e) => onPatch({ brand: e.target.value })}
          placeholder="Ex. Vape Institut"
        />
      </Field>

      <Field label="Description courte" hint="Une phrase — sert d'accroche en boutique">
        <input
          className="input h-11 text-base"
          value={data.shortDescription}
          onChange={(e) => onPatch({ shortDescription: e.target.value })}
          placeholder="Ex. Mangue glacée intense"
          maxLength={140}
        />
      </Field>

      <Field label="Description complète" required>
        <textarea
          className="input min-h-32 text-base"
          value={data.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="Notes de dégustation, atmosphère, conseils…"
        />
      </Field>

      {/* Photo principale */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Image principale</div>
        {data.mainPhoto ? (
          <div className="relative inline-block">
            <img
              src={data.mainPhoto}
              alt=""
              className="h-40 w-40 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={() => onPatch({ mainPhoto: null })}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
              title="Retirer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => mainRef.current?.click()}
            disabled={uploading === "main"}
            className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
          >
            {uploading === "main" ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Upload className="h-6 w-6" />
                Ajouter une image
              </>
            )}
          </button>
        )}
        <input
          ref={mainRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleUpload(e, "main")}
        />
      </div>

      {/* Photos secondaires */}
      <div className="space-y-2">
        <div className="text-sm font-medium">
          Images secondaires{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optionnel)
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.photos.map((url, i) => (
            <div key={`${url}-${i}`} className="relative">
              <img
                src={url}
                alt=""
                className="h-24 w-24 rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    photos: data.photos.filter((_, j) => j !== i),
                  })
                }
                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => extraRef.current?.click()}
            disabled={uploading === "extra"}
            className="flex h-24 w-24 items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
          >
            {uploading === "extra" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </button>
        </div>
        <input
          ref={extraRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleUpload(e, "extra")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ratio PG/VG" hint="Optionnel — ex. 50/50, 30/70">
          <input
            className="input h-11 text-base"
            value={data.pgVg}
            onChange={(e) => onPatch({ pgVg: e.target.value })}
            placeholder="Ex. 50/50"
          />
        </Field>
        <Field label="Pays de fabrication" hint="Optionnel">
          <input
            className="input h-11 text-base"
            value={data.country}
            onChange={(e) => onPatch({ country: e.target.value })}
            placeholder="Ex. France"
          />
        </Field>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Étape 2 — mode de vente
// -------------------------------------------------------------------

const MODE_CARDS: Array<{
  value: SalesMode;
  title: string;
  helper: string;
  detail: string;
  Icon: typeof Droplets;
}> = [
  {
    value: "small_only",
    title: "Uniquement en 10 ml",
    helper: "Fioles prêtes à l'emploi",
    detail: "Taux de nicotine fixes (0, 6, 12, 18 mg). Aucun booster.",
    Icon: Droplets,
  },
  {
    value: "large_only",
    title: "Uniquement en grand format",
    helper: "50, 100 ou 200 ml + boosters",
    detail: "Le client compose son taux via des boosters de nicotine.",
    Icon: FlaskConical,
  },
  {
    value: "both",
    title: "Les deux",
    helper: "10 ml et grand format",
    detail: "Chaque format sera configuré séparément dans les étapes suivantes.",
    Icon: Layers,
  },
];

function StepMode({
  data,
  onPatch,
}: {
  data: WizardData;
  onPatch: (p: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">
          Comment ce liquide est-il vendu ?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ce choix détermine les formats et la gestion de la nicotine dans
          les étapes suivantes. Tu pourras revenir le modifier à tout moment.
        </p>
      </div>

      <div className="grid gap-3">
        {MODE_CARDS.map((c) => {
          const selected = data.salesMode === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onPatch({ salesMode: c.value })}
              className={`flex items-start gap-4 rounded-xl border-2 p-5 text-left transition-colors ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background/40 hover:border-primary/40"
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                  selected ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <c.Icon className="h-6 w-6" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{c.title}</h3>
                  {selected && (
                    <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {c.helper}
                </p>
                <p className="mt-2 text-xs text-muted-foreground/80">
                  {c.detail}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Étape placeholder — pour les étapes 3+ pas encore construites
// -------------------------------------------------------------------

function StepPlaceholder({ label }: { label: string }) {
  return (
    <div className="space-y-3 text-center">
      <h2 className="text-xl font-semibold">{label}</h2>
      <p className="text-sm text-muted-foreground">
        Cette étape sera construite dans une prochaine mise à jour. En
        attendant, utilise « l'ancien formulaire » en haut de page pour
        finaliser la fiche produit.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------
// Étape 3 — goûts
// -------------------------------------------------------------------

function newFlavorId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function StepFlavors({
  data,
  onPatch,
}: {
  data: WizardData;
  onPatch: (p: Partial<WizardData>) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const upload = useServerFn(adminUploadProductPhoto);

  const flavors = data.flavors;

  const update = (next: Flavor[]) => onPatch({ flavors: next });

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= flavors.length) return;
    const copy = flavors.slice();
    [copy[index], copy[target]] = [copy[target], copy[index]];
    update(copy);
  };

  const toggle = (id: string) =>
    update(flavors.map((f) => (f.id === id ? { ...f, active: !f.active } : f)));

  const remove = (id: string) => {
    const flavor = flavors.find((f) => f.id === id);
    if (!flavor) return;
    if (!window.confirm(`Supprimer le goût « ${flavor.name || "sans nom"} » ?`)) {
      return;
    }
    update(flavors.filter((f) => f.id !== id));
  };

  const duplicate = (id: string) => {
    const idx = flavors.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const src = flavors[idx];
    const copy = flavors.slice();
    copy.splice(idx + 1, 0, {
      ...src,
      id: newFlavorId(),
      name: `${src.name} (copie)`.trim(),
    });
    update(copy);
  };

  const resetDraft = () => {
    setDraftName("");
    setDraftImage(null);
    setShowForm(false);
  };

  const addFlavor = () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Donne un nom au goût avant de l'ajouter.");
      return;
    }
    update([
      ...flavors,
      { id: newFlavorId(), name, image: draftImage, active: true },
    ]);
    resetDraft();
  };

  const handleDraftUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const optimized = await optimizeImage(file);
      const res = await upload({
        data: {
          filename: optimized.filename,
          contentType: optimized.contentType,
          base64: optimized.base64,
        },
      });
      setDraftImage(res.url);
    } catch (err) {
      toast.error((err as Error).message || "Envoi impossible.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Goûts du produit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Liste les saveurs proposées. Le stock sera saisi plus tard, à
          l'étape « Formats et stocks », une fois les contenances définies.
        </p>
      </div>

      {flavors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun goût pour l'instant. Tu peux en ajouter, ou passer directement
          à l'étape suivante : le produit sera vendu sans variante de saveur.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-16 px-2 py-2 text-left">Ordre</th>
                <th className="w-20 px-2 py-2 text-left">Image</th>
                <th className="px-2 py-2 text-left">Goût</th>
                <th className="w-20 px-2 py-2 text-center">Actif</th>
                <th className="w-28 px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flavors.map((f, i) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="rounded border border-border p-1 hover:bg-secondary disabled:opacity-30"
                        title="Monter"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === flavors.length - 1}
                        className="rounded border border-border p-1 hover:bg-secondary disabled:opacity-30"
                        title="Descendre"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {f.image ? (
                      <img
                        src={f.image}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="input h-9 w-full text-base"
                      value={f.name}
                      onChange={(e) =>
                        update(
                          flavors.map((x) =>
                            x.id === f.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={f.active}
                      onChange={() => toggle(f.id)}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => duplicate(f.id)}
                        className="rounded border border-border p-1.5 hover:bg-secondary"
                        title="Dupliquer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(f.id)}
                        className="rounded border border-border p-1.5 text-destructive hover:bg-destructive/10"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm ? (
        <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
          <div className="text-sm font-semibold">Nouveau goût</div>
          <Field label="Nom du goût" required>
            <input
              className="input h-11 text-base"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Ex. Fraise"
              autoFocus
            />
          </Field>
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Image{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (optionnel)
              </span>
            </div>
            {draftImage ? (
              <div className="relative inline-block">
                <img
                  src={draftImage}
                  alt=""
                  className="h-24 w-24 rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => setDraftImage(null)}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex h-24 w-24 items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleDraftUpload}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetDraft}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={addFlavor}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Ajouter un goût
        </button>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Composants utilitaires
// -------------------------------------------------------------------

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-sm font-medium">
        <span>
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </span>
        {hint && (
          <span className="text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}