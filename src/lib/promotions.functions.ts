import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export type DiscountType = "percentage" | "fixed_amount";
export type PromotionScope = "site" | "category" | "product";
export type WheelType = "welcome" | "general";

export type Promotion = {
  id: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  scope: PromotionScope;
  scope_id: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type WheelPrize = {
  id: string;
  wheel_type: WheelType;
  label: string;
  discount_type: DiscountType;
  discount_value: number;
  weight: number;
  is_active: boolean;
  created_at: string;
};

export type WheelStats = {
  wheel_type: WheelType;
  spins: number;
  used: number;
  total_discount_cents: number;
};

export type WheelToggles = {
  welcome_wheel_enabled: boolean;
  general_wheel_enabled: boolean;
};

/** Lecture publique des interrupteurs de roues (policy `TO anon`). */
export const wheelTogglesQueryOptions = () =>
  queryOptions({
    queryKey: ["wheel-toggles"] as const,
    queryFn: async (): Promise<WheelToggles> => {
      const { data, error } = await supabase
        .from("site_settings" as never)
        .select("welcome_wheel_enabled, general_wheel_enabled")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Partial<WheelToggles>;
      return {
        welcome_wheel_enabled: row.welcome_wheel_enabled ?? false,
        general_wheel_enabled: row.general_wheel_enabled ?? false,
      };
    },
  });

type AdminContext = { supabase: unknown; userId: string };
async function assertAdmin(context: AdminContext) {
  const { assertAdminSession } = await import("@/lib/admin-security.server");
  await assertAdminSession(context as never);
}

// ---------------------------------------------------------------- Promotions

const promotionSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    discount_type: z.enum(["percentage", "fixed_amount"]),
    discount_value: z.number().positive().max(100000),
    scope: z.enum(["site", "category", "product"]),
    scope_id: z.string().uuid().nullable().optional(),
    start_date: z.string().min(1),
    end_date: z.string().nullable().optional(),
    is_active: z.boolean().default(true),
  })
  .refine((v) => v.scope === "site" || !!v.scope_id, {
    message: "Sélectionnez la catégorie ou le produit concerné.",
    path: ["scope_id"],
  })
  .refine((v) => v.discount_type !== "percentage" || v.discount_value <= 100, {
    message: "Un pourcentage ne peut pas dépasser 100.",
    path: ["discount_value"],
  })
  .refine(
    (v) => !v.end_date || new Date(v.end_date) > new Date(v.start_date),
    { message: "La date de fin doit suivre la date de début.", path: ["end_date"] },
  );

export const adminListPromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("promotions" as never)
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Promotion[];
  });

export const adminUpsertPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promotionSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      scope: data.scope,
      scope_id: data.scope === "site" ? null : (data.scope_id ?? null),
      start_date: data.start_date,
      end_date: data.end_date || null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("promotions" as never)
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("promotions" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const adminSetPromotionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("promotions" as never)
      .update({ is_active: data.is_active } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeletePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("promotions" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --------------------------------------------------------------- Roues / lots

const prizeSchema = z.object({
  id: z.string().uuid().optional(),
  wheel_type: z.enum(["welcome", "general"]),
  label: z.string().trim().min(1).max(60),
  discount_type: z.enum(["percentage", "fixed_amount"]),
  discount_value: z.number().min(0).max(100000),
  /** Probabilité directe en pourcentage (0-100). */
  weight: z.number().min(0).max(100),
  is_active: z.boolean().default(true),
});

export const adminListWheelPrizes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wheel_prizes" as never)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as WheelPrize[];
  });

export const adminUpsertWheelPrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => prizeSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      wheel_type: data.wheel_type,
      label: data.label,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      weight: data.weight,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("wheel_prizes" as never)
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("wheel_prizes" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const adminDeleteWheelPrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wheel_prizes" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminSetWheelEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ wheel_type: z.enum(["welcome", "general"]), enabled: z.boolean() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const column =
      data.wheel_type === "welcome"
        ? "welcome_wheel_enabled"
        : "general_wheel_enabled";
    const patch: Record<string, unknown> = { singleton: true };
    patch[column] = data.enabled;
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(patch as never, { onConflict: "singleton" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminWheelSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: spins, error }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from("wheel_spins" as never)
        .select("wheel_type, status, discount_amount_cents"),
      supabaseAdmin
        .from("site_settings")
        .select("welcome_wheel_enabled, general_wheel_enabled")
        .eq("singleton", true)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const base: Record<WheelType, WheelStats> = {
      welcome: { wheel_type: "welcome", spins: 0, used: 0, total_discount_cents: 0 },
      general: { wheel_type: "general", spins: 0, used: 0, total_discount_cents: 0 },
    };
    for (const raw of (spins ?? []) as unknown as Array<{
      wheel_type: WheelType;
      status: string;
      discount_amount_cents: number | null;
    }>) {
      const s = base[raw.wheel_type];
      if (!s) continue;
      s.spins += 1;
      if (raw.status === "used") {
        s.used += 1;
        s.total_discount_cents += raw.discount_amount_cents ?? 0;
      }
    }
    const row = (settings ?? {}) as Partial<WheelToggles>;
    return {
      stats: base,
      toggles: {
        welcome_wheel_enabled: row.welcome_wheel_enabled ?? false,
        general_wheel_enabled: row.general_wheel_enabled ?? false,
      } as WheelToggles,
    };
  });
