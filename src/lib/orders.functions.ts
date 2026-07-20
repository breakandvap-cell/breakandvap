import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  computeNicotineRateMgPerMl,
  DEFAULT_BOOSTER_CONFIG,
  type BoosterConfig,
} from "@/lib/site-settings.functions";

const orderInputSchema = z.object({
  email: z.string().trim().email().max(255),
  shipping: z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6, "Téléphone requis").max(30),
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional().or(z.literal("")),
    postalCode: z.string().trim().min(3).max(20),
    city: z.string().trim().min(2).max(120),
    country: z.string().trim().min(2).max(80).default("France"),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        nicotineMg: z.number().min(0).max(50).optional(),
        flavor: z.string().trim().min(1).max(80).optional(),
        quantity: z.number().int().min(1).max(50),
        // Nombre de boosters explicitement choisi par le client. Prioritaire
        // sur la déduction depuis `nicotineMg`. Permet au client de valider
        // même si le nombre dépasse la capacité physique déclarée du flacon
        // (le message côté fiche produit est informatif, pas bloquant).
        boostersCount: z.number().int().min(0).max(20).optional(),
      }),
    )
    .min(1)
    .max(30),
});

export type CreateOrderInput = z.infer<typeof orderInputSchema>;

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Optional auth: link the order to the signed-in user if a bearer token
    // is present. Guest checkouts still work.
    let userId: string | null = null;
    const authHeader = getRequestHeader("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          const anon = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          const { data: userData } = await anon.auth.getUser(token);
          userId = userData.user?.id ?? null;
        } catch {
          userId = null;
        }
      }
    }

    // Load canonical product data server-side (never trust client prices).
    const ids = data.items.map((i) => i.productId);
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, price_cents, currency, stock, stock_status, is_published, flavors")
      .in("id", ids);
    if (prodErr) {
      console.error("[checkout] products fetch failed:", prodErr);
      throw new Error("Impossible de créer la commande, réessayez.");
    }
    if (!products || products.length === 0) {
      throw new Error("Aucun produit valide dans le panier.");
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Parse flavors and prepare per-product decrement plan.
    type FlavorEntry = { name: string; stock: number };
    const flavorMap = new Map<string, FlavorEntry[]>();
    for (const p of products) {
      const raw = (p as { flavors?: unknown }).flavors;
      if (!Array.isArray(raw)) continue;
      const list: FlavorEntry[] = [];
      for (const f of raw) {
        if (!f || typeof f !== "object") continue;
        const name = (f as { name?: unknown }).name;
        const stock = (f as { stock?: unknown }).stock;
        if (typeof name !== "string" || !name.trim()) continue;
        list.push({
          name: name.trim(),
          stock:
            typeof stock === "number" && Number.isFinite(stock)
              ? Math.max(0, Math.trunc(stock))
              : 0,
        });
      }
      if (list.length > 0) flavorMap.set(p.id, list);
    }
    // Track flavor stock decrements per product across lines.
    const flavorOps = new Map<string, FlavorEntry[]>();

    // Load required variants
    const variantIds = data.items
      .map((i) => i.variantId)
      .filter((v): v is string => Boolean(v));
    const variantMap = new Map<
      string,
      {
        id: string;
        product_id: string;
        volume_ml: number;
        price_cents: number;
        stock: number;
        available_nicotine_mg: number[];
        max_boosters: number | null;
        nicotine_type: string;
        sku: string | null;
        is_active: boolean;
        quantity_tiers: Array<{ min_qty: number; max_qty: number | null; price_cents: number }>;
      }
    >();
    if (variantIds.length > 0) {
      const { data: variants, error: vErr } = await supabaseAdmin
        .from("product_variants")
        .select(
          "id, product_id, volume_ml, price_cents, stock, available_nicotine_mg, max_boosters, nicotine_type, sku, is_active, quantity_tiers",
        )
        .in("id", variantIds);
      if (vErr) {
        console.error("[checkout] variants fetch failed:", vErr);
        throw new Error("Impossible de créer la commande, réessayez.");
      }
      for (const v of variants ?? []) {
        const rawTiers = ((v as { quantity_tiers?: unknown }).quantity_tiers ?? []) as unknown;
        const tiers: Array<{ min_qty: number; max_qty: number | null; price_cents: number }> =
          Array.isArray(rawTiers)
            ? (rawTiers as Array<Record<string, unknown>>)
                .filter((t) => typeof t?.min_qty === "number" && typeof t?.price_cents === "number")
                .map((t) => ({
                  min_qty: Math.trunc(t.min_qty as number),
                  max_qty:
                    typeof t.max_qty === "number" ? Math.trunc(t.max_qty as number) : null,
                  price_cents: Math.trunc(t.price_cents as number),
                }))
            : [];
        variantMap.set(v.id, {
          id: v.id,
          product_id: v.product_id,
          volume_ml: v.volume_ml,
          price_cents: v.price_cents,
          stock: v.stock,
          available_nicotine_mg: (v.available_nicotine_mg ?? []) as number[],
          max_boosters:
            typeof (v as { max_boosters?: number | null }).max_boosters === "number"
              ? Math.max(0, (v as { max_boosters: number }).max_boosters)
              : null,
          nicotine_type: ((v as { nicotine_type?: string | null }).nicotine_type ?? "normale")
            .toString()
            .trim()
            .toLowerCase() || "normale",
          sku: (v as { sku?: string | null }).sku ?? null,
          is_active:
            typeof (v as { is_active?: boolean }).is_active === "boolean"
              ? (v as { is_active: boolean }).is_active
              : true,
          quantity_tiers: tiers,
        });
      }
    }

    // Charge le réglage global du dosage booster (formule de dilution).
    // Utilisé pour retrouver le nombre de boosters correspondant au taux
    // choisi par le client — l'ancienne colonne boosters_per_nicotine n'est
    // plus lue nulle part.
    let boosterCfg: BoosterConfig = DEFAULT_BOOSTER_CONFIG;
    {
      const { data: settings } = await supabaseAdmin
        .from("site_settings")
        .select("booster_volume_ml, booster_concentration_mg_per_ml")
        .eq("singleton", true)
        .maybeSingle();
      if (settings) {
        boosterCfg = {
          boosterVolumeMl:
            Number(settings.booster_volume_ml) || DEFAULT_BOOSTER_CONFIG.boosterVolumeMl,
          boosterConcentrationMgPerMl:
            Number(settings.booster_concentration_mg_per_ml) ||
            DEFAULT_BOOSTER_CONFIG.boosterConcentrationMgPerMl,
        };
      }
    }

    // Charge les produits booster (un par type) : prix de référence appliqué
    // aux e-liquides 50/100/200 ml selon le type de la variante commandée.
    const boosterByType = new Map<string, { id: string; price_cents: number }>();
    {
      const { data: boosters } = await supabaseAdmin
        .from("products")
        .select("id, price_cents, is_published, booster_type, created_at")
        .eq("is_nicotine_booster", true)
        .order("created_at", { ascending: true });
      for (const b of boosters ?? []) {
        if (!b.is_published) continue;
        const key = ((b as { booster_type?: string | null }).booster_type ?? "normale")
          .toString()
          .trim()
          .toLowerCase() || "normale";
        if (!boosterByType.has(key)) {
          boosterByType.set(key, { id: b.id, price_cents: b.price_cents });
        }
      }
    }

    let currency = "EUR";
    let totalCents = 0;
    const itemsToInsert: {
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price_cents: number;
      base_price_cents: number | null;
      boosters_count: number;
      booster_unit_price_cents: number | null;
      nicotine_mg: number | null;
      volume_ml: number | null;
      flavor: string | null;
      variant_sku: string | null;
    }[] = [];
    const variantStockOps: { id: string; nextStock: number }[] = [];

    for (const line of data.items) {
      const p = productMap.get(line.productId);
      if (!p || !p.is_published) {
        throw new Error(`Produit indisponible.`);
      }
      currency = p.currency;
      // Flavor handling (independent axis): validate & decrement working copy.
      const productFlavors = flavorMap.get(p.id) ?? null;
      let flavorLabel: string | null = null;
      let flavorSku: string | null = null;
      if (productFlavors) {
        if (!line.flavor) {
          throw new Error(`Choisis un goût pour "${p.name}".`);
        }
        const working = flavorOps.get(p.id) ?? productFlavors.map((f) => ({ ...f }));
        const entry = working.find(
          (f) => f.name.toLowerCase() === line.flavor!.toLowerCase(),
        );
        if (!entry) {
          throw new Error(`Goût « ${line.flavor} » indisponible pour "${p.name}".`);
        }
        // Rejette les goûts désactivés côté admin.
        const originalFlavor = (Array.isArray((p as { flavors?: unknown }).flavors)
          ? ((p as { flavors: unknown[] }).flavors as Array<Record<string, unknown>>)
          : []
        ).find(
          (f) => typeof f?.name === "string" && (f.name as string).toLowerCase() === entry.name.toLowerCase(),
        );
        if (originalFlavor && originalFlavor.is_active === false) {
          throw new Error(`Goût « ${entry.name} » indisponible.`);
        }
        flavorSku =
          originalFlavor && typeof originalFlavor.sku === "string" && (originalFlavor.sku as string).length > 0
            ? (originalFlavor.sku as string)
            : null;
        if (entry.stock < line.quantity) {
          throw new Error(
            `Stock insuffisant pour "${p.name}" (goût ${entry.name}).`,
          );
        }
        entry.stock -= line.quantity;
        flavorOps.set(p.id, working);
        flavorLabel = entry.name;
      }
      if (line.variantId) {
        const v = variantMap.get(line.variantId);
        if (!v || v.product_id !== p.id) {
          throw new Error(`Variante indisponible pour "${p.name}".`);
        }
        if (!v.is_active) {
          throw new Error(`Variante ${v.volume_ml} ml indisponible pour "${p.name}".`);
        }
        if (v.stock < line.quantity) {
          throw new Error(
            `Stock insuffisant pour "${p.name}" (${v.volume_ml} ml).`,
          );
        }
        const nic = line.nicotineMg ?? 0;
        if (v.available_nicotine_mg.length > 0 && !v.available_nicotine_mg.includes(nic)) {
          throw new Error(
            `Taux de nicotine ${nic} mg indisponible en ${v.volume_ml} ml pour "${p.name}".`,
          );
        }
        // Applique le prix dégressif éventuel (basé sur la quantité de la ligne).
        let basePrice = v.price_cents;
        for (const t of v.quantity_tiers) {
          if (line.quantity >= t.min_qty && (t.max_qty == null || line.quantity <= t.max_qty)) {
            basePrice = t.price_cents;
          }
        }
        let unitPrice = basePrice;
        let boostersUsed = 0;
        let boosterUnitPrice: number | null = null;
        if (v.volume_ml !== 10 && nic > 0) {
          // Formule de dilution inverse : cherche le plus petit nombre de
          // boosters (dans la limite de max_boosters) dont le taux calculé
          // correspond au taux choisi par le client.
          const cap =
            typeof v.max_boosters === "number" && v.max_boosters > 0
              ? v.max_boosters
              : 0;
          let boostersN = 0;
          if (cap > 0) {
            for (let n = 1; n <= cap; n++) {
              if (computeNicotineRateMgPerMl(v.volume_ml, n, boosterCfg) === nic) {
                boostersN = n;
                break;
              }
            }
          }
          if (boostersN === 0) {
            throw new Error(
              `Taux de nicotine ${nic} mg indisponible en ${v.volume_ml} ml pour "${p.name}".`,
            );
          }
          if (boostersN > 0) {
            const booster = boosterByType.get(v.nicotine_type);
            if (!booster) {
              throw new Error(
                `Aucun booster de nicotine « ${v.nicotine_type} » disponible pour "${p.name}".`,
              );
            }
            unitPrice += boostersN * booster.price_cents;
            boostersUsed = boostersN;
            boosterUnitPrice = booster.price_cents;
          }
        }
        totalCents += unitPrice * line.quantity;
        const nameSuffix = nic > 0 ? `, ${nic} mg` : "";
        const flavorSuffix = flavorLabel ? `, ${flavorLabel}` : "";
        itemsToInsert.push({
          product_id: p.id,
          product_name: `${p.name} — ${v.volume_ml} ml${nameSuffix}${flavorSuffix}`,
          quantity: line.quantity,
          unit_price_cents: unitPrice,
          base_price_cents: basePrice,
          boosters_count: boostersUsed,
          booster_unit_price_cents: boosterUnitPrice,
          nicotine_mg: nic,
          volume_ml: v.volume_ml,
          flavor: flavorLabel,
          variant_sku: v.sku ?? flavorSku,
        });
        variantStockOps.push({
          id: v.id,
          nextStock: Math.max(0, v.stock - line.quantity),
        });
      } else {
        if (p.stock_status === "out_of_stock" || p.stock < line.quantity) {
          throw new Error(`Stock insuffisant pour "${p.name}".`);
        }
        totalCents += p.price_cents * line.quantity;
        itemsToInsert.push({
          product_id: p.id,
          product_name: flavorLabel ? `${p.name} — ${flavorLabel}` : p.name,
          quantity: line.quantity,
          unit_price_cents: p.price_cents,
          base_price_cents: p.price_cents,
          boosters_count: 0,
          booster_unit_price_cents: null,
          nicotine_mg: null,
          volume_ml: null,
          flavor: flavorLabel,
          variant_sku: flavorSku,
        });
      }
    }

    const shipping = {
      full_name: data.shipping.fullName,
      phone: data.shipping.phone || null,
      line1: data.shipping.line1,
      line2: data.shipping.line2 || null,
      postal_code: data.shipping.postalCode,
      city: data.shipping.city,
      country: data.shipping.country || "France",
    };

    // ---------------------------------------------------------------------
    // Décrément ATOMIQUE des stocks (anti-survente).
    // On applique chaque décrément via des RPC SQL qui n'écrivent que si le
    // stock disponible est suffisant. Si l'un des décréments échoue, on
    // rembobine les précédents avant de renvoyer une erreur claire au client.
    // ---------------------------------------------------------------------
    type StockRollback =
      | { kind: "product"; id: string; qty: number }
      | { kind: "variant"; id: string; qty: number }
      | { kind: "flavor"; productId: string; flavor: string; qty: number };
    const rollbacks: StockRollback[] = [];
    const rollbackAll = async () => {
      for (const r of rollbacks.reverse()) {
        try {
          if (r.kind === "product") {
            await supabaseAdmin.rpc("increment_product_stock", { _id: r.id, _qty: r.qty });
          } else if (r.kind === "variant") {
            await supabaseAdmin.rpc("increment_variant_stock", { _id: r.id, _qty: r.qty });
          } else {
            await supabaseAdmin.rpc("increment_flavor_stock", {
              _product_id: r.productId,
              _flavor: r.flavor,
              _qty: r.qty,
            });
          }
        } catch (e) {
          console.error("[checkout] rollback failed", r, e);
        }
      }
    };

    for (const line of data.items) {
      const p = productMap.get(line.productId)!;
      // Décrément goût si applicable (indépendant du variant)
      if (flavorMap.has(p.id) && line.flavor) {
        const { data: newStock, error } = await supabaseAdmin.rpc(
          "decrement_flavor_stock",
          { _product_id: p.id, _flavor: line.flavor, _qty: line.quantity },
        );
        if (error || newStock == null) {
          await rollbackAll();
          throw new Error(
            `Stock épuisé pour « ${p.name} » (goût ${line.flavor}). Merci d'ajuster votre panier.`,
          );
        }
        rollbacks.push({
          kind: "flavor",
          productId: p.id,
          flavor: line.flavor,
          qty: line.quantity,
        });
      }
      if (line.variantId) {
        const { data: newStock, error } = await supabaseAdmin.rpc(
          "decrement_variant_stock",
          { _id: line.variantId, _qty: line.quantity },
        );
        if (error || newStock == null) {
          await rollbackAll();
          const v = variantMap.get(line.variantId);
          throw new Error(
            `Stock épuisé pour « ${p.name} »${v ? ` (${v.volume_ml} ml)` : ""}. Merci d'ajuster votre panier.`,
          );
        }
        rollbacks.push({ kind: "variant", id: line.variantId, qty: line.quantity });
      } else {
        const { data: newStock, error } = await supabaseAdmin.rpc(
          "decrement_product_stock",
          { _id: p.id, _qty: line.quantity },
        );
        if (error || newStock == null) {
          await rollbackAll();
          throw new Error(
            `Stock épuisé pour « ${p.name} ». Merci d'ajuster votre panier.`,
          );
        }
        rollbacks.push({ kind: "product", id: p.id, qty: line.quantity });
      }
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        guest_email: userId ? null : data.email,
        user_id: userId,
        total_cents: totalCents,
        currency,
        status: "a_preparer",
        shipping_address: shipping,
      })
      .select("id, order_number, total_cents, currency")
      .single();
    if (orderErr || !order) {
      console.error("[checkout] order insert failed:", orderErr);
      await rollbackAll();
      throw new Error("Impossible de créer la commande, réessayez.");
    }

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
      itemsToInsert.map((it) => ({ ...it, order_id: order.id })),
    );
    if (itemsErr) {
      // Best-effort rollback: delete the order we just created.
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      await rollbackAll();
      console.error("[checkout] order_items insert failed:", itemsErr);
      throw new Error("Impossible de créer la commande, réessayez.");
    }

    // Génération automatique de la facture (numéro séquentiel + PDF + stockage).
    // Best-effort : ne bloque pas la commande si la facture échoue.
    try {
      const { ensureInvoiceForOrderInternal } = await import("./invoices.functions");
      await ensureInvoiceForOrderInternal(order.id);
    } catch (e) {
      console.error("[invoice] generation failed for order", order.id, e);
    }

    // Email de confirmation (activé une fois le domaine expéditeur configuré).
    try {
      const { sendOrderConfirmationEmail } = await import("./order-emails.server");
      await sendOrderConfirmationEmail(order.id);
    } catch (e) {
      console.error("[email] order confirmation failed for order", order.id, e);
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      totalCents: order.total_cents,
      currency: order.currency,
    };
  });