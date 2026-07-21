import {
  createFileRoute,
  Link,
  Navigate,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminUpsertProduct,
  adminUploadProductPhoto,
  type ProductInput,
} from "@/lib/admin.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { CATEGORY_LABELS, BOOSTER_TYPE_PRESETS, formatPrice } from "@/lib/products";
import {
  useState,
  useMemo,
  useRef,
  useEffect,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  Loader2,
  X,
  AlertTriangle,
  ShieldCheck,
  FileText,
} from "lucide-react";

type WizardSlug = "cbd" | "e-liquide" | "accessoire-vape" | "accessoire-cbd";
type SimpleCategory = "cbd" | "accessoire_vape" | "accessoire_cbd";
type Intensity = "leger" | "modere" | "fort";

const SLUG_TO_CATEGORY: Record<Exclude<WizardSlug, "e-liquide">, SimpleCategory> = {
  cbd: "cbd",
  "accessoire-vape": "accessoire_vape",
  "accessoire-cbd": "accessoire_cbd",
};

export const Route = createFileRoute("/_authenticated/admin/produits/nouveau/$categorie")({
  ssr: false,
  component: WizardEntry,
});

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function generateSku(name: string) {
  const base = slugify(name).replace(/-/g, "").toUpperCase().slice(0, 8) || "SKU";
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);
  return `${base}-${suffix}`;
}

function WizardEntry() {
  const { categorie } = Route.useParams();
  const slug = categorie as WizardSlug;
  if (slug === "e-liquide") {
    return (
      <Navigate
        to="/admin/produits/eliquide/$id"
        params={{ id: "nouveau" }}
      />
    );
  }
  const category = SLUG_TO_CATEGORY[slug as Exclude<WizardSlug, "e-liquide">];
  if (!category) {
    return <Navigate to="/admin/produits/nouveau" />;
  }
  return <Wizard slug={slug} category={category} />;
}

type WizardState = {
  // Étape 1
  name: string;
  brand: string;
  photos: string[];
  // Étape 2
  priceEuros: string;
  stock: string;
  sku: string;
  descriptionShort: string;
  // Étape 3 — CBD
  cbd_percent: string;
  thc_percent: string;
  intensity: Intensity | "";
  coa_url: string;
  // Étape 3 — Accessoires (booster / flacon)
  is_nicotine_booster: boolean;
  booster_type: string;
  is_empty_bottle: boolean;
  volume_ml: string;
};

const STEP_LABELS = ["Base produit", "Vente", "Données métier", "Relecture"] as const;

