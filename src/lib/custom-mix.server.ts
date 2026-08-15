import {
  availableNicotineRates,
  mixFamilyOf,
  mixFlavorContributionCents,
  MIX_MAX_FLAVORS,
  MIX_MAX_NICOTINE_MG,
} from "./custom-mix";

export type MixFlavorInput = { flavor_product_id: string; percentage: number };

export type MixOwner = { userId: string | null; sessionId: string | null };

/** Validation métier commune (jamais confiance au frontend). */
export function assertMixFlavorsShape(flavors: MixFlavorInput[]) {
  if (flavors.length === 0) {
    throw new Error("Sélectionnez au moins un arôme.");
  }
  if (flavors.length > MIX_MAX_FLAVORS) {
    throw new Error(`Un mix ne peut contenir que ${MIX_MAX_FLAVORS} arômes maximum.`);
  }
  const ids = new Set(flavors.map((f) => f.flavor_product_id));
  if (ids.size !== flavors.length) {
    throw new Error("Un même arôme ne peut pas être sélectionné deux fois.");
  }
  for (const f of flavors) {
    if (!Number.isFinite(f.percentage) || f.percentage < 1 || f.percentage > 100) {
      throw new Error("Chaque pourcentage doit être compris entre 1 et 100.");
    }
  }
  const total = flavors.reduce((s, f) => s + f.percentage, 0);
  if (Math.abs(total - 100) > 1e-6) {
    throw new Error("La somme des pourcentages doit être exactement égale à 100.");
  }
}

export function assertNicotine(nicotineMg: number) {
  if (
    !Number.isFinite(nicotineMg) ||
    nicotineMg < 0 ||
    nicotineMg > MIX_MAX_NICOTINE_MG
  ) {
    throw new Error(`Le taux de nicotine doit être compris entre 0 et ${MIX_MAX_NICOTINE_MG} mg.`);
  }
}

/** Le taux doit correspondre exactement à un nombre entier de boosters
 *  pour la contenance choisie (aucune valeur arbitraire acceptée). */
export async function assertNicotineReachable(
  volumeMl: number | null,
  nicotineMg: number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("booster_volume_ml, booster_concentration_mg_per_ml")
    .eq("singleton", true)
    .maybeSingle();
  const cfg = {
    boosterVolumeMl: Number(data?.booster_volume_ml) || 10,
    boosterConcentrationMgPerMl: Number(data?.booster_concentration_mg_per_ml) || 20,
  };
  const rates = availableNicotineRates(volumeMl, cfg);
  const ok = rates.some((r) => Math.abs(r - nicotineMg) < 0.05);
  if (!ok) {
    throw new Error(
      "Ce taux de nicotine n'est pas réalisable pour cette contenance.",
    );
  }
}

type ProductRef = {
  id: string;
  brand: string | null;
  range_name: string | null;
  price_cents: number;
  currency: string;
  category: string;
  volume_ml: number | null;
  subcategory: string | null;
  is_published: boolean;
  stock_status: string;
};

/** Recalcule le prix côté serveur (source de vérité) :
 *    prix = prix_flacon_vide
 *         + Σ (pourcentage/100 × volume_flacon × prix_500ml_arôme / 500)
 *  La nicotine occupe du volume mais reste offerte (0 €). */
export async function computeMixPriceCents(args: {
  bottleProductId: string;
  flavors: MixFlavorInput[];
}): Promise<{ priceCents: number; currency: string; brand: string; bottleVolumeMl: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const ids = [args.bottleProductId, ...args.flavors.map((f) => f.flavor_product_id)];
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(
      "id, brand, range_name, subcategory, price_cents, currency, category, volume_ml, is_published, stock_status",
    )
    .in("id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map<string, ProductRef>();
  for (const p of (data ?? []) as unknown as ProductRef[]) byId.set(p.id, p);

  const bottle = byId.get(args.bottleProductId);
  if (!bottle || !bottle.is_published) {
    throw new Error("Flacon introuvable ou indisponible.");
  }
  if (bottle.category !== "accessoire_vape" || !bottle.volume_ml || bottle.volume_ml <= 0) {
    throw new Error("Le contenant choisi n'est pas un flacon vide valide.");
  }
  if (bottle.stock_status === "out_of_stock") {
    throw new Error("Ce flacon n'est plus en stock.");
  }

  const families = new Set<string>();
  let flavorsCents = 0;
  for (const f of args.flavors) {
    const p = byId.get(f.flavor_product_id);
    if (!p || !p.is_published) throw new Error("Arôme introuvable ou indisponible.");
    const family = mixFamilyOf(p);
    if (!family) {
      throw new Error("Seuls les arômes Alchimix ou Mixologue sont autorisés.");
    }
    if (p.stock_status === "out_of_stock") throw new Error("Un arôme sélectionné est épuisé.");
    families.add(family);
    flavorsCents += mixFlavorContributionCents(
      p.price_cents,
      f.percentage,
      bottle.volume_ml,
    );
  }

  if (families.size !== 1) {
    throw new Error("Tous les arômes d'un mix doivent appartenir à la même marque.");
  }

  return {
    priceCents: Math.round(bottle.price_cents + flavorsCents),
    currency: bottle.currency ?? "EUR",
    brand: [...families][0]!,
    bottleVolumeMl: bottle.volume_ml!,
  };
}

/** Vérifie que l'appelant est bien propriétaire du mix (client connecté ou invité). */
export function assertMixOwnership(
  row: { user_id: string | null; session_id: string | null },
  owner: MixOwner,
) {
  if (row.user_id) {
    if (!owner.userId || row.user_id !== owner.userId) {
      throw new Error("Mix introuvable.");
    }
    return;
  }
  if (!row.session_id || !owner.sessionId || row.session_id !== owner.sessionId) {
    throw new Error("Mix introuvable.");
  }
}
