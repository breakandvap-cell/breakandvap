import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import {
  SPIN_SELECT,
  pickWeighted,
  spinSchema,
  toPending,
  type SpinRow,
} from "@/lib/wheel-shared";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import type { DiscountType, WheelType } from "@/lib/promotions.functions";

export type PublicWheelPrize = {
  id: string;
  label: string;
  discount_type: DiscountType;
  discount_value: number;
  weight: number;
};

export type PendingSpin = {
  id: string;
  wheel_type: WheelType;
  prize_id: string | null;
  label: string;
  discount_type: DiscountType;
  discount_value: number;
  /** Montant figé au tirage (0 = pourcentage calculé à la commande). */
  discount_amount_cents: number;
  expires_at: string;
};

export type WheelState = {
  welcomeEnabled: boolean;
  generalEnabled: boolean;
  /** true si le client n'a jamais joué la roue de bienvenue. */
  welcomeAvailable: boolean;
  generalAvailable: boolean;
  pending: PendingSpin[];
};

/** Lots actifs d'une roue (lecture publique). */
export const wheelPrizesQueryOptions = (wheelType: WheelType) =>
  queryOptions({
    queryKey: ["wheel-prizes", wheelType] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<PublicWheelPrize[]> => {
      const { data, error } = await supabase
        .from("wheel_prizes")
        .select("id, label, discount_type, discount_value, weight")
        .eq("wheel_type", wheelType)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        id: p.id as string,
        label: p.label as string,
        discount_type: p.discount_type as DiscountType,
        discount_value: Number(p.discount_value),
        weight: Number(p.weight ?? 1),
      }));
    },
  });

/** État des roues pour le client connecté. */
export const getWheelState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WheelState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const [{ data: settings }, { data: spins }] = await Promise.all([
      supabaseAdmin
        .from("site_settings")
        .select("welcome_wheel_enabled, general_wheel_enabled")
        .eq("singleton", true)
        .maybeSingle(),
      supabaseAdmin.from("wheel_spins").select(SPIN_SELECT).eq("user_id", userId),
    ]);
    const rows = (spins ?? []) as unknown as SpinRow[];
    const now = Date.now();
    const pending = rows
      .filter((r) => r.status === "pending" && new Date(r.expires_at).getTime() > now)
      .map(toPending);
    const s = (settings ?? {}) as {
      welcome_wheel_enabled?: boolean;
      general_wheel_enabled?: boolean;
    };
    const welcomeEnabled = s.welcome_wheel_enabled ?? false;
    const generalEnabled = s.general_wheel_enabled ?? false;
    return {
      welcomeEnabled,
      generalEnabled,
      welcomeAvailable:
        welcomeEnabled && !rows.some((r) => r.wheel_type === "welcome"),
      generalAvailable:
        generalEnabled && !pending.some((p) => p.wheel_type === "general"),
      pending,
    };
  });

/**
 * Effectue un tirage. Toute la logique (éligibilité, tirage pondéré, montant
 * de la remise) est calculée côté serveur ; le client ne fait qu'animer.
 */
export const spinWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => spinSchema.parse(d))
  .handler(async ({ context, data }): Promise<PendingSpin> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: settings } = await supabaseAdmin
      .from("site_settings")
      .select("welcome_wheel_enabled, general_wheel_enabled")
      .eq("singleton", true)
      .maybeSingle();
    const s = (settings ?? {}) as {
      welcome_wheel_enabled?: boolean;
      general_wheel_enabled?: boolean;
    };
    const enabled =
      data.wheel_type === "welcome"
        ? (s.welcome_wheel_enabled ?? false)
        : (s.general_wheel_enabled ?? false);
    if (!enabled) throw new Error("Cette roue n'est pas disponible.");

    const { data: existing } = await supabaseAdmin
      .from("wheel_spins")
      .select("id, status, expires_at")
      .eq("user_id", userId)
      .eq("wheel_type", data.wheel_type);
    const rows = (existing ?? []) as Array<{
      id: string;
      status: string;
      expires_at: string;
    }>;
    if (data.wheel_type === "welcome" && rows.length > 0) {
      throw new Error("Vous avez déjà joué la roue de bienvenue.");
    }
    if (
      data.wheel_type === "general" &&
      rows.some(
        (r) => r.status === "pending" && new Date(r.expires_at).getTime() > Date.now(),
      )
    ) {
      throw new Error("Vous avez déjà un gain en attente.");
    }

    const { data: prizes } = await supabaseAdmin
      .from("wheel_prizes")
      .select("id, label, discount_type, discount_value, weight")
      .eq("wheel_type", data.wheel_type)
      .eq("is_active", true);
    const pool = ((prizes ?? []) as unknown as Array<{
      id: string;
      label: string;
      discount_type: DiscountType;
      discount_value: number;
      weight: number;
    }>).map((p) => ({ ...p, weight: Number(p.weight ?? 0) }));
    const prize = pickWeighted(pool);
    if (!prize) throw new Error("Aucun lot n'est configuré pour cette roue.");

    // Roue générale : le montant est figé au tirage à partir du panier.
    let amountCents = 0;
    if (data.wheel_type === "general") {
      const subtotal = data.cart_subtotal_cents ?? 0;
      amountCents =
        prize.discount_type === "percentage"
          ? Math.round((subtotal * Number(prize.discount_value)) / 100)
          : Math.round(Number(prize.discount_value) * 100);
      amountCents = Math.max(0, Math.min(subtotal, amountCents));
    } else if (prize.discount_type === "fixed_amount") {
      amountCents = Math.round(Number(prize.discount_value) * 100);
    }

    const expiresAt = new Date(
      Date.now() + (data.wheel_type === "welcome" ? 7 * 24 : 24) * 3600 * 1000,
    ).toISOString();

    const { data: inserted, error } = await supabaseAdmin
      .from("wheel_spins")
      .insert({
        user_id: userId,
        wheel_type: data.wheel_type,
        prize_id: prize.id,
        discount_amount_cents: amountCents,
        status: "pending",
        expires_at: expiresAt,
      })
      .select(SPIN_SELECT)
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Tirage impossible.");
    return toPending(inserted as unknown as SpinRow);
  });
