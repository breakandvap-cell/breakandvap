import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

// -------- Types publics ---------
export type ShopCategory = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ShopSubcategory = {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

// -------- Query options (lecture publique) ---------
export const shopCategoriesQueryOptions = () =>
  queryOptions({
    queryKey: ["shop-categories"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShopCategory[];
    },
  });

export const shopSubcategoriesQueryOptions = () =>
  queryOptions({
    queryKey: ["shop-subcategories"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_subcategories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ShopSubcategory[];
    },
  });

// -------- Slugify util partagé ---------
export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// -------- Admin helpers ---------
type AdminContext = { supabase: any; userId: string };
async function assertAdmin(context: AdminContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé.");
}

// -------- Schémas ---------
const categoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Clé invalide (a-z, 0-9, _)"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  image_url: z.string().url().optional().or(z.literal("")),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

const subcategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  category_id: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug invalide (a-z, 0-9, -)"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  image_url: z.string().url().optional().or(z.literal("")),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

// -------- Server functions (admin) ---------
export const adminListCategoriesTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [cats, subs] = await Promise.all([
      supabaseAdmin
        .from("shop_categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("shop_subcategories")
        .select("*")
        .order("sort_order", { ascending: true }),
    ]);
    if (cats.error) throw new Error(cats.error.message);
    if (subs.error) throw new Error(subs.error.message);
    return {
      categories: (cats.data ?? []) as ShopCategory[],
      subcategories: (subs.data ?? []) as ShopSubcategory[],
    };
  });

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categoryInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      key: data.key,
      name: data.name,
      description: data.description || null,
      image_url: data.image_url || null,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("shop_categories")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("shop_categories")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Vérifier qu'aucun produit n'est encore rattaché via la clé de catégorie
    const { data: cat } = await supabaseAdmin
      .from("shop_categories")
      .select("key")
      .eq("id", data.id)
      .maybeSingle();
    if (cat?.key) {
      const { count } = await supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category", cat.key as any);
      if ((count ?? 0) > 0) {
        throw new Error(
          `Impossible de supprimer : ${count} produit(s) sont encore rattaché(s) à cette catégorie.`,
        );
      }
    }
    const { error } = await supabaseAdmin
      .from("shop_categories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpsertSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subcategoryInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Récupère l'ancien nom pour cascader vers products.subcategory le cas échéant
    let oldName: string | null = null;
    let categoryKey: string | null = null;
    if (data.id) {
      const { data: prev } = await supabaseAdmin
        .from("shop_subcategories")
        .select("name, category_id, shop_categories(key)")
        .eq("id", data.id)
        .maybeSingle();
      oldName = (prev as any)?.name ?? null;
      categoryKey = (prev as any)?.shop_categories?.key ?? null;
    }
    const payload = {
      category_id: data.category_id,
      slug: data.slug,
      name: data.name,
      description: data.description || null,
      image_url: data.image_url || null,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("shop_subcategories")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      // Cascader le renommage sur products.subcategory (stocké en clair)
      if (oldName && oldName !== data.name && categoryKey) {
        await supabaseAdmin
          .from("products")
          .update({ subcategory: data.name })
          .eq("category", categoryKey as any)
          .eq("subcategory", oldName);
      }
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("shop_subcategories")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminDeleteSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("shop_subcategories")
      .select("name, shop_categories(key)")
      .eq("id", data.id)
      .maybeSingle();
    const subName = (sub as any)?.name as string | undefined;
    const catKey = (sub as any)?.shop_categories?.key as string | undefined;
    if (subName && catKey) {
      const { count } = await supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category", catKey as any)
        .eq("subcategory", subName);
      if ((count ?? 0) > 0) {
        throw new Error(
          `Impossible de supprimer : ${count} produit(s) sont encore dans cette sous-catégorie. Déplacez-les d'abord.`,
        );
      }
    }
    const { error } = await supabaseAdmin
      .from("shop_subcategories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Upload image catégorie ---------
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const uploadCategoryImageSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  base64: z.string().min(4),
});

export const adminUploadCategoryImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadCategoryImageSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const cleanBase64 = data.base64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(cleanBase64, "base64");
    if (bytes.length === 0) throw new Error("Fichier vide.");
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error("Image trop lourde (4 Mo max).");
    }
    const ext =
      (data.filename.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "jpg";
    const path = `categories/${crypto.randomUUID()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("product-photos")
      .upload(path, bytes, {
        contentType: data.contentType,
        upsert: false,
      });
    if (upErr) throw new Error(`Upload échoué : ${upErr.message}`);
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("product-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message || "URL signée indisponible.");
    }
    return { url: signed.signedUrl, path };
  });