function Wizard({ slug, category }: { slug: WizardSlug; category: SimpleCategory }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(adminUpsertProduct);
  const upload = useServerFn(adminUploadProductPhoto);

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [uploading, setUploading] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [state, setState] = useState<WizardState>({
    name: "",
    brand: "",
    photos: [],
    priceEuros: "",
    stock: "0",
    sku: "",
    descriptionShort: "",
    cbd_percent: "",
    thc_percent: "",
    intensity: "",
    coa_url: "",
    is_nicotine_booster: false,
    booster_type: "normale",
    is_empty_bottle: false,
    volume_ml: "",
  });

  // SKU auto-généré à la volée depuis le nom tant que l'admin n'y a pas touché.
  useEffect(() => {
    if (!skuTouched && state.name.trim().length >= 2) {
      setState((s) => ({ ...s, sku: generateSku(s.name) }));
    }
  }, [state.name, skuTouched]);

  const priceCents = useMemo(() => {
    const n = Number(state.priceEuros.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [state.priceEuros]);

  const stockNum = useMemo(() => {
    const n = parseInt(state.stock, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [state.stock]);

  const cbdNum = useMemo(() => parseFloatOr(state.cbd_percent), [state.cbd_percent]);
  const thcNum = useMemo(() => parseFloatOr(state.thc_percent), [state.thc_percent]);
  const volumeNum = useMemo(() => {
    const n = parseInt(state.volume_ml, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [state.volume_ml]);

  const errorsByStep = useMemo(() => validateAll({ state, category, priceCents, cbdNum, thcNum, volumeNum }), [
    state,
    category,
    priceCents,
    cbdNum,
    thcNum,
    volumeNum,
  ]);

  const currentErrors = errorsByStep[step];
  const totalErrors = errorsByStep.flat();
  const canPublish = totalErrors.length === 0;

  const thcOverLimit = category === "cbd" && thcNum !== null && thcNum > 0.3;

  const m = useMutation({
    mutationFn: (payload: ProductInput) => save({ data: payload }),
    onSuccess: async (row) => {
      toast.success("Produit créé.");
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      const newId = (row as { id?: string } | null)?.id;
      if (newId) {
        navigate({ to: "/admin/produits/$id", params: { id: newId } });
      } else {
        navigate({ to: "/admin/produits" });
      }
    },
    onError: (e) => toast.error((e as Error).message || "Enregistrement impossible."),
  });

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} : format non supporté.`);
          continue;
        }
        if (file.size > 4 * 1024 * 1024) {
          toast.error(`${file.name} : trop lourd (4 Mo max).`);
          continue;
        }
        try {
          const optimized = await optimizeImage(file);
          const res = await upload({
            data: {
              filename: optimized.filename,
              contentType: optimized.contentType,
              base64: optimized.base64,
            },
          });
          setState((s) => ({ ...s, photos: [...s.photos, res.url] }));
        } catch (err) {
          toast.error(`${file.name} : ${(err as Error).message}`);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(idx: number) {
    setState((s) => ({ ...s, photos: s.photos.filter((_, i) => i !== idx) }));
  }

  function tryAdvance() {
    setSubmitAttempted(true);
    if (currentErrors.length === 0) {
      setSubmitAttempted(false);
      setStep((s) => (s < 3 ? ((s + 1) as 0 | 1 | 2 | 3) : s));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goBack() {
    setSubmitAttempted(false);
    setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2 | 3) : s));
  }

  function buildPayload(publish: boolean): ProductInput {
    const finalSlug = slugify(state.name);
    const description = state.descriptionShort.trim();
    const brand = state.brand.trim();
    const composedDescription = brand
      ? `**Marque :** ${brand}${description ? `\n\n${description}` : ""}`
      : description;
    const stock = stockNum;
    const payload: ProductInput = {
      name: state.name.trim(),
      slug: finalSlug || slugify(`produit-${Date.now()}`),
      category,
      subcategory: "",
      description: composedDescription,
      price_cents: priceCents,
      currency: "EUR",
      stock,
      stock_status: stock === 0 ? "out_of_stock" : stock < 10 ? "low_stock" : "in_stock",
      is_published: publish,
      photos: state.photos,
      cbd_percent: category === "cbd" ? cbdNum : null,
      thc_percent: category === "cbd" ? thcNum : null,
      nicotine_mg: null,
      health_warnings: "",
      coa_url: category === "cbd" ? state.coa_url.trim() : "",
      volume_ml:
        category === "accessoire_vape" && state.is_empty_bottle ? volumeNum : null,
      variants: [],
      is_nicotine_booster:
        category === "accessoire_vape" && state.is_nicotine_booster,
      booster_type:
        category === "accessoire_vape" && state.is_nicotine_booster
          ? state.booster_type.trim() || "normale"
          : null,
      booster_product_id: null,
      empty_bottle_product_id: null,
      flavors: [],
    };
    return payload;
  }

  function publish() {
    setSubmitAttempted(true);
    if (!canPublish || thcOverLimit) return;
    m.mutate(buildPayload(true));
  }

  function saveDraft() {
    // On sauvegarde en brouillon même si des champs sont manquants, tant que
    // le minimum vital (nom) est présent — sinon la DB refuse.
    if (!state.name.trim() || state.name.trim().length < 2) {
      toast.error("Ajoute au moins un nom pour enregistrer en brouillon.");
      setStep(0);
      setSubmitAttempted(true);
      return;
    }
    m.mutate(buildPayload(false));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/admin/produits/nouveau"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Changer de catégorie
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold">
          Nouveau produit — {CATEGORY_LABELS[category]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Parcours guidé en 4 étapes. Aucune donnée n'est perdue entre les
          étapes ; tu peux revenir en arrière à tout moment.
        </p>
      </header>

      <ProgressBar step={step} />

      {submitAttempted && currentErrors.length > 0 && (
        <ErrorSummary errors={currentErrors} />
      )}

      <div className="rounded-lg border bg-card p-5">
        {step === 0 && (
          <StepBase
            state={state}
            setState={setState}
            category={category}
            photos={state.photos}
            onFiles={handleFiles}
            onRemovePhoto={removePhoto}
            uploading={uploading}
            fileInputRef={fileInputRef}
            showErrors={submitAttempted}
            errors={currentErrors}
          />
        )}
        {step === 1 && (
          <StepSale
            state={state}
            setState={setState}
            onSkuChange={() => setSkuTouched(true)}
            showErrors={submitAttempted}
            errors={currentErrors}
          />
        )}
        {step === 2 && (
          <StepMeta
            state={state}
            setState={setState}
            category={category}
            showErrors={submitAttempted}
            errors={currentErrors}
            thcOverLimit={thcOverLimit}
          />
        )}
        {step === 3 && (
          <StepReview
            slug={slug}
            category={category}
            state={state}
            priceCents={priceCents}
            stockNum={stockNum}
            cbdNum={cbdNum}
            thcNum={thcNum}
            volumeNum={volumeNum}
            errorsByStep={errorsByStep}
            canPublish={canPublish && !thcOverLimit}
            thcOverLimit={thcOverLimit}
            onEditStep={(s) => {
              setSubmitAttempted(false);
              setStep(s);
            }}
          />
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Étape précédente
            </button>
          ) : (
            <Link
              to="/admin/produits/nouveau"
              className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Annuler
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={m.isPending}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {m.isPending && !canPublish ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Enregistrer en brouillon
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={tryAdvance}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Étape suivante <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={publish}
              disabled={!canPublish || thcOverLimit || m.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {m.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Publier
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function parseFloatOr(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateAll(input: {
  state: WizardState;
  category: SimpleCategory;
  priceCents: number;
  cbdNum: number | null;
  thcNum: number | null;
  volumeNum: number | null;
}): string[][] {
  const { state, category, priceCents, cbdNum, thcNum, volumeNum } = input;
  const step0: string[] = [];
  const step1: string[] = [];
  const step2: string[] = [];

  if (state.name.trim().length < 2)
    step0.push("Le nom du produit est obligatoire (2 caractères min.).");
  if (state.photos.length === 0)
    step0.push("Ajoute au moins une photo produit.");

  if (priceCents <= 0) step1.push("Le prix doit être supérieur à 0 €.");
  if (state.descriptionShort.trim().length === 0)
    step1.push("Ajoute une description courte du produit.");

  if (category === "cbd") {
    if (cbdNum === null) step2.push("Renseigne le taux de CBD (%).");
    if (thcNum === null) step2.push("Renseigne le taux de THC (%).");
    if (thcNum !== null && thcNum > 0.3)
      step2.push(
        "Le taux de THC dépasse la limite légale française de 0,3 %. Publication bloquée.",
      );
    if (state.coa_url.trim().length === 0)
      step2.push("Ajoute le lien vers le certificat d'analyse.");
    if (state.intensity === "") step2.push("Choisis une intensité.");
  }
  if (category === "accessoire_vape") {
    if (state.is_nicotine_booster && state.booster_type.trim().length === 0)
      step2.push("Précise le type de booster de nicotine.");
    if (state.is_empty_bottle && (volumeNum === null || volumeNum <= 0))
      step2.push(
        "Renseigne la contenance du flacon vide en millilitres (>0).",
      );
  }

  return [step0, step1, step2, []];
}

function ProgressBar({ step }: { step: 0 | 1 | 2 | 3 }) {
  const pct = ((step + 1) / 4) * 100;
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">
          Étape {step + 1} sur 4
        </span>
        <span className="text-muted-foreground">{STEP_LABELS[step]}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="mt-2 grid grid-cols-4 gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {STEP_LABELS.map((l, i) => (
          <li
            key={l}
            className={`text-center ${i <= step ? "text-foreground" : ""}`}
          >
            {l}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ErrorSummary({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <p className="mb-1 flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" /> Corrige ces points avant de continuer
      </p>
      <ul className="list-inside list-disc space-y-1 text-xs">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function FieldError({
  show,
  errors,
  match,
}: {
  show: boolean;
  errors: string[];
  match: RegExp;
}) {
  if (!show) return null;
  const err = errors.find((e) => match.test(e));
  if (!err) return null;
  return <p className="mt-1 text-xs text-destructive">{err}</p>;
}

// ---------- Étape 1 ----------
function StepBase({
  state,
  setState,
  category,
  photos,
  onFiles,
  onRemovePhoto,
  uploading,
  fileInputRef,
  showErrors,
  errors,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  category: SimpleCategory;
  photos: string[];
  onFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (idx: number) => void;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showErrors: boolean;
  errors: string[];
}) {
  return (
    <div className="space-y-4">
      <SectionTitle>Base produit</SectionTitle>

      <div>
        <label className="text-sm font-medium">Nom du produit *</label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Ex : Fleur CBD Amnesia Haze"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          autoFocus
        />
        <FieldError show={showErrors} errors={errors} match={/^Le nom/} />
      </div>

      <div>
        <label className="text-sm font-medium">Marque (optionnel)</label>
        <input
          type="text"
          value={state.brand}
          onChange={(e) => setState((s) => ({ ...s, brand: e.target.value }))}
          placeholder="Ex : Green House Seeds"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Catégorie</label>
        <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
          <span className="rounded-md bg-background px-2 py-0.5 text-xs font-medium">
            {CATEGORY_LABELS[category]}
          </span>
          <span className="text-xs text-muted-foreground">
            (verrouillée pour ce parcours)
          </span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Photo(s) *</label>
        <div className="mt-2 flex flex-wrap gap-3">
          {photos.map((url, idx) => (
            <div
              key={url}
              className="group relative h-24 w-24 overflow-hidden rounded-md border"
            >
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemovePhoto(idx)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Retirer la photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Ajouter
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFiles}
              className="sr-only"
            />
          </label>
        </div>
        <FieldError show={showErrors} errors={errors} match={/photo/} />
      </div>
    </div>
  );
}

// ---------- Étape 2 ----------
function StepSale({
  state,
  setState,
  onSkuChange,
  showErrors,
  errors,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  onSkuChange: () => void;
  showErrors: boolean;
  errors: string[];
}) {
  return (
    <div className="space-y-4">
      <SectionTitle>Informations de vente</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Prix TTC (€) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={state.priceEuros}
            onChange={(e) =>
              setState((s) => ({ ...s, priceEuros: e.target.value }))
            }
            placeholder="9,90"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          />
          <FieldError show={showErrors} errors={errors} match={/prix/} />
        </div>
        <div>
          <label className="text-sm font-medium">Stock initial</label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={state.stock}
            onChange={(e) => setState((s) => ({ ...s, stock: e.target.value }))}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Référence interne (SKU)</label>
        <input
          type="text"
          value={state.sku}
          onChange={(e) => {
            onSkuChange();
            setState((s) => ({ ...s, sku: e.target.value }));
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base font-mono"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Générée automatiquement depuis le nom. Modifiable si besoin.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium">Description courte *</label>
        <textarea
          value={state.descriptionShort}
          onChange={(e) =>
            setState((s) => ({ ...s, descriptionShort: e.target.value }))
          }
          rows={4}
          placeholder="Une phrase ou deux pour présenter le produit."
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
        <FieldError show={showErrors} errors={errors} match={/description/} />
      </div>
    </div>
  );
}

// ---------- Étape 3 ----------
function StepMeta({
  state,
  setState,
  category,
  showErrors,
  errors,
  thcOverLimit,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  category: SimpleCategory;
  showErrors: boolean;
  errors: string[];
  thcOverLimit: boolean;
}) {
  if (category === "cbd") {
    return (
      <div className="space-y-4">
        <SectionTitle>Données spécifiques — CBD</SectionTitle>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Taux de CBD (%) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={state.cbd_percent}
              onChange={(e) =>
                setState((s) => ({ ...s, cbd_percent: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
            />
            <FieldError show={showErrors} errors={errors} match={/CBD/} />
          </div>
          <div>
            <label className="text-sm font-medium">Taux de THC (%) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={state.thc_percent}
              onChange={(e) =>
                setState((s) => ({ ...s, thc_percent: e.target.value }))
              }
              className={`mt-1 w-full rounded-md border bg-background px-3 py-2 text-base ${
                thcOverLimit
                  ? "border-destructive focus:outline-destructive"
                  : "border-input"
              }`}
            />
            <FieldError show={showErrors} errors={errors} match={/THC/i} />
          </div>
        </div>

        {thcOverLimit && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> Seuil légal dépassé
            </p>
            <p className="mt-1">
              La limite légale française est de 0,3 % de THC. La publication
              sera bloquée tant que ce taux n'est pas conforme.
            </p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Intensité *</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["leger", "modere", "fort"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setState((s) => ({ ...s, intensity: k as Intensity }))
                }
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  state.intensity === k
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input"
                }`}
              >
                {k === "leger" ? "Léger" : k === "modere" ? "Modéré" : "Fort"}
              </button>
            ))}
          </div>
          <FieldError show={showErrors} errors={errors} match={/intensité/i} />
        </div>

        <div>
          <label className="text-sm font-medium">
            Lien du certificat d'analyse *
          </label>
          <input
            type="url"
            value={state.coa_url}
            onChange={(e) =>
              setState((s) => ({ ...s, coa_url: e.target.value }))
            }
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          />
          <FieldError show={showErrors} errors={errors} match={/certificat/i} />
        </div>
      </div>
    );
  }

  // Accessoire Vape / CBD
  return (
    <div className="space-y-4">
      <SectionTitle>Données spécifiques — Accessoire</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Aucun champ métier n'est requis pour un accessoire standard. Coche une
        des options ci-dessous uniquement si ce produit joue un rôle technique
        de référence pour les e-liquides.
      </p>

      {category === "accessoire_vape" ? (
        <>
          <div className="rounded-md border p-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={state.is_nicotine_booster}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    is_nicotine_booster: e.target.checked,
                  }))
                }
                className="mt-1"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Ce produit est un booster de nicotine
                </p>
                <p className="text-xs text-muted-foreground">
                  Il servira de référence de prix pour calculer les e-liquides
                  boostés de ce type.
                </p>
              </div>
            </label>
            {state.is_nicotine_booster && (
              <div className="mt-3">
                <label className="text-sm font-medium">Type de booster</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {BOOSTER_TYPE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() =>
                        setState((s) => ({ ...s, booster_type: p.key }))
                      }
                      className={`rounded-md border px-3 py-1 text-xs ${
                        state.booster_type === p.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={state.booster_type}
                  onChange={(e) =>
                    setState((s) => ({ ...s, booster_type: e.target.value }))
                  }
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <FieldError show={showErrors} errors={errors} match={/booster/i} />
              </div>
            )}
          </div>

          <div className="rounded-md border p-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={state.is_empty_bottle}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    is_empty_bottle: e.target.checked,
                  }))
                }
                className="mt-1"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Ce produit est un flacon vide de transvasement
                </p>
                <p className="text-xs text-muted-foreground">
                  Il sera proposé en suggestion sur les e-liquides selon sa
                  contenance.
                </p>
              </div>
            </label>
            {state.is_empty_bottle && (
              <div className="mt-3">
                <label className="text-sm font-medium">Contenance (ml)</label>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={state.volume_ml}
                  onChange={(e) =>
                    setState((s) => ({ ...s, volume_ml: e.target.value }))
                  }
                  placeholder="ex. 120"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <FieldError show={showErrors} errors={errors} match={/contenance/i} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          Les accessoires CBD n'ont pas de rôle technique dans le calcul des
          e-liquides. Continue vers la relecture.
        </div>
      )}
    </div>
  );
}

// ---------- Étape 4 ----------
function StepReview({
  slug: _slug,
  category,
  state,
  priceCents,
  stockNum,
  cbdNum,
  thcNum,
  volumeNum,
  errorsByStep,
  canPublish,
  thcOverLimit,
  onEditStep,
}: {
  slug: WizardSlug;
  category: SimpleCategory;
  state: WizardState;
  priceCents: number;
  stockNum: number;
  cbdNum: number | null;
  thcNum: number | null;
  volumeNum: number | null;
  errorsByStep: string[][];
  canPublish: boolean;
  thcOverLimit: boolean;
  onEditStep: (s: 0 | 1 | 2 | 3) => void;
}) {
  const missing = errorsByStep.flat();
  return (
    <div className="space-y-5">
      <SectionTitle>Relecture avant publication</SectionTitle>

      {canPublish ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <ShieldCheck className="h-4 w-4" /> Prêt à publier
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Publication bloquée
            {thcOverLimit ? " — seuil légal de THC dépassé" : ""}
          </p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {missing.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <ReviewSection title="Base produit" onEdit={() => onEditStep(0)}>
        <ReviewRow label="Nom" value={state.name || "—"} />
        <ReviewRow label="Marque" value={state.brand || "—"} />
        <ReviewRow label="Catégorie" value={CATEGORY_LABELS[category]} />
        <ReviewRow
          label="Photos"
          value={
            state.photos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {state.photos.map((u) => (
                  <img
                    key={u}
                    src={u}
                    alt=""
                    className="h-14 w-14 rounded object-cover"
                  />
                ))}
              </div>
            ) : (
              "—"
            )
          }
        />
      </ReviewSection>

      <ReviewSection title="Vente" onEdit={() => onEditStep(1)}>
        <ReviewRow
          label="Prix TTC"
          value={priceCents > 0 ? formatPrice(priceCents) : "—"}
        />
        <ReviewRow label="Stock" value={String(stockNum)} />
        <ReviewRow label="Référence (SKU)" value={state.sku || "—"} />
        <ReviewRow
          label="Description"
          value={state.descriptionShort || "—"}
        />
      </ReviewSection>

      <ReviewSection title="Données métier" onEdit={() => onEditStep(2)}>
        {category === "cbd" ? (
          <>
            <ReviewRow
              label="Taux CBD"
              value={cbdNum !== null ? `${cbdNum} %` : "—"}
            />
            <ReviewRow
              label="Taux THC"
              value={
                thcNum !== null ? (
                  <span
                    className={thcOverLimit ? "font-medium text-destructive" : ""}
                  >
                    {thcNum} % {thcOverLimit ? "(hors seuil légal)" : ""}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <ReviewRow
              label="Intensité"
              value={
                state.intensity === "leger"
                  ? "Léger"
                  : state.intensity === "modere"
                    ? "Modéré"
                    : state.intensity === "fort"
                      ? "Fort"
                      : "—"
              }
            />
            <ReviewRow
              label="Certificat d'analyse"
              value={
                state.coa_url ? (
                  <a
                    href={state.coa_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    <FileText className="h-3 w-3" /> Ouvrir le lien
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </>
        ) : (
          <>
            <ReviewRow
              label="Booster de nicotine"
              value={
                state.is_nicotine_booster
                  ? `Oui (${state.booster_type || "normale"})`
                  : "Non"
              }
            />
            <ReviewRow
              label="Flacon vide"
              value={
                state.is_empty_bottle
                  ? `Oui — ${volumeNum ?? "?"} ml`
                  : "Non"
              }
            />
          </>
        )}
      </ReviewSection>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-medium">{children}</h2>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-primary hover:underline"
        >
          Modifier
        </button>
      </div>
      <dl className="divide-y text-sm">{children}</dl>
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[160px_1fr]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}