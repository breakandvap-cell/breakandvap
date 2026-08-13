// Envoi des alertes de réapprovisionnement.
// Une alerte pending est déclenchée dès que le stock du produit (ou de la
// variante) concerné repasse au-dessus de 0. Aucune modification de la logique
// de décrémentation existante : on relit simplement le stock courant.

type SendFn = (
  name: string,
  to: string,
  opts?: { templateData?: unknown; idempotencyKey?: string },
) => Promise<{ sent: boolean }>;

async function loadSender(): Promise<SendFn | null> {
  try {
    const specifier = ["@", "lib", "email-templates", "send-email"].join("/");
    const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
    const mod = (await dynamicImport(specifier)) as { sendTemplateEmail?: SendFn };
    return mod.sendTemplateEmail ?? null;
  } catch {
    return null;
  }
}

const SITE_URL = "https://breakandvap.lovable.app";

/**
 * Notifie les clients en attente pour les produits/variantes de nouveau en
 * stock, puis passe leurs alertes en `sent`.
 * Les alertes qui n'ont pas pu partir (canal SMS non configuré, domaine email
 * absent) restent en `pending` et seront retentées.
 */
export async function dispatchRestockNotifications(scope?: {
  productIds?: string[];
  variantIds?: string[];
}): Promise<{ checked: number; sent: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("stock_notifications")
    .select("id, product_id, variant_id, email, phone, channel")
    .eq("status", "pending")
    .limit(500);
  if (scope?.productIds?.length) query = query.in("product_id", scope.productIds);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[restock] fetch pending failed:", error);
    return { checked: 0, sent: 0, skipped: 0 };
  }
  const pending = (rows ?? []).filter(
    (r) =>
      !scope?.variantIds?.length ||
      (r.variant_id !== null && scope.variantIds.includes(r.variant_id)),
  );
  if (pending.length === 0) return { checked: 0, sent: 0, skipped: 0 };

  const productIds = Array.from(new Set(pending.map((r) => r.product_id)));
  const variantIds = Array.from(
    new Set(pending.map((r) => r.variant_id).filter((v): v is string => Boolean(v))),
  );

  const [prodRes, varRes] = await Promise.all([
    supabaseAdmin.from("products").select("id, name, slug, stock").in("id", productIds),
    variantIds.length
      ? supabaseAdmin
          .from("product_variants")
          .select("id, stock, volume_ml")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; stock: number; volume_ml: number }> }),
  ]);

  const products = new Map((prodRes.data ?? []).map((p) => [p.id, p]));
  const variants = new Map(
    ((varRes.data ?? []) as Array<{ id: string; stock: number; volume_ml: number }>).map((v) => [
      v.id,
      v,
    ]),
  );

  const send = await loadSender();
  const notified: string[] = [];
  let skipped = 0;

  for (const row of pending) {
    const product = products.get(row.product_id);
    if (!product) continue;
    const variant = row.variant_id ? variants.get(row.variant_id) : null;
    if (row.variant_id && !variant) continue;
    const inStock = variant ? variant.stock > 0 : product.stock > 0;
    if (!inStock) continue;

    const label = variant ? `${product.name} — ${variant.volume_ml} ml` : product.name;
    const url = `${SITE_URL}/produit/${product.slug}`;
    let delivered = false;

    if ((row.channel === "email" || row.channel === "both") && row.email) {
      if (send) {
        try {
          const res = await send("restock-available", row.email, {
            templateData: { productName: label, productUrl: url },
            idempotencyKey: `restock-${row.id}`,
          });
          delivered = res.sent || delivered;
        } catch (e) {
          console.error("[restock] email send failed:", e);
        }
      } else {
        console.warn("[restock] email sender unavailable — configure email domain");
      }
    }

    if ((row.channel === "sms" || row.channel === "both") && row.phone) {
      // Aucun fournisseur SMS configuré pour le moment : la ligne reste en
      // attente si le SMS était le seul canal demandé.
      console.warn("[restock] SMS provider not configured — pending alert kept:", row.id);
    }

    if (delivered) notified.push(row.id);
    else skipped++;
  }

  if (notified.length > 0) {
    const { error: updErr } = await supabaseAdmin
      .from("stock_notifications")
      .update({ status: "sent", notified_at: new Date().toISOString() })
      .in("id", notified);
    if (updErr) console.error("[restock] status update failed:", updErr);
  }

  return { checked: pending.length, sent: notified.length, skipped };
}