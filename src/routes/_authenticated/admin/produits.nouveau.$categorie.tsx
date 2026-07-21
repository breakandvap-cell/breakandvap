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
  Scale,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

type WizardSlug = "cbd" | "e-liquide" | "accessoire-vape" | "accessoire-cbd";
type SimpleCategory = "cbd" | "accessoire_vape" | "accessoire_cbd";
type Intensity = "leger" | "modere" | "fort";
type CbdSaleMode = "weight" | "packs";
type ProductKind = "simple" | "variants";

type WeightTier = { from_g: string; price_per_g: string };
type SachetPack = { weight_g: string; price_euros: string; stock: string };
type VariantChoice = {
  value: string;
  priceEuros: string;
  stock: string;
  sku: string;
};

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
  // Étape 2 (mode CBD) / Étape 2 classique
  sale_mode: CbdSaleMode; // uniquement utilisé pour CBD
  weight_tiers: WeightTier[];
  weight_stock_g: string;
  sachets: SachetPack[];
  // Étape Vente classique
  priceEuros: string;
  stock: string;
  sku: string;
  descriptionShort: string;
  // Étape Métier — CBD
  cbd_percent: string;
  thc_percent: string;
  intensity: Intensity | "";
  coa_url: string;
  // Étape Métier — Accessoires (booster / flacon)
  is_nicotine_booster: boolean;
  booster_type: string;
  is_empty_bottle: boolean;
  volume_ml: string;
};

const STEP_LABELS_DEFAULT = ["Base produit", "Vente", "Données métier", "Relecture"] as const;
const STEP_LABELS_CBD = [
  "Base produit",
  "Mode de vente",
  "Vente",
  "Données métier",
  "Relecture",
] as const;
const STEP_LABELS_ACCESSOIRE_VAPE = [
  "Base produit",
  "Type de produit",
  "Vente",
  "Données métier",
  "Relecture",
] as const;

function getStepLabels(category: SimpleCategory): readonly string[] {
  if (category === "cbd") return STEP_LABELS_CBD;
  if (category === "accessoire_vape") return STEP_LABELS_ACCESSOIRE_VAPE;
  return STEP_LABELS_DEFAULT;
}

function newTier(from_g = "1", price_per_g = ""): WeightTier {
  return { from_g, price_per_g };
}
function newSachet(weight_g = "", price_euros = "", stock = "0"): SachetPack {
  return { weight_g, price_euros, stock };
}
function newVariantChoice(value = "", priceEuros = "", stock = "0", sku = ""): VariantChoice {
  return { value, priceEuros, stock, sku };
}

