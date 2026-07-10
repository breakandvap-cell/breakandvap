import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "Slug invalide (a-z, 0-9, -)"),
  category: z.enum(["cbd", "e_liquide", "accessoire"]),
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
    const { data, error } = await context.supabase.rpc("claim_admin_if_none");
    if (error) throw new Error(error.message);
    return { claimed: Boolean(data) };
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
    return {
      counts: {
        toPrepare: toPrep.count ?? 0,
        shipped: shipped.count ?? 0,
        totalProducts: total.count ?? 0,
      },
      lowStock: low.data ?? [],
      latestOrders: latest.data ?? [],
    };
  });

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, category, price_cents, currency, stock, stock_status, is_published, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      updated_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin.from("products").update(payload).eq("id", data.id).select("id").single();
      if (error) throw new Error(error.message);
      await logAction(context.userId, "product.update", "product", row.id, { name: data.name });
      return { id: row.id };
    }
    const { data: row, error } = await supabaseAdmin.from("products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    await logAction(context.userId, "product.create", "product", row.id, { name: data.name });
    return { id: row.id };
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
      supabaseAdmin.from("order_items").select("id, product_id, product_name, quantity, unit_price_cents").eq("order_id", data.id),
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
    const patch = {
      status: data.status,
      tracking_number: data.tracking_number || null,
      ...(data.status === "expediee" ? { shipped_at: new Date().toISOString() } : {}),
    };
    const { error } = await supabaseAdmin.from("orders").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "order.update", "order", data.id, { status: data.status });
    return { ok: true };
  });
