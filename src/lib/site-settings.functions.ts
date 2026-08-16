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

/** Références booster « officielles » (une par type). Renseignées via
 *  /admin/references-techniques. Si null, le checkout retombe sur le
 *  premier booster publié de ce type. */
export type DefaultBoosterRefs = {
  defaultBoosterNormaleId: string | null;
  defaultBoosterSelId: string | null;
  defaultBoosterIceId: string | null;
};

export type MixToggle = { customMixEnabled: boolean };

/** Prix par booster de nicotine sur le format 500 ml de « Mon Mix ». */
export type MixBulkPricing = { mixBulkBoosterPriceCents: number };

export const DEFAULT_BOOSTER_REFS: DefaultBoosterRefs = {
  defaultBoosterNormaleId: null,
  defaultBoosterSelId: null,
  defaultBoosterIceId: null,
};

// Lecture publique via la policy `TO anon` de `site_settings`.
export const siteSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ["site-settings"] as const,
    queryFn: async (): Promise<
      BoosterConfig & DefaultBoosterRefs & MixToggle & MixBulkPricing
    > => {
      const { data, error } = await supabase
        .from("site_settings")
        .select(
          "booster_volume_ml, booster_concentration_mg_per_ml, default_booster_normale_id, default_booster_sel_id, default_booster_ice_id, custom_mix_enabled, mix_bulk_booster_price_cents",
        )
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data)
        return {
          ...DEFAULT_BOOSTER_CONFIG,
          ...DEFAULT_BOOSTER_REFS,
          customMixEnabled: true,
          mixBulkBoosterPriceCents: 100,
        };
      return {
        boosterVolumeMl: Number(data.booster_volume_ml) || DEFAULT_BOOSTER_CONFIG.boosterVolumeMl,
        boosterConcentrationMgPerMl:
          Number(data.booster_concentration_mg_per_ml) ||
          DEFAULT_BOOSTER_CONFIG.boosterConcentrationMgPerMl,
        defaultBoosterNormaleId:
          (data as { default_booster_normale_id?: string | null }).default_booster_normale_id ?? null,
        defaultBoosterSelId:
          (data as { default_booster_sel_id?: string | null }).default_booster_sel_id ?? null,
        defaultBoosterIceId:
          (data as { default_booster_ice_id?: string | null }).default_booster_ice_id ?? null,
        customMixEnabled:
          (data as { custom_mix_enabled?: boolean | null }).custom_mix_enabled ?? true,
        mixBulkBoosterPriceCents:
          Number(
            (data as { mix_bulk_booster_price_cents?: number | null })
              .mix_bulk_booster_price_cents,
          ) || 100,
      };
    },
  });

/** Calcule le taux de nicotine (mg/ml) résultant de N boosters ajoutés
 *  dans un flacon de `bottleVolumeMl`.
 *
 *  Formule : le volume total augmente réellement avec chaque booster ajouté
 *  (le booster est un liquide, pas juste de la nicotine pure).
 *    volume_final = bottleVolumeMl + n × boosterVolumeMl
 *    nicotine_mg  = n × boosterVolumeMl × boosterConcentrationMgPerMl
 *    taux_mg/ml   = nicotine_mg / volume_final
 *  Arrondi au 0,5 mg/ml le plus proche pour l'affichage (au plus près de la
 *  valeur réelle sans afficher un taux plus fort que celui obtenu). */
export function computeNicotineRateMgPerMl(
  bottleVolumeMl: number,
  boostersCount: number,
  cfg: BoosterConfig,
): number {
  if (!bottleVolumeMl || boostersCount <= 0) return 0;
  const mg = boostersCount * cfg.boosterVolumeMl * cfg.boosterConcentrationMgPerMl;
  const finalVolume = bottleVolumeMl + boostersCount * cfg.boosterVolumeMl;
  if (finalVolume <= 0) return 0;
  return Math.round((mg / finalVolume) * 2) / 2;
}

/** Taux exact (non arrondi) — utilisé pour l'aperçu admin qui montre la
 *  valeur décimale avant arrondi au 0,5 mg près. */
export function computeNicotineRateMgPerMlRaw(
  bottleVolumeMl: number,
  boostersCount: number,
  cfg: BoosterConfig,
): number {
  if (!bottleVolumeMl || boostersCount <= 0) return 0;
  const mg = boostersCount * cfg.boosterVolumeMl * cfg.boosterConcentrationMgPerMl;
  const finalVolume = bottleVolumeMl + boostersCount * cfg.boosterVolumeMl;
  if (finalVolume <= 0) return 0;
  return mg / finalVolume;
}

/** Formatage FR : "3 mg", "1,5 mg", "0 mg". Arrondi au 0,5 le plus proche. */
export function formatNicotineMg(mg: number | null | undefined): string {
  if (mg == null || !Number.isFinite(mg)) return "";
  const rounded = Math.round(mg * 2) / 2;
  const s = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
  return `${s} mg`;
}

// -------- Admin --------
const inputSchema = z.object({
  booster_volume_ml: z.number().positive().max(1000),
  booster_concentration_mg_per_ml: z.number().positive().max(1000),
});

type AdminContext = { supabase: any; userId: string };
async function assertAdmin(context: AdminContext) {
  const { assertAdminSession } = await import("@/lib/admin-security.server");
  await assertAdminSession(context as never);
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

// ============================================================================
// Références booster globales (une par type). Sélectionnées explicitement
// dans /admin/references-techniques. Le checkout et la fiche e-liquide s'y
// appuient en priorité — repli sur « premier publié du type » si absent.
// ============================================================================

const boosterRefSchema = z.object({
  booster_type: z.enum(["normale", "sel", "ice"]),
  product_id: z.string().uuid().nullable(),
});

export const adminUpdateDefaultBooster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boosterRefSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Vérifie que le produit ciblé correspond bien au bon type (sinon on
    // laisserait l'admin sélectionner un produit sans rapport). null autorisé
    // pour retirer la référence.
    if (data.product_id) {
      const { data: p, error } = await supabaseAdmin
        .from("products")
        .select("id, is_nicotine_booster, booster_type")
        .eq("id", data.product_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!p) throw new Error("Produit introuvable.");
      if (!p.is_nicotine_booster) {
        throw new Error(
          "Le produit sélectionné n'est pas marqué comme booster de nicotine.",
        );
      }
      const t = ((p as { booster_type?: string | null }).booster_type ?? "normale")
        .toString()
        .trim()
        .toLowerCase();
      if (t !== data.booster_type) {
        throw new Error(
          `Le produit sélectionné est de type « ${t} », attendu « ${data.booster_type} ».`,
        );
      }
    }
    const column =
      data.booster_type === "normale"
        ? "default_booster_normale_id"
        : data.booster_type === "sel"
          ? "default_booster_sel_id"
          : "default_booster_ice_id";
    const patch: Record<string, unknown> = { singleton: true };
    patch[column] = data.product_id;
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(patch as never, { onConflict: "singleton" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });