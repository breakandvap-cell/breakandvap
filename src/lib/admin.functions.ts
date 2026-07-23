import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertUpdateTransition,
  assertDeliverTransition,
  assertCancelTransition,
  assertRefundAllowed,
  type OrderStatus,
} from "@/lib/order-transitions";

const productInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  // Marque optionnelle : sert uniquement à composer la référence SKU
  // (segment MARQUE en 6 caractères). Non persistée en colonne dédiée —
  // la marque figure déjà dans `description` via le wizard.
  brand: z.string().trim().max(60).optional().or(z.literal("")),
  slug: z
    .preprocess(
      // Défense en profondeur : si le wizard laisse passer un slug avec
      // accents / majuscules / espaces / apostrophes, on le normalise ici
      // plutôt que de bloquer l'admin avec une erreur technique.
      (v) =>
        typeof v === "string"
          ? v
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 160)
          : v,
      z
        .string()
        .min(2, "L'adresse URL (slug) est vide — renseigne un nom de produit.")
        .max(160)
        .regex(/^[a-z0-9-]+$/, "Adresse URL invalide (lettres a-z, chiffres, tirets)."),
    ),
  category: z.enum([
    "cbd",
    "e_liquide",
    "accessoire_vape",
    "accessoire_cbd",
  ]),
  subcategory: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  price_cents: z.number().int().min(0).max(1_000_000),
  currency: z.string().trim().length(3).default("EUR"),
  stock: z.number().int().min(0).max(100_000),
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock"]),
  is_published: z.boolean(),
  photos: z.array(z.string().url()).max(10).default([]),
  cbd_percent: z.number().min(0).max(100).nullable().optional(),
  thc_percent: z.number().min(0).max(100).nullable().optional(),
  nicotine_mg: z.number().min(0).max(50).nullable().optional(),
  health_warnings: z.string().trim().max(2000).optional().or(z.literal("")),
  coa_url: z.string().url().optional().or(z.literal("")),
  // Contenance en ml du produit (utilisé principalement pour les flacons
  // vides du catalogue « Accessoires Vape »). Facultatif.
  volume_ml: z.number().int().positive().max(10_000).nullable().optional(),
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        volume_ml: z.number().int().positive().max(10_000),
        price_cents: z.number().int().min(0).max(1_000_000),
        stock: z.number().int().min(0).max(100_000),
        // Ancien champ, gardé optionnel pour compatibilité rétro.
        max_nicotine_mg: z.number().int().min(0).max(50).nullable().optional(),
        // Taux de nicotine autorisés côté client pour cette variante.
        available_nicotine_mg: z
          .array(z.number().int().min(0).max(50))
          .max(20)
          .default([]),
        // Type de nicotine (libre) : normale, sel, ice, ou tout nouveau type
        // défini par l'admin. Sert à faire le lien avec le produit booster
        // correspondant coché comme « booster de nicotine ».
        nicotine_type: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .optional()
          .default("normale"),
        // Capacité physique maximale de boosters que le flacon peut contenir.
        // Facultatif : si non renseigné, aucune limite n'est appliquée.
        max_boosters: z.number().int().min(0).max(20).nullable().optional(),
        // Photo spécifique optionnelle qui remplace la photo principale
        // lorsque cette variante est sélectionnée sur la fiche produit.
        photo_url: z.string().url().nullable().optional().or(z.literal("")),
        // Référence interne courte, unique par variante. Générée automatiquement
        // si vide, modifiable par l'admin.
        sku: z.string().trim().max(40).optional().or(z.literal("")),
        // Désactivée = disparaît du catalogue mais reste dans l'historique.
        is_active: z.boolean().optional(),
        // Paliers de prix dégressif optionnels (par variante).
        quantity_tiers: z
          .array(
            z.object({
              min_qty: z.number().int().min(1).max(10_000),
              max_qty: z.number().int().min(1).max(10_000).nullable().optional(),
              price_cents: z.number().int().min(0).max(1_000_000),
            }),
          )
          .max(10)
          .optional(),
        // Flacon vide suggéré spécifiquement pour cette contenance.
        empty_bottle_product_id: z.string().uuid().nullable().optional(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  // Indique que ce produit est un booster de nicotine (plusieurs autorisés,
  // un par type). Sert à identifier le prix de référence côté e-liquides.
  is_nicotine_booster: z.boolean().optional().default(false),
  // Clé du type de booster (normale / sel / ice / …). Renseignée uniquement
  // pour les accessoires vape marqués comme booster.
  booster_type: z.string().trim().min(1).max(40).nullable().optional(),
  // Liens optionnels vers d'autres produits « Accessoires Vape » utilisés
  // pour personnaliser le calcul et les suggestions d'un e-liquide.
  booster_product_id: z.string().uuid().nullable().optional(),
  empty_bottle_product_id: z.string().uuid().nullable().optional(),
  flavors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        stock: z.number().int().min(0).max(100_000),
        // Photo optionnelle par goût : remplace la photo principale du
        // produit quand ce goût est sélectionné côté boutique.
        photo: z.string().url().nullable().optional().or(z.literal("")),
        sku: z.string().trim().max(40).optional().or(z.literal("")),
        is_active: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional()
    .default([]),
});
export type ProductInput = z.infer<typeof productInputSchema>;

const orderStatusSchema = z.enum(["a_preparer", "expediee", "livree", "annulee"]);

type AdminContext = { supabase: any; userId: string };

async function assertAdmin(context: AdminContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé.");
}

async function logAction(
  adminId: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Record<string, unknown> | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_action_log").insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details as never,
  });
}

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });

export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) return { claimed: false };
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (insErr) throw new Error(insErr.message);
    return { claimed: true };
  });

export const adminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [toPrep, shipped, total, low, latest] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("status", "a_preparer"),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("status", "expediee"),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("id, name, stock, stock_status").in("stock_status", ["low_stock", "out_of_stock"]).order("stock", { ascending: true }).limit(10),
      supabaseAdmin.from("orders").select("id, order_number, status, total_cents, currency, created_at, guest_email, user_id").order("created_at", { ascending: false }).limit(8),
    ]);
    // ---- Santé des boosters de nicotine référencés par les e-liquides ----
    // Un e-liquide dont une variante active a `nicotine_type = X` s'attend à
    // trouver un produit booster publié avec `is_nicotine_booster=true` et
    // `booster_type = X`. Si ce lien est cassé (produit non publié, flag
    // retiré, ou aucun booster de ce type), la création de commande échoue
    // avec « Aucun booster de nicotine « X » disponible ». On expose ici les
    // écarts pour les afficher dans le tableau de bord admin.
    const [refsRes, boostersRes] = await Promise.all([
      supabaseAdmin
        .from("product_variants")
        .select("nicotine_type, is_active, max_boosters, product_id, products!product_variants_product_id_fkey!inner(is_published, category)")
        .eq("is_active", true)
        .eq("products.is_published", true)
        .eq("products.category", "e_liquide"),
      supabaseAdmin
        .from("products")
        .select("id, name, is_published, booster_type, stock_status")
        .eq("is_nicotine_booster", true),
    ]);
    const referencedTypes = new Set<string>();
    for (const v of (refsRes.data ?? []) as Array<{
      nicotine_type: string | null;
      max_boosters: number | null;
    }>) {
      // Seules les variantes qui utilisent réellement des boosters comptent
      // (max_boosters > 0). Les 10 ml prêts-à-l'emploi n'ont pas besoin d'une
      // référence de prix booster.
      if ((v.max_boosters ?? 0) <= 0) continue;
      const t = (v.nicotine_type ?? "normale").toString().trim().toLowerCase() || "normale";
      referencedTypes.add(t);
    }
    const boosterIssues: Array<{
      type: string;
      issue: "missing" | "unpublished" | "out_of_stock";
      product: { id: string; name: string } | null;
    }> = [];
    const boostersRaw = (boostersRes.data ?? []) as Array<{
      id: string;
      name: string;
      is_published: boolean;
      booster_type: string | null;
      stock_status: string | null;
    }>;
    // On vérifie systématiquement les 3 types standards (normale/sel/ice),
    // même si aucun e-liquide ne les référence encore, pour alerter l'admin
    // avant qu'un nouveau produit e-liquide ne tombe sur un booster manquant.
    const KNOWN_BOOSTER_TYPES = ["normale", "sel", "ice"] as const;
    for (const t of KNOWN_BOOSTER_TYPES) referencedTypes.add(t);
    for (const type of referencedTypes) {
      const matches = boostersRaw.filter(
        (b) => (b.booster_type ?? "normale").toString().trim().toLowerCase() === type,
      );
      if (matches.length === 0) {
        boosterIssues.push({ type, issue: "missing", product: null });
        continue;
      }
      const published = matches.filter((b) => b.is_published);
      if (published.length === 0) {
        const first = matches[0];
        boosterIssues.push({
          type,
          issue: "unpublished",
          product: { id: first.id, name: first.name },
        });
        continue;
      }
      // Booster épuisé : la commande passera (le prix est stocké), mais on
      // signale quand même pour que l'admin réappro le stock booster.
      const inStock = published.find((b) => b.stock_status !== "out_of_stock");
      if (!inStock) {
        const first = published[0];
        boosterIssues.push({
          type,
          issue: "out_of_stock",
          product: { id: first.id, name: first.name },
        });
      }
    }
    return {
      counts: {
        toPrepare: toPrep.count ?? 0,
        shipped: shipped.count ?? 0,
        totalProducts: total.count ?? 0,
      },
      lowStock: low.data ?? [],
      latestOrders: latest.data ?? [],
      boosterIssues,
    };
  });

const listProductsSchema = z.object({
  category: z
    .enum(["cbd", "e_liquide", "accessoire_vape", "accessoire_cbd"])
    .optional()
    .or(z.literal("")),
  status: z.enum(["published", "draft", "out_of_stock"]).optional().or(z.literal("")),
});

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listProductsSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("products")
      .select("id, name, slug, category, price_cents, currency, stock, stock_status, is_published, updated_at")
      .order("updated_at", { ascending: false });
    if (data.category) q = q.eq("category", data.category);
    if (data.status === "published") q = q.eq("is_published", true);
    else if (data.status === "draft") q = q.eq("is_published", false);
    else if (data.status === "out_of_stock") q = q.eq("stock_status", "out_of_stock");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminGetProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("products").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Produit introuvable.");
    return row;
  });

export const adminUpsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    return upsertProductCore(context, data);
  });

async function upsertProductCore(
  context: AdminContext,
  data: ProductInput,
): Promise<{ id: string }> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // ---- Garde-fou : empêche de casser silencieusement un booster référencé ----
    // Si le produit est actuellement marqué comme booster de nicotine et qu'un
    // ou plusieurs e-liquides référencent son type via `nicotine_type`, on
    // refuse tout changement qui retirerait ce statut (catégorie hors
    // accessoire_vape, décochage du flag booster, ou changement de
    // booster_type). L'admin doit d'abord reconfigurer les e-liquides.
    if (data.id) {
      const { data: existing } = await supabaseAdmin
        .from("products")
        .select("is_nicotine_booster, booster_type, category")
        .eq("id", data.id)
        .maybeSingle();
      if (existing?.is_nicotine_booster) {
        const currentType = (existing.booster_type ?? "normale")
          .toString()
          .trim()
          .toLowerCase();
        const nextIsBooster =
          data.category === "accessoire_vape" && Boolean(data.is_nicotine_booster);
        const nextType = nextIsBooster
          ? ((data.booster_type ?? "normale").toString().trim().toLowerCase() || "normale")
          : null;
        const wouldBreak =
          !nextIsBooster || nextType !== currentType;
        if (wouldBreak) {
          // Cherche les e-liquides qui référencent ce type via une variante active.
          const { data: refs } = await supabaseAdmin
            .from("product_variants")
            .select("nicotine_type, product_id, products!product_variants_product_id_fkey!inner(id, name, category)")
            .eq("is_active", true)
            .eq("products.category", "e_liquide");
          const impacted = new Map<string, string>();
          for (const r of (refs ?? []) as Array<{
            nicotine_type: string | null;
            products: { id: string; name: string } | null;
          }>) {
            const t = (r.nicotine_type ?? "normale").toString().trim().toLowerCase();
            if (t === currentType && r.products) {
              impacted.set(r.products.id, r.products.name);
            }
          }
          if (impacted.size > 0) {
            const names = Array.from(impacted.values()).slice(0, 8).join(", ");
            const more = impacted.size > 8 ? ` (+${impacted.size - 8} autres)` : "";
            throw new Error(
              `Changement refusé : ce produit est le booster « ${currentType} » utilisé par ${impacted.size} e-liquide(s) : ${names}${more}. Reconfigure ces e-liquides d'abord, ou crée un autre booster de type « ${currentType} » avant de modifier celui-ci.`,
            );
          }
        }
      }
    }
    const payload = {
      name: data.name,
      slug: data.slug,
      category: data.category,
      subcategory: data.subcategory || null,
      description: data.description || null,
      price_cents: data.price_cents,
      currency: data.currency || "EUR",
      stock: data.stock,
      stock_status: data.stock_status,
      is_published: data.is_published,
      photos: data.photos ?? [],
      cbd_percent: data.cbd_percent ?? null,
      thc_percent: data.thc_percent ?? null,
      nicotine_mg: data.nicotine_mg ?? null,
      health_warnings: data.health_warnings || null,
      coa_url: data.coa_url || null,
      volume_ml:
        data.category === "accessoire_vape" && data.volume_ml
          ? data.volume_ml
          : null,
      is_nicotine_booster:
        data.category === "accessoire_vape" ? Boolean(data.is_nicotine_booster) : false,
      booster_type:
        data.category === "accessoire_vape" && Boolean(data.is_nicotine_booster)
          ? (data.booster_type ?? "normale").toString().trim().toLowerCase() ||
            "normale"
          : null,
      booster_product_id:
        data.category === "e_liquide" ? data.booster_product_id ?? null : null,
      empty_bottle_product_id:
        data.category === "e_liquide" ? data.empty_bottle_product_id ?? null : null,
      flavors: ((data.flavors ?? []).map((f) => ({
        name: f.name,
        stock: f.stock,
        photo: (f as { photo?: string | null }).photo ?? null,
        sku:
          ((f as { sku?: string }).sku ?? "").toString().trim() ||
          buildFlavorSku(data.brand ?? "", data.name, f.name),
        is_active: (f as { is_active?: boolean }).is_active ?? true,
      }))) as never,
      updated_by: context.userId,
    };
    // Plusieurs boosters simultanés sont désormais autorisés : le rôle n'est
    // plus exclusif. La différenciation se fait via `booster_type`.
    let productId: string;
    if (data.id) {
      const { data: row, error } = await supabaseAdmin.from("products").update(payload).eq("id", data.id).select("id").single();
      if (error) throw new Error(error.message);
      productId = row.id;
      await logAction(context.userId, "product.update", "product", productId, { name: data.name });
    } else {
      const { data: row, error } = await supabaseAdmin.from("products").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      productId = row.id;
      await logAction(context.userId, "product.create", "product", productId, { name: data.name });
    }

    // Sync variants/contenances. Les wizards de création ET d'édition passent
    // par ce chemin unique : on met à jour les lignes existantes, on ajoute les
    // nouvelles et on désactive celles qui ont été retirées.
    const submittedVariants = data.variants ?? [];
    if (submittedVariants.length > 0) {
      // Fetch current variants (all rows for this product)
      const { data: existingVariants } = await supabaseAdmin
        .from("product_variants")
        .select("id, sku, volume_ml, nicotine_type")
        .eq("product_id", productId);
      // Règle : dès qu'une contenance a max_boosters > 0, on matérialise
      // automatiquement les 3 types de nicotine (normale/sel/ice) pour que
      // le client dispose systématiquement du choix complet. Le formulaire
      // admin n'expose qu'une seule ligne par volume : c'est ici qu'on la
      // décompose. Sur les flacons prêts à l'emploi (max_boosters = 0),
      // on garde une seule variante (type = normale).
      const NICOTINE_TYPES_WITH_BOOSTER = ["normale", "sel", "ice"] as const;
      type ExpandedVariant = (typeof submittedVariants)[number] & {
        _expandedType: string;
      };
      const expanded: ExpandedVariant[] = [];
      for (const v of submittedVariants) {
        const cap =
          typeof v.max_boosters === "number" && Number.isFinite(v.max_boosters)
            ? Math.max(0, Math.trunc(v.max_boosters))
            : 0;
        if (data.category === "e_liquide" && cap > 0) {
          for (const t of NICOTINE_TYPES_WITH_BOOSTER) {
            expanded.push({ ...v, _expandedType: t });
          }
        } else {
          const t = (v.nicotine_type ?? "normale").toString().trim().toLowerCase() || "normale";
          expanded.push({ ...v, _expandedType: t });
        }
      }
      // Index des variantes existantes par (volume_ml, nicotine_type) pour
      // retrouver l'id à mettre à jour et éviter de casser l'historique.
      const existingByKey = new Map<string, { id: string; sku: string | null }>();
      for (const ev of (existingVariants ?? []) as Array<{
        id: string;
        sku: string | null;
        volume_ml: number;
        nicotine_type: string | null;
      }>) {
        const t = (ev.nicotine_type ?? "normale").toString().trim().toLowerCase() || "normale";
        existingByKey.set(`${ev.volume_ml}::${t}`, { id: ev.id, sku: ev.sku });
      }
      // Soft-delete : toute variante existante qui ne correspond plus à une
      // combinaison (volume, type) soumise est désactivée (is_active=false),
      // afin de préserver l'historique des commandes qui la référencent.
      const submittedKeys = new Set(
        expanded.map((v) => `${v.volume_ml}::${v._expandedType}`),
      );
      const toDeactivate: string[] = [];
      for (const ev of (existingVariants ?? []) as Array<{
        id: string;
        volume_ml: number;
        nicotine_type: string | null;
      }>) {
        const t = (ev.nicotine_type ?? "normale").toString().trim().toLowerCase() || "normale";
        if (!submittedKeys.has(`${ev.volume_ml}::${t}`)) toDeactivate.push(ev.id);
      }
      if (toDeactivate.length > 0) {
        await supabaseAdmin
          .from("product_variants")
          .update({ is_active: false } as never)
          .in("id", toDeactivate);
      }

      // Génération SKU auto pour nouvelles variantes / champs vides.
      const existingSkus = new Set(
        ((existingVariants ?? []) as Array<{ sku?: string | null }>)
          .map((v) => (v.sku ?? "").toString().trim().toUpperCase())
          .filter(Boolean),
      );
      for (const v of expanded) {
        const nicotineType = v._expandedType;
        // Validation paliers : min croissants, pas de chevauchement.
        const tiers = (v.quantity_tiers ?? []).map((t) => ({
          min_qty: t.min_qty,
          max_qty: t.max_qty ?? null,
          price_cents: t.price_cents,
        }));
        if (tiers.length > 0) {
          const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
          for (let i = 0; i < sorted.length; i++) {
            const t = sorted[i];
            if (t.max_qty != null && t.max_qty < t.min_qty) {
              throw new Error(`Variante ${v.volume_ml} ml : palier « ${t.min_qty} » invalide (max < min).`);
            }
            if (i > 0) {
              const prev = sorted[i - 1];
              const prevEnd = prev.max_qty ?? Infinity;
              if (t.min_qty <= prevEnd) {
                throw new Error(
                  `Variante ${v.volume_ml} ml : chevauchement des paliers de prix dégressif.`,
                );
              }
            }
          }
        }
        const existing = existingByKey.get(`${v.volume_ml}::${nicotineType}`);
        // Politique SKU :
        //  - une variante existante conserve son SKU (stable, potentiellement
        //    imprimée / partagée) ;
        //  - un SKU saisi manuellement par l'admin dans le wizard est respecté ;
        //  - sinon on génère un SKU canonique unique via `buildVariantSku` :
        //    MARQUE-NOM-VOLUME[-TYPE][-NNMG]. Le taux de nicotine n'est ajouté
        //    que pour les formats à taux fixe (une seule valeur autorisée).
        const currentSku = (existing?.sku ?? "").toString().trim().toUpperCase();
        const providedSku = ((v as { sku?: string }).sku ?? "").toString().trim().toUpperCase();
        let sku = currentSku;
        if (providedSku && providedSku !== currentSku) {
          sku = ensureUniqueSku(providedSku, existingSkus);
        } else if (!sku) {
          const availableMg = (v.available_nicotine_mg ?? []) as number[];
          const fixedMg =
            (typeof v.max_boosters === "number" ? v.max_boosters : 0) === 0 &&
            availableMg.length === 1
              ? availableMg[0]
              : null;
          const candidate = buildVariantSku({
            brand: data.brand ?? "",
            name: data.name,
            volumeMl: v.volume_ml,
            nicotineType,
            fixedMg,
          });
          sku = ensureUniqueSku(candidate, existingSkus);
        }
        existingSkus.add(sku.toUpperCase());
        const row = {
          product_id: productId,
          volume_ml: v.volume_ml,
          price_cents: v.price_cents,
          stock: v.stock,
          max_nicotine_mg:
            v.available_nicotine_mg && v.available_nicotine_mg.length > 0
              ? Math.max(...v.available_nicotine_mg)
              : (v.max_nicotine_mg ?? 0),
          available_nicotine_mg: v.available_nicotine_mg ?? [],
          // Colonne obsolète `boosters_per_nicotine` : plus jamais écrite ni
          // lue. Le taux est calculé exclusivement par la formule de dilution.
          nicotine_type: nicotineType,
          max_boosters:
            typeof v.max_boosters === "number" && Number.isFinite(v.max_boosters)
              ? Math.max(0, Math.trunc(v.max_boosters))
              : null,
          photo_url: v.photo_url ? v.photo_url : null,
          sku,
          is_active: (v as { is_active?: boolean }).is_active ?? true,
          quantity_tiers: tiers as never,
          empty_bottle_product_id:
            (v as { empty_bottle_product_id?: string | null }).empty_bottle_product_id ?? null,
        };
        if (existing?.id) {
          const { error } = await supabaseAdmin
            .from("product_variants")
            .update(row)
            .eq("id", existing.id);
          if (error) throw new Error(`Variante ${v.volume_ml} ml : ${error.message}`);
        } else {
          const { error } = await supabaseAdmin
            .from("product_variants")
            .insert(row);
          if (error) throw new Error(`Variante ${v.volume_ml} ml : ${error.message}`);
        }
      }
    } else {
      // Non e-liquide products should never carry active variants; désactive plutôt que supprimer.
      await supabaseAdmin
        .from("product_variants")
        .update({ is_active: false } as never)
        .eq("product_id", productId);
    }

    return { id: productId };
}

// ---------- SKU helpers ----------
//
// Format canonique d'un SKU de variante :
//   [MARQUE(6)-]NOM(10)-<vol>ML[-TYPE][-NNMG]
//
// Où :
//   MARQUE  = 6 premiers caractères significatifs de la marque (facultatif).
//   NOM     = 10 premiers caractères significatifs du nom produit.
//   TYPE    = SEL / ICE pour les types dérivés (omis pour « normale »).
//   NNMG    = taux fixe sur 2 chiffres (ex : 06MG) — uniquement pour les
//             formats 10 ml à taux fixe (une seule valeur autorisée).
// L'unicité est ensuite garantie par `ensureUniqueSku` (-2, -3, …).

function skuSegment(input: string, maxLen: number): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLen);
}

export function buildVariantSku(args: {
  brand: string | null | undefined;
  name: string;
  volumeMl: number;
  nicotineType?: string | null;
  fixedMg?: number | null;
}): string {
  const parts: string[] = [];
  const brandSeg = skuSegment(args.brand ?? "", 6);
  if (brandSeg) parts.push(brandSeg);
  parts.push(skuSegment(args.name, 10) || "PRD");
  parts.push(`${Math.max(0, Math.trunc(args.volumeMl))}ML`);
  const type = (args.nicotineType ?? "normale").toString().trim().toLowerCase();
  if (type && type !== "normale") parts.push(skuSegment(type, 6));
  if (typeof args.fixedMg === "number" && Number.isFinite(args.fixedMg)) {
    parts.push(`${String(Math.max(0, Math.trunc(args.fixedMg))).padStart(2, "0")}MG`);
  }
  return parts.join("-").slice(0, 40);
}

export function buildFlavorSku(
  brand: string | null | undefined,
  productName: string,
  flavor: string,
): string {
  const parts: string[] = [];
  const brandSeg = skuSegment(brand ?? "", 6);
  if (brandSeg) parts.push(brandSeg);
  parts.push(skuSegment(productName, 10) || "PRD");
  const fseg = skuSegment(flavor, 8);
  if (fseg) parts.push(fseg);
  return parts.join("-").slice(0, 40);
}

function ensureUniqueSku(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 999; i++) {
    const candidate = `${base}-${i}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`.slice(0, 40);
}

// Fetch variants for a product (admin editor)
export const adminListVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string }) =>
    z.object({ productId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("product_variants")
      .select("*")
      .eq("product_id", data.productId)
      .order("volume_ml", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "product.delete", "product", data.id, null);
    return { ok: true };
  });

// ---------- Upload photo produit ----------

const uploadPhotoSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z
    .string()
    .regex(/^image\/(png|jpe?g|webp|gif|avif)$/i, "Format d'image non supporté"),
  base64: z.string().min(1),
});

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 Mo

export const adminUploadProductPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadPhotoSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const cleanBase64 = data.base64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(cleanBase64, "base64");
    if (bytes.length === 0) throw new Error("Fichier vide.");
    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new Error("Image trop lourde (4 Mo max).");
    }
    const ext = (data.filename.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("product-photos")
      .upload(path, bytes, {
        contentType: data.contentType,
        upsert: false,
      });
    if (upErr) throw new Error(`Upload échoué : ${upErr.message}`);

    // Signed URL (10 ans) — le bucket est privé, on stocke une URL signée longue durée.
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("product-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message || "URL signée indisponible.");
    }
    return { url: signed.signedUrl, path };
  });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: orderStatusSchema.optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("orders")
      .select("id, order_number, status, total_cents, currency, created_at, guest_email, user_id, tracking_number")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminGetOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [ord, its] = await Promise.all([
      supabaseAdmin.from("orders").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin
        .from("order_items")
        .select(
          "id, product_id, product_name, quantity, unit_price_cents, base_price_cents, boosters_count, booster_unit_price_cents, nicotine_mg, volume_ml, flavor, variant_sku",
        )
        .eq("order_id", data.id),
    ]);
    if (ord.error) throw new Error(ord.error.message);
    if (its.error) throw new Error(its.error.message);
    if (!ord.data) throw new Error("Commande introuvable.");
    return { order: ord.data, items: its.data ?? [] };
  });

export const adminUpdateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: orderStatusSchema,
        tracking_number: z.string().trim().max(120).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Lecture du statut courant pour valider la transition.
    const { data: current, error: readErr } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Commande introuvable.");
    assertUpdateTransition(current.status as OrderStatus, data.status as OrderStatus);
    const patch: Record<string, unknown> = {
      status: data.status,
      tracking_number: data.tracking_number || null,
    };
    if (data.status === "expediee" && current.status !== "expediee") {
      patch.shipped_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin.from("orders").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "order.update", "order", data.id, {
      from: current.status,
      to: data.status,
      tracking_number: data.tracking_number || null,
    });
    return { ok: true };
  });

// ---------- Transitions dédiées (livraison / annulation) ----------

export const adminMarkOrderDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Commande introuvable.");
    assertDeliverTransition(current.status as OrderStatus);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "livree", delivered_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "order.deliver", "order", data.id, {
      from: current.status,
      to: "livree",
    });
    // Email de suivi (optionnel) — best-effort.
    try {
      const { sendOrderDeliveredEmail } = await import("@/lib/order-emails.server");
      await sendOrderDeliveredEmail(data.id);
    } catch (e) {
      console.warn("[email] delivered notice failed", e);
    }
    return { ok: true };
  });

export const adminCancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Commande introuvable.");
    assertCancelTransition(current.status as OrderStatus);
    const reason = (data.reason ?? "").trim() || null;
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status: "annulee",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "order.cancel", "order", data.id, {
      from: current.status,
      to: "annulee",
      reason,
    });
    try {
      const { sendOrderCancelledEmail } = await import("@/lib/order-emails.server");
      await sendOrderCancelledEmail(data.id, reason);
    } catch (e) {
      console.warn("[email] cancellation notice failed", e);
    }
    return { ok: true };
  });

export const adminSetOrderRefundProcessed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), processed: z.boolean() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Commande introuvable.");
    assertRefundAllowed(current.status as OrderStatus);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        refund_processed_at: data.processed ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "order.refund", "order", data.id, {
      processed: data.processed,
    });
    return { ok: true };
  });

// Modification manuelle libre du statut (outil de dépannage / commandes de
// test). Contrairement aux endpoints normaux, aucune règle de transition
// n'est appliquée et AUCUN email n'est envoyé au client. L'action est
// journalisée avec une mention explicite pour la traçabilité.
export const adminForceOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: orderStatusSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Commande introuvable.");
    const from = current.status as OrderStatus;
    const to = data.status as OrderStatus;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: to };
    // Aligner les horodatages sur le nouveau statut pour rester cohérent
    // avec l'affichage (« Livrée le … », « Annulée le … »).
    if (to === "expediee") patch.shipped_at = now;
    if (to === "livree") patch.delivered_at = now;
    if (to === "annulee") patch.cancelled_at = now;
    const { error } = await supabaseAdmin
      .from("orders")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "order.manual_status_change", "order", data.id, {
      from,
      to,
      manual: true,
    });
    return { ok: true };
  });

// ---------- Journal d'audit d'une commande ----------

export type OrderAuditEntry = {
  id: string;
  created_at: string;
  action: string;
  admin_id: string | null;
  admin_label: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  reason: string | null;
  tracking_number: string | null;
  refund_processed: boolean | null;
};

export const adminGetOrderAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<OrderAuditEntry[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("admin_action_log")
      .select("id, created_at, action, admin_id, details")
      .eq("entity_type", "order")
      .eq("entity_id", data.id)
      .in("action", [
        "order.update",
        "order.deliver",
        "order.cancel",
        "order.refund",
        "order.manual_status_change",
      ])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Résoudre les libellés admin en un seul appel.
    const adminIds = Array.from(
      new Set((rows ?? []).map((r) => r.admin_id).filter((v): v is string => !!v)),
    );
    const labels = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", adminIds);
      for (const p of profiles ?? []) {
        labels.set(p.id, p.full_name?.trim() || p.email || "Admin");
      }
    }

    return (rows ?? []).map((r) => {
      const d = (r.details ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        admin_id: r.admin_id,
        admin_label: r.admin_id ? labels.get(r.admin_id) ?? "Admin" : "Système",
        from_status: (d.from as OrderStatus) ?? null,
        to_status: (d.to as OrderStatus) ?? null,
        reason: typeof d.reason === "string" ? d.reason : null,
        tracking_number:
          typeof d.tracking_number === "string" ? d.tracking_number : null,
        refund_processed:
          typeof d.processed === "boolean" ? (d.processed as boolean) : null,
      };
    });
  });

// ---------- Historique commandes (recherche + filtres) ----------

const searchOrdersSchema = z.object({
  status: orderStatusSchema.optional(),
  q: z.string().trim().max(160).optional().or(z.literal("")),
  from: z.string().trim().max(40).optional().or(z.literal("")),
  to: z.string().trim().max(40).optional().or(z.literal("")),
});

export const adminSearchOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchOrdersSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Résoudre les user_ids qui matchent la recherche texte (nom/email profil).
    let matchedUserIds: string[] | null = null;
    const q = (data.q ?? "").trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`full_name.ilike.${like},email.ilike.${like}`);
      matchedUserIds = (profs ?? []).map((p) => p.id);
    }

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, total_cents, currency, created_at, guest_email, user_id, tracking_number",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status) query = query.eq("status", data.status);
    if (data.from) query = query.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const end = new Date(data.to);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const ors = [`order_number.ilike.${like}`, `guest_email.ilike.${like}`];
      if (matchedUserIds && matchedUserIds.length > 0) {
        ors.push(`user_id.in.(${matchedUserIds.join(",")})`);
      }
      query = query.or(ors.join(","));
    }

    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);
    const rows = orders ?? [];

    // Enrichir avec articles + profils clients.
    const orderIds = rows.map((r) => r.id);
    const userIds = Array.from(
      new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v))),
    );

    const [itemsRes, profRes] = await Promise.all([
      orderIds.length
        ? supabaseAdmin
            .from("order_items")
            .select("order_id, product_name, quantity")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null } as const),
      userIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, full_name, email, phone")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (profRes.error) throw new Error(profRes.error.message);

    const itemsByOrder = new Map<string, { product_name: string; quantity: number }[]>();
    for (const it of itemsRes.data ?? []) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push({ product_name: it.product_name, quantity: it.quantity });
      itemsByOrder.set(it.order_id, arr);
    }
    const profById = new Map(
      (profRes.data ?? []).map((p) => [p.id, p]),
    );

    return rows.map((o) => {
      const prof = o.user_id ? profById.get(o.user_id) : null;
      return {
        ...o,
        items: itemsByOrder.get(o.id) ?? [],
        customer_name: prof?.full_name ?? null,
        customer_email: prof?.email ?? o.guest_email ?? null,
        customer_phone: prof?.phone ?? null,
      };
    });
  });

// ---------- Annuaire clients ----------

export const adminListCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().max(160).optional().or(z.literal("")) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let pq = supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const q = (data.q ?? "").trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      pq = pq.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    const { data: profiles, error } = await pq;
    if (error) throw new Error(error.message);
    const rows = profiles ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { data: orders, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("user_id, total_cents, created_at")
      .in("user_id", ids);
    if (oErr) throw new Error(oErr.message);

    const stats = new Map<string, { count: number; total: number; last: string | null }>();
    for (const o of orders ?? []) {
      if (!o.user_id) continue;
      const s = stats.get(o.user_id) ?? { count: 0, total: 0, last: null };
      s.count += 1;
      s.total += o.total_cents;
      if (!s.last || new Date(o.created_at) > new Date(s.last)) s.last = o.created_at;
      stats.set(o.user_id, s);
    }
    return rows.map((r) => {
      const s = stats.get(r.id) ?? { count: 0, total: 0, last: null };
      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        created_at: r.created_at,
        orders_count: s.count,
        total_spent_cents: s.total,
        last_order_at: s.last,
      };
    });
  });

export const adminGetCustomer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [prof, orders] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, phone, created_at")
        .eq("id", data.id)
        .maybeSingle(),
      supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, status, total_cents, currency, created_at, tracking_number",
        )
        .eq("user_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    if (prof.error) throw new Error(prof.error.message);
    if (orders.error) throw new Error(orders.error.message);
    if (!prof.data) throw new Error("Client introuvable.");
    const orderRows = orders.data ?? [];
    const orderIds = orderRows.map((o) => o.id);

    // Charge le détail des lignes + les produits exclus du calcul « favori »
    // (boosters de nicotine + flacons vides référencés par un e-liquide).
    const [itemsRes, boostersRes, emptyRes] = await Promise.all([
      orderIds.length
        ? supabaseAdmin
            .from("order_items")
            .select(
              "order_id, product_id, product_name, quantity, unit_price_cents, volume_ml, nicotine_mg, flavor, boosters_count, variant_sku",
            )
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null } as const),
      supabaseAdmin.from("products").select("id").eq("is_nicotine_booster", true),
      supabaseAdmin
        .from("products")
        .select("empty_bottle_product_id")
        .not("empty_bottle_product_id", "is", null),
    ]);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (boostersRes.error) throw new Error(boostersRes.error.message);
    if (emptyRes.error) throw new Error(emptyRes.error.message);

    const excluded = new Set<string>();
    for (const b of boostersRes.data ?? []) if (b.id) excluded.add(b.id);
    for (const e of emptyRes.data ?? [])
      if (e.empty_bottle_product_id) excluded.add(e.empty_bottle_product_id);

    type ItemRow = {
      order_id: string;
      product_id: string | null;
      product_name: string;
      quantity: number;
      unit_price_cents: number;
      volume_ml: number | null;
      nicotine_mg: number | null;
      flavor: string | null;
      boosters_count: number;
      variant_sku: string | null;
    };
    const allItems = (itemsRes.data ?? []) as ItemRow[];
    const itemsByOrder: Record<string, ItemRow[]> = {};
    for (const it of allItems) {
      (itemsByOrder[it.order_id] ||= []).push(it);
    }

    // Total dépensé : commandes expédiées ou livrées uniquement.
    const totalSpentCents = orderRows
      .filter((o) => o.status === "expediee" || o.status === "livree")
      .reduce((s, o) => s + (o.total_cents ?? 0), 0);

    // Produit favori : agrégat des quantités par produit, hors exclusions.
    const tally = new Map<string, { name: string; qty: number }>();
    for (const it of allItems) {
      if (!it.product_id || excluded.has(it.product_id)) continue;
      const cur = tally.get(it.product_id);
      if (cur) cur.qty += it.quantity;
      else tally.set(it.product_id, { name: it.product_name, qty: it.quantity });
    }
    let favorite: { name: string; qty: number } | null = null;
    for (const v of tally.values()) {
      if (!favorite || v.qty > favorite.qty) favorite = v;
    }

    const ordersWithItems = orderRows.map((o) => ({
      ...o,
      items: itemsByOrder[o.id] ?? [],
    }));

    return {
      profile: prof.data,
      orders: ordersWithItems,
      total_spent_cents: totalSpentCents,
      favorite_product: favorite,
    };
  });

// ============================================================================
// Références techniques : boosters de nicotine + flacons vides
// ============================================================================

type EliquideRef = { id: string; name: string; slug: string };

/** Récupère la liste des e-liquides publiés/actifs qui utilisent ce produit
 *  comme booster (via nicotine_type) ou comme flacon vide (via
 *  empty_bottle_product_id sur le produit OU la variante). */
async function computeImpactedEliquides(
  supabaseAdmin: any,
  product: {
    id: string;
    category: string | null;
    is_nicotine_booster: boolean | null;
    booster_type: string | null;
  },
): Promise<{
  asBooster: EliquideRef[];
  asEmptyBottle: EliquideRef[];
}> {
  const asBooster: EliquideRef[] = [];
  const asEmptyBottle: EliquideRef[] = [];

  if (product.is_nicotine_booster) {
    const wanted = (product.booster_type ?? "normale").toString().trim().toLowerCase() || "normale";
    const { data: refs } = await supabaseAdmin
      .from("product_variants")
      .select(
        "nicotine_type, max_boosters, products!product_variants_product_id_fkey!inner(id, name, slug, category, is_published)",
      )
      .eq("is_active", true)
      .eq("products.category", "e_liquide");
    const seen = new Set<string>();
    for (const r of (refs ?? []) as Array<{
      nicotine_type: string | null;
      max_boosters: number | null;
      products: { id: string; name: string; slug: string; is_published: boolean } | null;
    }>) {
      if ((r.max_boosters ?? 0) <= 0) continue;
      const t = (r.nicotine_type ?? "normale").toString().trim().toLowerCase();
      if (t !== wanted) continue;
      if (!r.products) continue;
      if (seen.has(r.products.id)) continue;
      seen.add(r.products.id);
      asBooster.push({ id: r.products.id, name: r.products.name, slug: r.products.slug });
    }
  }

  // Flacon vide : référencé sur products.empty_bottle_product_id (niveau produit)
  // ou product_variants.empty_bottle_product_id (par contenance).
  const [prodRefs, varRefs] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, slug")
      .eq("empty_bottle_product_id", product.id)
      .eq("category", "e_liquide"),
    supabaseAdmin
      .from("product_variants")
      .select(
        "products!product_variants_product_id_fkey!inner(id, name, slug, category)",
      )
      .eq("empty_bottle_product_id", product.id)
      .eq("is_active", true)
      .eq("products.category", "e_liquide"),
  ]);
  const seenB = new Set<string>();
  for (const r of (prodRefs.data ?? []) as Array<{ id: string; name: string; slug: string }>) {
    if (seenB.has(r.id)) continue;
    seenB.add(r.id);
    asEmptyBottle.push(r);
  }
  for (const r of (varRefs.data ?? []) as Array<{
    products: { id: string; name: string; slug: string } | null;
  }>) {
    if (!r.products || seenB.has(r.products.id)) continue;
    seenB.add(r.products.id);
    asEmptyBottle.push(r.products);
  }

  return { asBooster, asEmptyBottle };
}

export const adminProductImpact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin
      .from("products")
      .select("id, name, category, is_nicotine_booster, booster_type, volume_ml")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Produit introuvable.");
    const impact = await computeImpactedEliquides(supabaseAdmin, p);
    const role: "booster" | "empty_bottle" | null = p.is_nicotine_booster
      ? "booster"
      : p.category === "accessoire_vape" && (p.volume_ml ?? 0) > 0 && impact.asEmptyBottle.length > 0
        ? "empty_bottle"
        : null;
    return {
      role,
      booster_type: p.booster_type,
      volume_ml: p.volume_ml,
      as_booster: impact.asBooster,
      as_empty_bottle: impact.asEmptyBottle,
      is_protected: impact.asBooster.length + impact.asEmptyBottle.length > 0,
    };
  });

export const adminTechnicalReferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [boostersRes, bottlesRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select(
          "id, name, slug, photos, is_published, stock, stock_status, booster_type, category, is_nicotine_booster, volume_ml, updated_at",
        )
        .eq("is_nicotine_booster", true)
        .order("booster_type", { ascending: true }),
      supabaseAdmin
        .from("products")
        .select(
          "id, name, slug, photos, is_published, stock, stock_status, booster_type, category, is_nicotine_booster, volume_ml, updated_at",
        )
        .eq("category", "accessoire_vape")
        .eq("is_nicotine_booster", false)
        .not("volume_ml", "is", null)
        .order("volume_ml", { ascending: true }),
    ]);
    if (boostersRes.error) throw new Error(boostersRes.error.message);
    if (bottlesRes.error) throw new Error(bottlesRes.error.message);

    const boosters = await Promise.all(
      (boostersRes.data ?? []).map(async (p) => {
        const impact = await computeImpactedEliquides(supabaseAdmin, p);
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          photo: (p.photos ?? [])[0] ?? null,
          is_published: p.is_published,
          stock: p.stock,
          stock_status: p.stock_status,
          booster_type: p.booster_type,
          volume_ml: p.volume_ml,
          updated_at: p.updated_at,
          used_by: impact.asBooster,
          is_protected: impact.asBooster.length > 0,
        };
      }),
    );
    const bottles = await Promise.all(
      (bottlesRes.data ?? []).map(async (p) => {
        const impact = await computeImpactedEliquides(supabaseAdmin, p);
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          photo: (p.photos ?? [])[0] ?? null,
          is_published: p.is_published,
          stock: p.stock,
          stock_status: p.stock_status,
          volume_ml: p.volume_ml,
          updated_at: p.updated_at,
          used_by: impact.asEmptyBottle,
          is_protected: impact.asEmptyBottle.length > 0,
        };
      }),
    );

    return { boosters, bottles };
  });

// ============================================================
// Import CSV en masse — crée plusieurs produits « brouillon »
// en réutilisant `upsertProductCore` (donc toute la logique de
// validation, expansion des variantes e-liquide, etc.).
// ============================================================

const bulkImportRowSchema = z.object({
  line: z.number().int().min(1),
  marque: z.string().trim().max(120).default(""),
  nom: z.string().trim().min(1).max(160),
  volume_ml: z.number().int().min(0).max(10_000).nullable(),
  type: z.string().trim().max(80),
  nicotines_10ml: z.array(z.number().int().min(0).max(50)).max(20).default([]),
  stock: z.number().int().min(0).max(100_000).default(0),
  category: z.string().trim().max(40),
  subcategory: z.string().trim().max(120).default(""),
  ref_fournisseur: z.string().trim().max(120).default(""),
});

const bulkImportSchema = z.object({
  rows: z.array(bulkImportRowSchema).min(1).max(1000),
});

type BulkRow = z.infer<typeof bulkImportRowSchema>;

function bulkSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function classifyRow(row: BulkRow): { kind: "eliquide_10ml" | "eliquide_large" | "empty_bottle"; error?: string } {
  const cat = row.category.trim().toLowerCase();
  const type = row.type.trim().toLowerCase();
  if (cat === "e_liquide") {
    if (type.includes("10ml") || type.includes("prêt") || type.includes("pret")) {
      return { kind: "eliquide_10ml" };
    }
    if (type.includes("boosterable") || type.includes("base")) {
      if (!row.volume_ml || row.volume_ml <= 0) {
        return { kind: "eliquide_large", error: "Volume manquant pour un e-liquide grand format." };
      }
      return { kind: "eliquide_large" };
    }
    return { kind: "eliquide_10ml", error: `Type e-liquide inconnu : « ${row.type} ».` };
  }
  if (cat === "accessoire_vape") {
    if (type.includes("flacon")) {
      if (!row.volume_ml || row.volume_ml <= 0) {
        return { kind: "empty_bottle", error: "Volume manquant pour un flacon vide." };
      }
      return { kind: "empty_bottle" };
    }
    return { kind: "empty_bottle", error: `Type accessoire non supporté : « ${row.type} ».` };
  }
  return { kind: "empty_bottle", error: `Catégorie non supportée à l'import : « ${row.category} ».` };
}

export const adminBulkImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkImportSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const errors: Array<{ line: number; message: string }> = [];
    // Slugs déjà existants dans la base — évite collision avec produits en place.
    const { data: existingSlugs } = await supabaseAdmin
      .from("products")
      .select("slug");
    const takenSlugs = new Set(
      ((existingSlugs ?? []) as Array<{ slug: string }>).map((r) => r.slug),
    );

    // Regroupe les e-liquides par (marque|nom) pour fusionner les contenances.
    type Bucket = {
      kind: "eliquide" | "empty_bottle";
      lines: number[];
      marque: string;
      nom: string;
      subcategory: string;
      // e-liquide : variantes agrégées
      variants: Array<{
        volume_ml: number;
        stock: number;
        available_nicotine_mg: number[];
        max_boosters: number | null;
      }>;
      // flacon vide : direct
      volume_ml?: number | null;
      stock: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const row of data.rows) {
      const cls = classifyRow(row);
      if (cls.error) {
        errors.push({ line: row.line, message: cls.error });
        continue;
      }
      const marque = row.marque.trim();
      const nom = row.nom.trim();
      const displayName = marque ? `${marque} ${nom}` : nom;
      if (cls.kind === "empty_bottle") {
        const key = `bottle::${bulkSlug(displayName)}::${row.volume_ml}`;
        buckets.set(key, {
          kind: "empty_bottle",
          lines: [row.line],
          marque,
          nom,
          subcategory: row.subcategory,
          variants: [],
          volume_ml: row.volume_ml,
          stock: row.stock,
        });
        continue;
      }
      const key = `eliq::${bulkSlug(marque)}::${bulkSlug(nom)}`;
      const existing = buckets.get(key);
      const volume = cls.kind === "eliquide_10ml" ? 10 : row.volume_ml!;
      const nics =
        cls.kind === "eliquide_10ml"
          ? Array.from(new Set(row.nicotines_10ml)).sort((a, b) => a - b)
          : [0];
      const variant = {
        volume_ml: volume,
        stock: row.stock,
        available_nicotine_mg: nics,
        // 10ml prêt-à-l'emploi : pas de boosters. Grand format : capacité à
        // renseigner manuellement (null = non déterminé, admin complètera).
        max_boosters: cls.kind === "eliquide_10ml" ? 0 : null,
      };
      if (existing && existing.kind === "eliquide") {
        // Si un doublon exact de volume est présent, on fusionne les stocks
        // et les taux de nicotine plutôt que de créer deux variantes.
        const dupe = existing.variants.find((v) => v.volume_ml === variant.volume_ml);
        if (dupe) {
          dupe.stock += variant.stock;
          dupe.available_nicotine_mg = Array.from(
            new Set([...dupe.available_nicotine_mg, ...variant.available_nicotine_mg]),
          ).sort((a, b) => a - b);
        } else {
          existing.variants.push(variant);
        }
        existing.lines.push(row.line);
        existing.stock += row.stock;
      } else {
        buckets.set(key, {
          kind: "eliquide",
          lines: [row.line],
          marque,
          nom,
          subcategory: row.subcategory,
          variants: [variant],
          stock: row.stock,
        });
      }
    }

    let created = 0;
    for (const bucket of buckets.values()) {
      const displayName = bucket.marque
        ? `${bucket.marque} ${bucket.nom}`
        : bucket.nom;
      // Génération d'un slug unique (base + suffixe -2, -3… si collision).
      const base = bulkSlug(displayName) || "produit";
      let slug = base;
      let i = 2;
      while (takenSlugs.has(slug)) slug = `${base}-${i++}`;
      takenSlugs.add(slug);

      const totalStock = Math.max(0, bucket.stock);
      const stockStatus: "in_stock" | "low_stock" | "out_of_stock" =
        totalStock === 0 ? "out_of_stock" : totalStock < 10 ? "low_stock" : "in_stock";

      let payload: unknown;
      if (bucket.kind === "empty_bottle") {
        payload = {
          name: displayName,
          slug,
          category: "accessoire_vape",
          subcategory: bucket.subcategory,
          description: "",
          price_cents: 0,
          currency: "EUR",
          stock: totalStock,
          stock_status: stockStatus,
          is_published: false,
          photos: [],
          volume_ml: bucket.volume_ml ?? null,
          variants: [],
          flavors: [],
        };
      } else {
        payload = {
          name: displayName,
          slug,
          category: "e_liquide",
          subcategory: bucket.subcategory,
          description: "",
          price_cents: 0,
          currency: "EUR",
          stock: totalStock,
          stock_status: stockStatus,
          is_published: false,
          photos: [],
          variants: bucket.variants.map((v) => ({
            volume_ml: v.volume_ml,
            price_cents: 0,
            stock: v.stock,
            available_nicotine_mg: v.available_nicotine_mg,
            nicotine_type: "normale",
            max_boosters: v.max_boosters,
            is_active: true,
          })),
          flavors: [],
        };
      }

      try {
        // Passe par le pipeline officiel (validation Zod + expansion variantes).
        const parsed = productInputSchema.parse(payload);
        await upsertProductCore({ supabase: context.supabase, userId: context.userId }, parsed);
        created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const l of bucket.lines) {
          errors.push({ line: l, message: `Création refusée : ${msg}` });
        }
      }
    }

    await logAction(context.userId, "product.bulk_import", "product", null, {
      created,
      errors: errors.length,
    });

    return { created, ignored: errors.length, errors };
  });