function Wizard({ slug, category }: { slug: WizardSlug; category: SimpleCategory }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(adminUpsertProduct);
  const upload = useServerFn(adminUploadProductPhoto);

  const stepLabels = getStepLabels(category);
  const lastStep = stepLabels.length - 1;
  const [step, setStep] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [state, setState] = useState<WizardState>({
    name: "",
    brand: "",
    photos: [],
    sale_mode: "weight",
    weight_tiers: [newTier("1", ""), newTier("5", ""), newTier("10", "")],
    weight_stock_g: "0",
    sachets: [newSachet("1", "", "0")],
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
    product_kind: "simple",
    variant_attribute_name: "",
    variant_choices: [newVariantChoice()],
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

  const parsedWeight = useMemo(() => parseWeightTiers(state.weight_tiers), [state.weight_tiers]);
  const parsedSachets = useMemo(() => parseSachets(state.sachets), [state.sachets]);

  const errorsByStep = useMemo(() => validateAll({ state, category, priceCents, cbdNum, thcNum, volumeNum, parsedWeight, parsedSachets }), [
    state,
    category,
    priceCents,
    cbdNum,
    thcNum,
    volumeNum,
    parsedWeight,
    parsedSachets,
  ]);

  const currentErrors = errorsByStep[step];
  const totalErrors = errorsByStep.flat();
  const canPublish = totalErrors.length === 0;

  const thcOverLimit = category === "cbd" && thcNum !== null && thcNum > 0.3;
  const cbdConforme =
    category === "cbd" && thcNum !== null && cbdNum !== null && !thcOverLimit;

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
      setStep((s) => (s < lastStep ? s + 1 : s));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goBack() {
    setSubmitAttempted(false);
    setStep((s) => (s > 0 ? s - 1 : s));
  }

  function buildPayload(publish: boolean): ProductInput {
    const finalSlug = slugify(state.name);
    const description = state.descriptionShort.trim();
    const brand = state.brand.trim();
    const modeNote =
      category === "cbd"
        ? state.sale_mode === "weight"
          ? "\n\n_Mode de vente : au poids (paliers dégressifs)._"
          : "\n\n_Mode de vente : sachets préparés._"
        : "";
    const composedDescription = (brand
      ? `**Marque :** ${brand}${description ? `\n\n${description}` : ""}`
      : description) + modeNote;

    // Résout stock / prix / variantes selon le mode CBD choisi.
    let effectivePriceCents = priceCents;
    let effectiveStock = stockNum;
    let variants: ProductInput["variants"] = [];

    if (category === "cbd") {
      if (state.sale_mode === "weight") {
        const stockG = parseInt(state.weight_stock_g, 10) || 0;
        effectiveStock = stockG;
        // Prix de référence = prix du palier le plus bas (petite quantité).
        const first = parsedWeight[0];
        effectivePriceCents = first ? Math.round(first.price_per_g * 100) : 0;
        // Un unique "variant" en 1g qui porte les paliers dégressifs.
        variants = [
          {
            volume_ml: 1,
            price_cents: effectivePriceCents,
            stock: stockG,
            available_nicotine_mg: [],
            nicotine_type: "normale",
            is_active: true,
            sku: `${slugify(state.name).replace(/-/g, "").toUpperCase().slice(0, 8) || "CBDG"}-1G`,
            quantity_tiers: parsedWeight.map((t) => ({
              min_qty: t.from_g,
              max_qty: null,
              price_cents: Math.round(t.price_per_g * 100),
            })),
          },
        ];
      } else {
        // Sachets préparés : une variante par format (volume_ml sert de poids g).
        variants = parsedSachets.map((p) => ({
          volume_ml: p.weight_g,
          price_cents: Math.round(p.price_euros * 100),
          stock: p.stock,
          available_nicotine_mg: [],
          nicotine_type: "normale",
          is_active: true,
          sku: `${slugify(state.name).replace(/-/g, "").toUpperCase().slice(0, 8) || "CBDG"}-${p.weight_g}G`,
        }));
        effectiveStock = parsedSachets.reduce((sum, p) => sum + p.stock, 0);
        // Prix affiché = plus petit sachet.
        const cheapest = [...parsedSachets].sort((a, b) => a.price_euros - b.price_euros)[0];
        effectivePriceCents = cheapest ? Math.round(cheapest.price_euros * 100) : 0;
      }
    }

    const payload: ProductInput = {
      name: state.name.trim(),
      slug: finalSlug || slugify(`produit-${Date.now()}`),
      category,
      subcategory: "",
      description: composedDescription,
      price_cents: effectivePriceCents,
      currency: "EUR",
      stock: effectiveStock,
      stock_status:
        effectiveStock === 0 ? "out_of_stock" : effectiveStock < 10 ? "low_stock" : "in_stock",
      is_published: publish,
      photos: state.photos,
      cbd_percent: category === "cbd" ? cbdNum : null,
      thc_percent: category === "cbd" ? thcNum : null,
      nicotine_mg: null,
      health_warnings: "",
      coa_url: category === "cbd" ? state.coa_url.trim() : "",
      volume_ml:
        category === "accessoire_vape" && state.is_empty_bottle ? volumeNum : null,
      variants,
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
          Parcours guidé en {stepLabels.length} étapes. Aucune donnée n'est
          perdue entre les étapes ; tu peux revenir en arrière à tout moment.
        </p>
      </header>

      <ProgressBar step={step} labels={stepLabels} />

      {submitAttempted && currentErrors.length > 0 && (
        <ErrorSummary errors={currentErrors} />
      )}

      <div className="rounded-lg border bg-card p-5">
        {renderStep({
          category,
          step,
          state,
          setState,
          slug,
          onSkuChange: () => setSkuTouched(true),
          submitAttempted,
          currentErrors,
          errorsByStep,
          thcOverLimit,
          cbdConforme,
          canPublish,
          priceCents,
          stockNum,
          cbdNum,
          thcNum,
          volumeNum,
          parsedWeight,
          parsedSachets,
          photos: state.photos,
          onFiles: handleFiles,
          onRemovePhoto: removePhoto,
          uploading,
          fileInputRef,
          onEditStep: (s: number) => {
            setSubmitAttempted(false);
            setStep(s);
          },
        })}
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
          {step < lastStep ? (
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
  parsedWeight: ParsedTier[];
  parsedSachets: ParsedSachet[];
}): string[][] {
  const { state, category, priceCents, cbdNum, thcNum, volumeNum, parsedWeight, parsedSachets } = input;
  const base: string[] = [];
  if (state.name.trim().length < 2)
    base.push("Le nom du produit est obligatoire (2 caractères min.).");
  if (state.photos.length === 0) base.push("Ajoute au moins une photo produit.");

  const meta: string[] = [];
  if (category === "cbd") {
    if (cbdNum === null) meta.push("Renseigne le taux de CBD (%).");
    if (thcNum === null) meta.push("Renseigne le taux de THC (%).");
    if (thcNum !== null && thcNum > 0.3)
      meta.push("Le taux de THC dépasse la limite légale française de 0,3 %. Publication bloquée.");
    if (state.coa_url.trim().length === 0)
      meta.push("Ajoute le lien vers le certificat d'analyse.");
    if (state.intensity === "") meta.push("Choisis une intensité.");
  }
  if (category === "accessoire_vape") {
    if (state.is_nicotine_booster && state.booster_type.trim().length === 0)
      meta.push("Précise le type de booster de nicotine.");
    if (state.is_empty_bottle && (volumeNum === null || volumeNum <= 0))
      meta.push("Renseigne la contenance du flacon vide en millilitres (>0).");
  }

  if (category === "cbd") {
    // Étape 1 (Mode) : pas d'erreur bloquante (sélection par défaut).
    const modeErrors: string[] = [];
    // Étape 2 (Vente CBD)
    const sale: string[] = [];
    if (state.sale_mode === "weight") {
      if (parsedWeight.length === 0)
        sale.push("Ajoute au moins un palier de prix au poids.");
      // Validation croissance / décroissance / doublons.
      for (let i = 0; i < parsedWeight.length; i++) {
        const t = parsedWeight[i];
        if (!Number.isFinite(t.from_g) || t.from_g < 1)
          sale.push(`Palier ${i + 1} : quantité de départ invalide.`);
        if (!Number.isFinite(t.price_per_g) || t.price_per_g <= 0)
          sale.push(`Palier ${i + 1} : prix au gramme invalide.`);
      }
      const seen = new Set<number>();
      for (const t of parsedWeight) {
        if (seen.has(t.from_g))
          sale.push(`Doublon de quantité de départ : ${t.from_g} g.`);
        seen.add(t.from_g);
      }
      const sorted = [...parsedWeight].sort((a, b) => a.from_g - b.from_g);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].price_per_g >= sorted[i - 1].price_per_g)
          sale.push(
            `Le prix doit décroître à chaque palier (à ${sorted[i].from_g} g).`,
          );
      }
      const stockG = parseInt(state.weight_stock_g, 10) || 0;
      if (stockG <= 0) sale.push("Renseigne un stock total (grammes) > 0.");
    } else {
      if (parsedSachets.length === 0)
        sale.push("Ajoute au moins un format de sachet.");
      for (let i = 0; i < parsedSachets.length; i++) {
        const p = parsedSachets[i];
        if (!Number.isFinite(p.weight_g) || p.weight_g <= 0)
          sale.push(`Sachet ${i + 1} : poids invalide.`);
        if (!Number.isFinite(p.price_euros) || p.price_euros <= 0)
          sale.push(`Sachet ${i + 1} : prix invalide.`);
      }
      const seenP = new Set<number>();
      for (const p of parsedSachets) {
        if (seenP.has(p.weight_g))
          sale.push(`Doublon de format : ${p.weight_g} g.`);
        seenP.add(p.weight_g);
      }
    }
    if (state.descriptionShort.trim().length === 0)
      sale.push("Ajoute une description courte du produit.");
    return [base, modeErrors, sale, meta, []];
  }

  // Catégories non-CBD : parcours 4 étapes.
  const classicSale: string[] = [];
  if (priceCents <= 0) classicSale.push("Le prix doit être supérieur à 0 €.");
  if (state.descriptionShort.trim().length === 0)
    classicSale.push("Ajoute une description courte du produit.");
  return [base, classicSale, meta, []];
}

type ParsedTier = { from_g: number; price_per_g: number };
function parseWeightTiers(raw: WeightTier[]): ParsedTier[] {
  const out: ParsedTier[] = [];
  for (const t of raw) {
    const from = parseInt(t.from_g, 10);
    const price = Number(t.price_per_g.replace(",", "."));
    if (!Number.isFinite(from) || !Number.isFinite(price)) continue;
    out.push({ from_g: from, price_per_g: price });
  }
  return out;
}

type ParsedSachet = { weight_g: number; price_euros: number; stock: number };
function parseSachets(raw: SachetPack[]): ParsedSachet[] {
  const out: ParsedSachet[] = [];
  for (const p of raw) {
    const w = Number(p.weight_g.replace(",", "."));
    const price = Number(p.price_euros.replace(",", "."));
    const stock = parseInt(p.stock, 10);
    if (!Number.isFinite(w) || !Number.isFinite(price)) continue;
    out.push({
      weight_g: w,
      price_euros: price,
      stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
    });
  }
  return out;
}

function ProgressBar({ step, labels }: { step: number; labels: readonly string[] }) {
  const total = labels.length;
  const pct = ((step + 1) / total) * 100;
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">
          Étape {step + 1} sur {total}
        </span>
        <span className="text-muted-foreground">{labels[step]}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol
        className="mt-2 grid gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {labels.map((l, i) => (
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

// ---------- Router d'étapes ----------
type RenderStepArgs = {
  category: SimpleCategory;
  step: number;
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  slug: WizardSlug;
  onSkuChange: () => void;
  submitAttempted: boolean;
  currentErrors: string[];
  errorsByStep: string[][];
  thcOverLimit: boolean;
  cbdConforme: boolean;
  canPublish: boolean;
  priceCents: number;
  stockNum: number;
  cbdNum: number | null;
  thcNum: number | null;
  volumeNum: number | null;
  parsedWeight: ParsedTier[];
  parsedSachets: ParsedSachet[];
  photos: string[];
  onFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (idx: number) => void;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onEditStep: (s: number) => void;
};

function renderStep(a: RenderStepArgs) {
  const isCbd = a.category === "cbd";
  // Séquence : CBD → [Base, Mode, Vente, Meta, Review], autres → [Base, Vente, Meta, Review].
  if (isCbd) {
    switch (a.step) {
      case 0:
        return (
          <StepBase state={a.state} setState={a.setState} category={a.category} photos={a.photos} onFiles={a.onFiles} onRemovePhoto={a.onRemovePhoto} uploading={a.uploading} fileInputRef={a.fileInputRef} showErrors={a.submitAttempted} errors={a.currentErrors} />
        );
      case 1:
        return <StepMode state={a.state} setState={a.setState} />;
      case 2:
        return (
          <StepSaleCbd
            state={a.state}
            setState={a.setState}
            onSkuChange={a.onSkuChange}
            showErrors={a.submitAttempted}
            errors={a.currentErrors}
            parsedWeight={a.parsedWeight}
            parsedSachets={a.parsedSachets}
          />
        );
      case 3:
        return (
          <StepMeta state={a.state} setState={a.setState} category={a.category} showErrors={a.submitAttempted} errors={a.currentErrors} thcOverLimit={a.thcOverLimit} cbdConforme={a.cbdConforme} />
        );
      case 4:
        return (
          <StepReview
            slug={a.slug}
            category={a.category}
            state={a.state}
            priceCents={a.priceCents}
            stockNum={a.stockNum}
            cbdNum={a.cbdNum}
            thcNum={a.thcNum}
            volumeNum={a.volumeNum}
            errorsByStep={a.errorsByStep}
            canPublish={a.canPublish && !a.thcOverLimit}
            thcOverLimit={a.thcOverLimit}
            parsedWeight={a.parsedWeight}
            parsedSachets={a.parsedSachets}
            onEditStep={a.onEditStep}
          />
        );
    }
  }
  switch (a.step) {
    case 0:
      return (
        <StepBase state={a.state} setState={a.setState} category={a.category} photos={a.photos} onFiles={a.onFiles} onRemovePhoto={a.onRemovePhoto} uploading={a.uploading} fileInputRef={a.fileInputRef} showErrors={a.submitAttempted} errors={a.currentErrors} />
      );
    case 1:
      return (
        <StepSale state={a.state} setState={a.setState} onSkuChange={a.onSkuChange} showErrors={a.submitAttempted} errors={a.currentErrors} />
      );
    case 2:
      return (
        <StepMeta state={a.state} setState={a.setState} category={a.category} showErrors={a.submitAttempted} errors={a.currentErrors} thcOverLimit={a.thcOverLimit} cbdConforme={a.cbdConforme} />
      );
    case 3:
      return (
        <StepReview
          slug={a.slug}
          category={a.category}
          state={a.state}
          priceCents={a.priceCents}
          stockNum={a.stockNum}
          cbdNum={a.cbdNum}
          thcNum={a.thcNum}
          volumeNum={a.volumeNum}
          errorsByStep={a.errorsByStep}
          canPublish={a.canPublish && !a.thcOverLimit}
          thcOverLimit={a.thcOverLimit}
          parsedWeight={a.parsedWeight}
          parsedSachets={a.parsedSachets}
          onEditStep={a.onEditStep}
        />
      );
  }
  return null;
}

// ---------- Étape « Mode de vente » (CBD) ----------
function StepMode({
  state,
  setState,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
}) {
  const options: Array<{
    key: CbdSaleMode;
    title: string;
    desc: string;
    icon: ReactNode;
  }> = [
    {
      key: "weight",
      title: "Vente au poids",
      desc: "Le stock est géré en grammes, avec des paliers de prix dégressifs (ex. 1 g = 8 €, 5 g = 7 €/g, 10 g = 6 €/g).",
      icon: <Scale className="h-6 w-6" />,
    },
    {
      key: "packs",
      title: "Sachets préparés",
      desc: "Chaque format (1 g, 3 g, 5 g…) est une variante avec son propre prix et son propre stock.",
      icon: <Package className="h-6 w-6" />,
    },
  ];
  return (
    <div className="space-y-4">
      <SectionTitle>Comment vendez-vous ce produit CBD&nbsp;?</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Ce choix conditionne la façon dont l'étape suivante s'affiche. Tu peux
        revenir en arrière plus tard sans perdre tes saisies.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const active = state.sale_mode === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setState((s) => ({ ...s, sale_mode: o.key }))}
              className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                  : "border-input hover:border-primary/50"
              }`}
            >
              <div className={`rounded-md p-2 ${active ? "bg-primary/15 text-primary" : "bg-muted"}`}>
                {o.icon}
              </div>
              <div className="font-medium">{o.title}</div>
              <p className="text-xs text-muted-foreground">{o.desc}</p>
              {active && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <Check className="h-3 w-3" /> Sélectionné
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Étape « Vente » CBD (au poids ou sachets) ----------
function StepSaleCbd({
  state,
  setState,
  onSkuChange,
  showErrors,
  errors,
  parsedWeight,
  parsedSachets,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  onSkuChange: () => void;
  showErrors: boolean;
  errors: string[];
  parsedWeight: ParsedTier[];
  parsedSachets: ParsedSachet[];
}) {
  const isWeight = state.sale_mode === "weight";

  function updateTier(idx: number, patch: Partial<WeightTier>) {
    setState((s) => ({
      ...s,
      weight_tiers: s.weight_tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  }
  function addTier() {
    const last = state.weight_tiers[state.weight_tiers.length - 1];
    const nextFrom = last ? String((parseInt(last.from_g, 10) || 0) + 5) : "1";
    setState((s) => ({ ...s, weight_tiers: [...s.weight_tiers, newTier(nextFrom, "")] }));
  }
  function removeTier(idx: number) {
    setState((s) => ({ ...s, weight_tiers: s.weight_tiers.filter((_, i) => i !== idx) }));
  }
  function updateSachet(idx: number, patch: Partial<SachetPack>) {
    setState((s) => ({
      ...s,
      sachets: s.sachets.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }
  function addSachet() {
    setState((s) => ({ ...s, sachets: [...s.sachets, newSachet("", "", "0")] }));
  }
  function removeSachet(idx: number) {
    setState((s) => ({ ...s, sachets: s.sachets.filter((_, i) => i !== idx) }));
  }

  // Aperçu temps réel : palier gagnant sur qques quantités indicatives.
  const previewQuantities = [1, 3, 5, 10, 20];
  const bestPricePerG = (q: number): number | null => {
    if (parsedWeight.length === 0) return null;
    const eligible = parsedWeight.filter((t) => q >= t.from_g);
    if (eligible.length === 0) return null;
    return eligible.sort((a, b) => a.price_per_g - b.price_per_g)[0].price_per_g;
  };

  return (
    <div className="space-y-5">
      <SectionTitle>
        {isWeight ? "Vente au poids — paliers tarifaires" : "Sachets préparés — formats"}
      </SectionTitle>

      {isWeight ? (
        <>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">À partir de (g)</th>
                  <th className="px-3 py-2 text-left">Prix par gramme (€)</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.weight_tiers.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={t.from_g}
                        onChange={(e) => updateTier(i, { from_g: e.target.value })}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={t.price_per_g}
                        onChange={(e) => updateTier(i, { price_per_g: e.target.value })}
                        placeholder="ex. 8,00"
                        className="w-32 rounded-md border border-input bg-background px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeTier(i)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addTier}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Ajouter un palier
          </button>

          <FieldError show={showErrors} errors={errors} match={/palier|décroîtr|Doublon|départ/i} />

          <div>
            <label className="text-sm font-medium">Stock total disponible (g) *</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={state.weight_stock_g}
              onChange={(e) => setState((s) => ({ ...s, weight_stock_g: e.target.value }))}
              className="mt-1 w-40 rounded-md border border-input bg-background px-3 py-2 text-base"
            />
            <FieldError show={showErrors} errors={errors} match={/stock total/i} />
          </div>

          {parsedWeight.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p className="mb-2 font-medium text-foreground">
                Aperçu — prix appliqué au client
              </p>
              <table className="w-full">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">Quantité</th>
                    <th className="text-left font-normal">Prix / g</th>
                    <th className="text-left font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewQuantities.map((q) => {
                    const p = bestPricePerG(q);
                    return (
                      <tr key={q} className="border-t border-border/50">
                        <td className="py-1">{q} g</td>
                        <td className="py-1">{p !== null ? `${p.toFixed(2)} €` : "—"}</td>
                        <td className="py-1 font-medium">
                          {p !== null ? `${(p * q).toFixed(2)} €` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Poids (g)</th>
                  <th className="px-3 py-2 text-left">Prix (€)</th>
                  <th className="px-3 py-2 text-left">Stock</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.sachets.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={p.weight_g}
                        onChange={(e) => updateSachet(i, { weight_g: e.target.value })}
                        placeholder="ex. 3"
                        className="w-24 rounded-md border border-input bg-background px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={p.price_euros}
                        onChange={(e) => updateSachet(i, { price_euros: e.target.value })}
                        placeholder="ex. 24,00"
                        className="w-28 rounded-md border border-input bg-background px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={p.stock}
                        onChange={(e) => updateSachet(i, { stock: e.target.value })}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeSachet(i)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addSachet}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Ajouter un sachet
          </button>
          <FieldError show={showErrors} errors={errors} match={/Sachet|Doublon|format/i} />

          {parsedSachets.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p className="mb-2 font-medium text-foreground">Aperçu — grille client</p>
              <div className="flex flex-wrap gap-2">
                {parsedSachets.map((p, i) => (
                  <div key={i} className="rounded border bg-background px-3 py-2">
                    <div className="font-medium">{p.weight_g} g</div>
                    <div className="text-muted-foreground">{p.price_euros.toFixed(2)} €</div>
                    <div className="text-[10px] text-muted-foreground">
                      Stock : {p.stock}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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
      </div>

      <div>
        <label className="text-sm font-medium">Description courte *</label>
        <textarea
          value={state.descriptionShort}
          onChange={(e) => setState((s) => ({ ...s, descriptionShort: e.target.value }))}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
        <FieldError show={showErrors} errors={errors} match={/description/i} />
      </div>
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
  cbdConforme,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  category: SimpleCategory;
  showErrors: boolean;
  errors: string[];
  thcOverLimit: boolean;
  cbdConforme: boolean;
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

        {cbdConforme && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Conforme — THC ≤ 0,3 % (limite légale française respectée)
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
  parsedWeight,
  parsedSachets,
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
  parsedWeight: ParsedTier[];
  parsedSachets: ParsedSachet[];
  onEditStep: (s: number) => void;
}) {
  const missing = errorsByStep.flat();
  const isCbd = category === "cbd";
  // Indices d'édition : CBD → [Base 0, Mode 1, Vente 2, Meta 3]. Autres → [0,1,2].
  const idxBase = 0;
  const idxSale = isCbd ? 2 : 1;
  const idxMeta = isCbd ? 3 : 2;
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

      <ReviewSection title="Base produit" onEdit={() => onEditStep(idxBase)}>
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

      <ReviewSection title="Vente" onEdit={() => onEditStep(idxSale)}>
        {isCbd ? (
          state.sale_mode === "weight" ? (
            <>
              <ReviewRow label="Mode de vente" value="Au poids (paliers dégressifs)" />
              <ReviewRow
                label="Paliers"
                value={
                  parsedWeight.length > 0 ? (
                    <ul className="space-y-0.5 text-xs">
                      {[...parsedWeight]
                        .sort((a, b) => a.from_g - b.from_g)
                        .map((t) => (
                          <li key={t.from_g}>
                            À partir de <strong>{t.from_g} g</strong> —{" "}
                            {t.price_per_g.toFixed(2)} €/g
                          </li>
                        ))}
                    </ul>
                  ) : (
                    "—"
                  )
                }
              />
              <ReviewRow
                label="Stock total"
                value={`${parseInt(state.weight_stock_g, 10) || 0} g`}
              />
              <ReviewRow label="Description" value={state.descriptionShort || "—"} />
            </>
          ) : (
            <>
              <ReviewRow label="Mode de vente" value="Sachets préparés" />
              <ReviewRow
                label="Formats"
                value={
                  parsedSachets.length > 0 ? (
                    <ul className="space-y-0.5 text-xs">
                      {parsedSachets.map((p) => (
                        <li key={p.weight_g}>
                          <strong>{p.weight_g} g</strong> — {p.price_euros.toFixed(2)} € · stock{" "}
                          {p.stock}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "—"
                  )
                }
              />
              <ReviewRow label="Description" value={state.descriptionShort || "—"} />
            </>
          )
        ) : (
          <>
            <ReviewRow
              label="Prix TTC"
              value={priceCents > 0 ? formatPrice(priceCents) : "—"}
            />
            <ReviewRow label="Stock" value={String(stockNum)} />
            <ReviewRow label="Référence (SKU)" value={state.sku || "—"} />
            <ReviewRow label="Description" value={state.descriptionShort || "—"} />
          </>
        )}
      </ReviewSection>

      <ReviewSection title="Données métier" onEdit={() => onEditStep(idxMeta)}>
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