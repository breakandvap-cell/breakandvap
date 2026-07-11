import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

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
        nicotineMg: z.number().int().min(0).max(50).optional(),
        flavor: z.string().trim().min(1).max(80).optional(),
        quantity: z.number().int().min(1).max(50),
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
        boosters_per_nicotine: Record<string, number> | null;
      }
    >();
    if (variantIds.length > 0) {
      const { data: variants, error: vErr } = await supabaseAdmin
        .from("product_variants")
        .select("id, product_id, volume_ml, price_cents, stock, available_nicotine_mg, boosters_per_nicotine")
        .in("id", variantIds);
      if (vErr) {
        console.error("[checkout] variants fetch failed:", vErr);
        throw new Error("Impossible de créer la commande, réessayez.");
      }
      for (const v of variants ?? []) {
        variantMap.set(v.id, {
          id: v.id,
          product_id: v.product_id,
          volume_ml: v.volume_ml,
          price_cents: v.price_cents,
          stock: v.stock,
          available_nicotine_mg: (v.available_nicotine_mg ?? []) as number[],
          boosters_per_nicotine:
            (v.boosters_per_nicotine as Record<string, number> | null) ?? null,
        });
      }
    }

    // Load current booster reference price (used for e-liquides 50/100/200 ml).
    let boosterUnitPriceCents: number | null = null;
    {
      const { data: booster } = await supabaseAdmin
        .from("products")
        .select("price_cents, is_published")
        .eq("is_nicotine_booster", true)
        .maybeSingle();
      if (booster && booster.is_published) {
        boosterUnitPriceCents = booster.price_cents;
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
        let unitPrice = v.price_cents;
        let boostersUsed = 0;
        let boosterUnitPrice: number | null = null;
        if (v.volume_ml !== 10 && nic > 0) {
          const boostersN =
            (v.boosters_per_nicotine ?? {})[String(nic)] ?? 0;
          if (boostersN > 0) {
            if (!boosterUnitPriceCents) {
              throw new Error(
                `Le produit « Booster de nicotine » n'est pas disponible actuellement.`,
              );
            }
            unitPrice += boostersN * boosterUnitPriceCents;
            boostersUsed = boostersN;
            boosterUnitPrice = boosterUnitPriceCents;
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
          base_price_cents: v.price_cents,
          boosters_count: boostersUsed,
          booster_unit_price_cents: boosterUnitPrice,
          nicotine_mg: nic,
          volume_ml: v.volume_ml,
          flavor: flavorLabel,
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
      throw new Error("Impossible de créer la commande, réessayez.");
    }

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
      itemsToInsert.map((it) => ({ ...it, order_id: order.id })),
    );
    if (itemsErr) {
      // Best-effort rollback: delete the order we just created.
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      console.error("[checkout] order_items insert failed:", itemsErr);
      throw new Error("Impossible de créer la commande, réessayez.");
    }

    // Decrement stocks (best-effort; not transactional but adequate at this scale).
    for (const line of data.items) {
      if (line.variantId) continue; // handled below
      const p = productMap.get(line.productId)!;
      const nextStock = Math.max(0, p.stock - line.quantity);
      await supabaseAdmin
        .from("products")
        .update({
          stock: nextStock,
          stock_status:
            nextStock === 0 ? "out_of_stock" : nextStock < 10 ? "low_stock" : "in_stock",
        })
        .eq("id", p.id);
    }
    for (const op of variantStockOps) {
      await supabaseAdmin
        .from("product_variants")
        .update({ stock: op.nextStock })
        .eq("id", op.id);
    }

    // Persist flavor stock decrements (best-effort).
    for (const [productId, list] of flavorOps.entries()) {
      await supabaseAdmin
        .from("products")
        .update({ flavors: list as never })
        .eq("id", productId);
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