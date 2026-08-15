import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MIX_BRANDS, MIX_MAX_FLAVORS, MIX_MAX_NICOTINE_MG } from "./custom-mix";

type AdminContext = { supabase: unknown; userId: string };

async function assertAdmin(context: AdminContext) {
  const { assertAdminSession } = await import("@/lib/admin-security.server");
  await assertAdminSession(context as never);
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Tout ce dont la page de pilotage a besoin : flacons, arômes, recettes, état. */
export const adminMixConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await db();

    const [bottlesRes, flavorsRes, recipesRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, slug, price_cents, currency, volume_ml, stock_status, is_published, photos")
        .eq("category", "accessoire_vape")
        .gt("volume_ml", 0)
        .order("volume_ml", { ascending: true }),
      supabaseAdmin
        .from("products")
        .select("id, name, slug, brand, range_name, subcategory, price_cents, currency, stock_status, is_published, photos")
        .eq("subcategory", "Mon Mix")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("custom_mix_recipes")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("site_settings")
        .select("custom_mix_enabled, booster_volume_ml, booster_concentration_mg_per_ml")
        .eq("singleton", true)
        .maybeSingle(),
    ]);

    for (const r of [bottlesRes, flavorsRes, recipesRes, settingsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    return {
      bottles: bottlesRes.data ?? [],
      flavors: flavorsRes.data ?? [],
      recipes: recipesRes.data ?? [],
      enabled: settingsRes.data?.custom_mix_enabled ?? true,
      boosterVolumeMl: Number(settingsRes.data?.booster_volume_ml) || 10,
      boosterConcentrationMgPerMl:
        Number(settingsRes.data?.booster_concentration_mg_per_ml) || 20,
    };
  });

/** Met à jour le prix d'un flacon vide ou d'un arôme « Mon Mix ». */
export const adminUpdateMixProductPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        price_cents: z.number().int().min(0).max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const supabaseAdmin = await db();
    const { data: p, error } = await supabaseAdmin
      .from("products")
      .select("id, category, subcategory")
      .eq("id", data.product_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Produit introuvable.");
    const eligible =
      p.subcategory === "Mon Mix" || p.category === "accessoire_vape";
    if (!eligible) {
      throw new Error("Ce produit ne fait pas partie du configurateur Mon Mix.");
    }
    const { error: upErr } = await supabaseAdmin
      .from("products")
      .update({ price_cents: data.price_cents })
      .eq("id", data.product_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const };
  });

/** Active ou désactive globalement le configurateur. */
export const adminSetMixEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const supabaseAdmin = await db();
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert({ singleton: true, custom_mix_enabled: data.enabled }, { onConflict: "singleton" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const recipeSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  brand: z.enum(MIX_BRANDS),
  suggested_nicotine_mg: z.number().min(0).max(MIX_MAX_NICOTINE_MG),
  sort_order: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
  parts: z
    .array(
      z.object({
        flavor_product_id: z.string().uuid(),
        percentage: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(MIX_MAX_FLAVORS),
});

/** Crée ou met à jour une recette populaire (validation métier serveur). */
export const adminSaveMixRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recipeSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const total = data.parts.reduce((s, p) => s + p.percentage, 0);
    if (total !== 100) {
      throw new Error("La somme des pourcentages doit être exactement égale à 100.");
    }
    const ids = new Set(data.parts.map((p) => p.flavor_product_id));
    if (ids.size !== data.parts.length) {
      throw new Error("Un même arôme ne peut pas être utilisé deux fois.");
    }

    const supabaseAdmin = await db();
    const { data: prods, error } = await supabaseAdmin
      .from("products")
      .select("id, brand, range_name, subcategory")
      .in("id", [...ids]);
    if (error) throw new Error(error.message);
    const { mixFamilyOf } = await import("./custom-mix");
    for (const p of prods ?? []) {
      const family = mixFamilyOf(p);
      if (family !== data.brand) {
        throw new Error(
          `L'arôme « ${p.id} » n'appartient pas à la famille ${data.brand}.`,
        );
      }
    }

    const row = {
      name: data.name,
      description: data.description,
      brand: data.brand,
      parts: data.parts,
      suggested_nicotine_mg: data.suggested_nicotine_mg,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };

    if (data.id) {
      const { error: upErr } = await supabaseAdmin
        .from("custom_mix_recipes")
        .update(row)
        .eq("id", data.id);
      if (upErr) throw new Error(upErr.message);
      return { id: data.id };
    }
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("custom_mix_recipes")
      .insert(row)
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: ins.id };
  });

export const adminDeleteMixRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const supabaseAdmin = await db();
    const { error } = await supabaseAdmin
      .from("custom_mix_recipes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
