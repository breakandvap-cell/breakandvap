import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const orderInputSchema = z.object({
  email: z.string().trim().email().max(255),
  shipping: z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
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
      .select("id, name, price_cents, currency, stock, stock_status, is_published")
      .in("id", ids);
    if (prodErr) throw new Error(prodErr.message);
    if (!products || products.length === 0) {
      throw new Error("Aucun produit valide dans le panier.");
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    let currency = "EUR";
    let totalCents = 0;
    const itemsToInsert: {
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price_cents: number;
    }[] = [];

    for (const line of data.items) {
      const p = productMap.get(line.productId);
      if (!p || !p.is_published) {
        throw new Error(`Produit indisponible.`);
      }
      if (p.stock_status === "out_of_stock" || p.stock < line.quantity) {
        throw new Error(`Stock insuffisant pour "${p.name}".`);
      }
      currency = p.currency;
      totalCents += p.price_cents * line.quantity;
      itemsToInsert.push({
        product_id: p.id,
        product_name: p.name,
        quantity: line.quantity,
        unit_price_cents: p.price_cents,
      });
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
      throw new Error(orderErr?.message ?? "Création de commande impossible.");
    }

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
      itemsToInsert.map((it) => ({ ...it, order_id: order.id })),
    );
    if (itemsErr) {
      // Best-effort rollback: delete the order we just created.
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      throw new Error(itemsErr.message);
    }

    // Decrement stocks (best-effort; not transactional but adequate at this scale).
    for (const line of data.items) {
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

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      totalCents: order.total_cents,
      currency: order.currency,
    };
  });