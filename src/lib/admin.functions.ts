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
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        volume_ml: z.number().int().positive().max(10_000),
        price_cents: z.number().int().min(0).max(1_000_000),
        stock: z.number().int().min(0).max(100_000),
        max_nicotine_mg: z.number().int().min(0).max(50),
      }),
    )
    .max(20)
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
    return { profile: prof.data, orders: orders.data ?? [] };
  });
