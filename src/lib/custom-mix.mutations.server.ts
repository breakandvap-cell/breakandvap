import {
  assertMixFlavorsShape,
  assertMixOwnership,
  assertNicotine,
  assertNicotineReachable,
  computeMixPriceCents,
  type MixFlavorInput,
} from "./custom-mix.server";

type Owner = { sessionId: string; userId?: string | null };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveMixDraft(args: {
  mixId?: string | null;
  sessionId: string;
  userId?: string | null;
  bottleProductId: string;
  nicotineMg: number;
  flavors: MixFlavorInput[];
}) {
  assertNicotine(args.nicotineMg);
  assertMixFlavorsShape(args.flavors);
  const { priceCents, currency, brand, bottleVolumeMl } = await computeMixPriceCents({
    bottleProductId: args.bottleProductId,
    flavors: args.flavors,
  });
  await assertNicotineReachable(bottleVolumeMl, args.nicotineMg);

  const db = await admin();
  let mixId = args.mixId ?? null;

  if (mixId) {
    const { data: existing, error } = await db
      .from("custom_mixes")
      .select("id, user_id, session_id, status")
      .eq("id", mixId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) throw new Error("Mix introuvable.");
    assertMixOwnership(existing, {
      userId: args.userId ?? null,
      sessionId: args.sessionId,
    });
    if (existing.status === "ordered") {
      throw new Error("Ce mix a déjà été commandé et ne peut plus être modifié.");
    }
    const { error: upErr } = await db
      .from("custom_mixes")
      .update({
        bottle_product_id: args.bottleProductId,
        nicotine_mg: args.nicotineMg,
        status: "draft",
        price_cents: null,
        user_id: args.userId ?? existing.user_id,
      })
      .eq("id", mixId);
    if (upErr) throw new Error(upErr.message);
    const { error: delErr } = await db
      .from("custom_mix_flavors")
      .delete()
      .eq("custom_mix_id", mixId);
    if (delErr) throw new Error(delErr.message);
  } else {
    const { data: inserted, error } = await db
      .from("custom_mixes")
      .insert({
        user_id: args.userId ?? null,
        session_id: args.sessionId,
        bottle_product_id: args.bottleProductId,
        nicotine_mg: args.nicotineMg,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    mixId = inserted.id;
  }

  const { error: insErr } = await db.from("custom_mix_flavors").insert(
    args.flavors.map((f) => ({
      custom_mix_id: mixId!,
      flavor_product_id: f.flavor_product_id,
      percentage: f.percentage,
    })),
  );
  if (insErr) throw new Error(insErr.message);

  return { mixId: mixId!, estimatedPriceCents: priceCents, currency, brand };
}

export async function validateMix(args: {
  mixId: string;
  sessionId: string;
  userId?: string | null;
}) {
  const db = await admin();
  const { data: mix, error } = await db
    .from("custom_mixes")
    .select("id, user_id, session_id, status, bottle_product_id, nicotine_mg")
    .eq("id", args.mixId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!mix) throw new Error("Mix introuvable.");
  assertMixOwnership(mix, { userId: args.userId ?? null, sessionId: args.sessionId });
  if (mix.status === "ordered") throw new Error("Ce mix a déjà été commandé.");
  if (!mix.bottle_product_id) throw new Error("Choisissez un flacon avant de valider.");
  assertNicotine(mix.nicotine_mg);

  const { data: rows, error: fErr } = await db
    .from("custom_mix_flavors")
    .select("flavor_product_id, percentage")
    .eq("custom_mix_id", args.mixId);
  if (fErr) throw new Error(fErr.message);

  const flavors: MixFlavorInput[] = (rows ?? []).map((r) => ({
    flavor_product_id: r.flavor_product_id,
    percentage: Number(r.percentage),
  }));
  assertMixFlavorsShape(flavors);

  const { priceCents, currency, brand, bottleVolumeMl } = await computeMixPriceCents({
    bottleProductId: mix.bottle_product_id,
    flavors,
  });
  await assertNicotineReachable(bottleVolumeMl, Number(mix.nicotine_mg));

  const { error: upErr } = await db
    .from("custom_mixes")
    .update({ status: "validated", price_cents: priceCents })
    .eq("id", args.mixId);
  if (upErr) throw new Error(upErr.message);

  return { mixId: args.mixId, priceCents, currency, brand };
}

export async function readMix(args: {
  mixId: string;
  sessionId: string;
  userId?: string | null;
}) {
  const db = await admin();
  const { data: mix, error } = await db
    .from("custom_mixes")
    .select("*")
    .eq("id", args.mixId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!mix) return null;
  assertMixOwnership(mix, { userId: args.userId ?? null, sessionId: args.sessionId });

  const { data: flavors, error: fErr } = await db
    .from("custom_mix_flavors")
    .select("id, flavor_product_id, percentage")
    .eq("custom_mix_id", args.mixId);
  if (fErr) throw new Error(fErr.message);

  return { mix, flavors: flavors ?? [] };
}

export type { Owner };

/** Recalcule intégralement un mix au moment de la commande (jamais de prix
 *  fourni par le client) et renvoie la ligne de commande correspondante. */
export async function priceMixForOrder(args: {
  mixId: string;
  sessionId?: string | null;
  userId?: string | null;
}) {
  const db = await admin();
  const { data: mix, error } = await db
    .from("custom_mixes")
    .select("id, user_id, session_id, status, bottle_product_id, nicotine_mg")
    .eq("id", args.mixId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!mix) throw new Error("Mix personnalisé introuvable.");
  assertMixOwnership(mix, {
    userId: args.userId ?? null,
    sessionId: args.sessionId ?? null,
  });
  if (mix.status === "ordered") {
    throw new Error("Ce mix personnalisé a déjà été commandé.");
  }
  if (!mix.bottle_product_id) throw new Error("Mix personnalisé incomplet.");
  assertNicotine(mix.nicotine_mg);

  const { data: rows, error: fErr } = await db
    .from("custom_mix_flavors")
    .select("flavor_product_id, percentage")
    .eq("custom_mix_id", args.mixId);
  if (fErr) throw new Error(fErr.message);
  const flavors: MixFlavorInput[] = (rows ?? []).map((r) => ({
    flavor_product_id: r.flavor_product_id,
    percentage: Number(r.percentage),
  }));
  assertMixFlavorsShape(flavors);

  const { priceCents, currency, brand } = await computeMixPriceCents({
    bottleProductId: mix.bottle_product_id,
    flavors,
  });

  const { data: prods, error: pErr } = await db
    .from("products")
    .select("id, name, volume_ml, photos")
    .in("id", [mix.bottle_product_id, ...flavors.map((f) => f.flavor_product_id)]);
  if (pErr) throw new Error(pErr.message);
  const byId = new Map((prods ?? []).map((p) => [p.id, p]));
  const bottle = byId.get(mix.bottle_product_id);
  const composition = flavors
    .map((f) => `${byId.get(f.flavor_product_id)?.name ?? "Arôme"} ${f.percentage}%`)
    .join(" + ");

  return {
    mixId: mix.id,
    priceCents,
    currency,
    brand,
    nicotineMg: mix.nicotine_mg,
    volumeMl: bottle?.volume_ml ?? null,
    bottleProductId: mix.bottle_product_id,
    composition,
    label: `Mon Mix ${brand}${bottle?.volume_ml ? ` — ${bottle.volume_ml} ml` : ""} — ${composition}${
      mix.nicotine_mg > 0 ? ` — ${mix.nicotine_mg} mg` : " — 0 mg"
    }`,
  };
}

/** Marque les mix comme commandés (après création effective de la commande). */
export async function markMixesOrdered(mixIds: string[]) {
  if (mixIds.length === 0) return;
  const db = await admin();
  await db.from("custom_mixes").update({ status: "ordered" }).in("id", mixIds);
}
