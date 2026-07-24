import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Utilitaires internes ----------

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé.");
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

// ---------- Schémas ----------

const lineSchema = z.object({
  line: z.number().int().min(1),
  supplier: z.string().trim().min(1).max(120),
  supplier_ref: z.string().trim().max(120).optional().or(z.literal("")),
  supplier_label: z.string().trim().max(400).optional().or(z.literal("")),
  qty: z.number().int().min(1).max(100_000),
  unit_price_ht_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
});

// ---------- Matching des lignes ----------

export const receptionMatchLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { lines: z.infer<typeof lineSchema>[] }) =>
    z.object({ lines: z.array(lineSchema).min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const suppliers = Array.from(new Set(data.lines.map((l) => norm(l.supplier))));
    const { data: mappings, error: mErr } = await supabaseAdmin
      .from("supplier_mappings")
      .select("id, supplier, supplier_ref, supplier_label, variant_id")
      .in("supplier", suppliers.length ? suppliers.map((s) => s) : [""])
      .limit(5000);
    // Note : recherche exacte insensible à la casse via lookup en mémoire.
    // On récupère toutes les correspondances des fournisseurs concernés puis
    // on filtre côté serveur pour rester tolérant à la casse.
    if (mErr) throw new Error(mErr.message);

    const byRef = new Map<string, string>(); // key = supplier|ref -> variant_id
    const byLabel = new Map<string, string>(); // key = supplier|label -> variant_id
    for (const m of mappings ?? []) {
      const sup = norm(m.supplier);
      if (m.supplier_ref) byRef.set(`${sup}|${norm(m.supplier_ref)}`, m.variant_id);
      if (m.supplier_label) byLabel.set(`${sup}|${norm(m.supplier_label)}`, m.variant_id);
    }

    const matchedIds = new Set<string>();
    const matches: Array<{ line: number; variantId: string }> = [];
    const unmatchedLines: typeof data.lines = [];

    for (const l of data.lines) {
      const sup = norm(l.supplier);
      const byRefHit = l.supplier_ref ? byRef.get(`${sup}|${norm(l.supplier_ref)}`) : undefined;
      const byLabelHit = !byRefHit && l.supplier_label
        ? byLabel.get(`${sup}|${norm(l.supplier_label)}`)
        : undefined;
      const hit = byRefHit ?? byLabelHit;
      if (hit) {
        matches.push({ line: l.line, variantId: hit });
        matchedIds.add(hit);
      } else {
        unmatchedLines.push(l);
      }
    }

    // Charger les infos variantes pour l'aperçu
    let variantInfo = new Map<
      string,
      { id: string; sku: string | null; volume_ml: number; nicotine_type: string; stock: number; product_id: string; product_name: string; brand: string | null; range: string | null }
    >();
    if (matchedIds.size > 0) {
      const { data: variants, error: vErr } = await supabaseAdmin
        .from("product_variants")
        .select("id, sku, volume_ml, nicotine_type, stock, product_id, products!inner(name, brand, product_range)")
        .in("id", Array.from(matchedIds));
      if (vErr) throw new Error(vErr.message);
      for (const v of variants ?? []) {
        const p = (v as any).products;
        variantInfo.set(v.id, {
          id: v.id,
          sku: v.sku,
          volume_ml: v.volume_ml,
          nicotine_type: v.nicotine_type,
          stock: v.stock,
          product_id: v.product_id,
          product_name: p?.name ?? "",
          brand: p?.brand ?? null,
          range: p?.product_range ?? null,
        });
      }
    }

    const recognized = matches
      .map((m) => {
        const src = data.lines.find((l) => l.line === m.line)!;
        const v = variantInfo.get(m.variantId);
        if (!v) return null;
        return {
          line: m.line,
          supplier: src.supplier,
          supplier_ref: src.supplier_ref ?? "",
          supplier_label: src.supplier_label ?? "",
          qty: src.qty,
          variantId: v.id,
          sku: v.sku,
          volume_ml: v.volume_ml,
          nicotine_type: v.nicotine_type,
          current_stock: v.stock,
          new_stock: v.stock + src.qty,
          product_id: v.product_id,
          product_name: v.product_name,
          brand: v.brand,
          range: v.range,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;

    const unrecognized = unmatchedLines.map((l) => ({
      line: l.line,
      supplier: l.supplier,
      supplier_ref: l.supplier_ref ?? "",
      supplier_label: l.supplier_label ?? "",
      qty: l.qty,
      unit_price_ht_cents: l.unit_price_ht_cents ?? null,
    }));

    return { recognized, unrecognized };
  });

// ---------- Recherche de variantes pour association manuelle ----------

export const receptionSearchVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string }) =>
    z.object({ query: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.query.trim();
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    // Recherche sur SKU variante ou nom produit / marque / gamme.
    const { data: rows, error } = await supabaseAdmin
      .from("product_variants")
      .select("id, sku, volume_ml, nicotine_type, stock, products!inner(id, name, brand, product_range)")
      .or(`sku.ilike.${like}`)
      .limit(20);
    if (error) throw new Error(error.message);

    const { data: rows2, error: err2 } = await supabaseAdmin
      .from("product_variants")
      .select("id, sku, volume_ml, nicotine_type, stock, products!inner(id, name, brand, product_range)")
      .or(`name.ilike.${like},brand.ilike.${like},product_range.ilike.${like}`, {
        referencedTable: "products",
      })
      .limit(20);
    if (err2) throw new Error(err2.message);

    const seen = new Set<string>();
    const merged = [...(rows ?? []), ...(rows2 ?? [])]
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .map((r) => {
        const p = (r as any).products;
        return {
          id: r.id,
          sku: r.sku,
          volume_ml: r.volume_ml,
          nicotine_type: r.nicotine_type,
          stock: r.stock,
          product_id: p?.id,
          product_name: p?.name ?? "",
          brand: p?.brand ?? null,
          range: p?.product_range ?? null,
        };
      });
    return merged.slice(0, 30);
  });

// ---------- Association manuelle : crée la correspondance ----------

export const receptionCreateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    supplier: string;
    supplier_ref?: string | null;
    supplier_label?: string | null;
    variant_id: string;
  }) =>
    z
      .object({
        supplier: z.string().trim().min(1).max(120),
        supplier_ref: z.string().trim().max(120).nullable().optional(),
        supplier_label: z.string().trim().max(400).nullable().optional(),
        variant_id: z.string().uuid(),
      })
      .refine((v) => (v.supplier_ref && v.supplier_ref.length > 0) || (v.supplier_label && v.supplier_label.length > 0), {
        message: "Référence ou libellé fournisseur requis.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      supplier: data.supplier.trim(),
      supplier_ref: data.supplier_ref?.trim() || null,
      supplier_label: data.supplier_label?.trim() || null,
      variant_id: data.variant_id,
      created_by: context.userId,
    };
    // Upsert manuel : si (supplier, supplier_ref) existe, on met à jour la variante ciblée.
    if (payload.supplier_ref) {
      const { data: existing } = await supabaseAdmin
        .from("supplier_mappings")
        .select("id")
        .ilike("supplier", payload.supplier)
        .ilike("supplier_ref", payload.supplier_ref)
        .maybeSingle();
      if (existing) {
        const { error } = await supabaseAdmin
          .from("supplier_mappings")
          .update({ variant_id: payload.variant_id, supplier_label: payload.supplier_label })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return { id: existing.id, updated: true };
      }
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("supplier_mappings")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

// ---------- Application des mises à jour de stock ----------

export const receptionApplyStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    supplier: string;
    updates: Array<{ variant_id: string; qty: number }>;
    counts: { pending: number; to_create: number };
  }) =>
    z
      .object({
        supplier: z.string().trim().min(1).max(120),
        updates: z
          .array(
            z.object({
              variant_id: z.string().uuid(),
              qty: z.number().int().min(1).max(100_000),
            }),
          )
          .min(1)
          .max(2000),
        counts: z.object({
          pending: z.number().int().min(0),
          to_create: z.number().int().min(0),
        }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let updated = 0;
    const failures: Array<{ variant_id: string; message: string }> = [];

    for (const u of data.updates) {
      const { data: newStock, error } = await supabaseAdmin.rpc("increment_variant_stock", {
        _id: u.variant_id,
        _qty: u.qty,
      });
      if (error) {
        failures.push({ variant_id: u.variant_id, message: error.message });
        continue;
      }
      if (newStock == null) {
        failures.push({ variant_id: u.variant_id, message: "Variante introuvable." });
        continue;
      }
      updated++;
    }

    // Journal admin
    await supabaseAdmin.from("admin_action_log").insert({
      admin_id: context.userId,
      action: "supplier_reception.apply",
      entity_type: "supplier_reception",
      entity_id: null,
      details: {
        supplier: data.supplier,
        updated,
        failed: failures.length,
        pending_association: data.counts.pending,
        to_create: data.counts.to_create,
      } as never,
    });

    return { updated, failures, pending: data.counts.pending, to_create: data.counts.to_create };
  });