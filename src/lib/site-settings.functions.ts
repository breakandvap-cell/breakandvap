import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

// -------- Types publics --------
export type BoosterConfig = {
  boosterVolumeMl: number;
  boosterConcentrationMgPerMl: number;
};

export const DEFAULT_BOOSTER_CONFIG: BoosterConfig = {
  boosterVolumeMl: 10,
  boosterConcentrationMgPerMl: 20,
};

// Lecture publique via la policy `TO anon` de `site_settings`.
export const siteSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ["site-settings"] as const,
    queryFn: async (): Promise<BoosterConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("booster_volume_ml, booster_concentration_mg_per_ml")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return DEFAULT_BOOSTER_CONFIG;
      return {
        boosterVolumeMl: Number(data.booster_volume_ml) || DEFAULT_BOOSTER_CONFIG.boosterVolumeMl,
        boosterConcentrationMgPerMl:
          Number(data.booster_concentration_mg_per_ml) ||
          DEFAULT_BOOSTER_CONFIG.boosterConcentrationMgPerMl,
      };
    },
  });

/** Calcule le taux de nicotine (mg/ml) résultant de N boosters ajoutés
 *  dans un flacon de `bottleVolumeMl`. Arrondi 1 décimale pour affichage. */
export function computeNicotineRateMgPerMl(
  bottleVolumeMl: number,
  boostersCount: number,
  cfg: BoosterConfig,
): number {
  if (!bottleVolumeMl || boostersCount <= 0) return 0;
  const mg = boostersCount * cfg.boosterVolumeMl * cfg.boosterConcentrationMgPerMl;
  const rate = mg / bottleVolumeMl;
  return Math.round(rate * 10) / 10;
}

// -------- Admin --------
const inputSchema = z.object({
  booster_volume_ml: z.number().positive().max(1000),
  booster_concentration_mg_per_ml: z.number().positive().max(1000),
});

type AdminContext = { supabase: any; userId: string };
async function assertAdmin(context: AdminContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé.");
}

export const adminUpdateBoosterConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(
        {
          singleton: true,
          booster_volume_ml: data.booster_volume_ml,
          booster_concentration_mg_per_ml: data.booster_concentration_mg_per_ml,
        },
        { onConflict: "singleton" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });