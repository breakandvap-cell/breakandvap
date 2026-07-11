import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVOICE_SELLER, INVOICE_VAT_RATE } from "./invoice-config";

const BUCKET = "invoices";

// Idempotent: crée la facture pour une commande si elle n'existe pas encore,
// génère le PDF, l'upload dans le bucket privé, et retourne la facture.
// Appelé par createOrder (côté serveur, sans auth utilisateur requise).
export async function ensureInvoiceForOrderInternal(orderId: string): Promise<{
  id: string;
  number: string;
  pdf_path: string | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Facture déjà présente ?
  const { data: existing } = await supabaseAdmin
    .from("invoices")
    .select("id, number, pdf_path")
    .eq("order_id", orderId)
    .maybeSingle();

  if (existing?.pdf_path) return existing;

  // 2. Charger commande + items + profil client
  const [ordRes, itemsRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle(),
    supabaseAdmin
      .from("order_items")
      .select(
        "product_name, quantity, unit_price_cents, base_price_cents, boosters_count, booster_unit_price_cents, nicotine_mg, volume_ml, flavor",
      )
      .eq("order_id", orderId),
  ]);
  if (ordRes.error || !ordRes.data) throw new Error("Commande introuvable.");
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  const order = ordRes.data;
  const items = itemsRes.data ?? [];

  let profile: { full_name: string | null; email: string | null; phone: string | null } | null = null;
  if (order.user_id) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", order.user_id)
      .maybeSingle();
    profile = data;
  }

  const ship = (order.shipping_address ?? {}) as Record<string, string | null>;
  const buyer = {
    full_name: (profile?.full_name || ship.full_name || "Client") as string,
    email: (profile?.email || order.guest_email || "") as string,
    phone: (profile?.phone || ship.phone) ?? null,
    line1: (ship.line1 || "") as string,
    line2: ship.line2 ?? null,
    postal_code: (ship.postal_code || "") as string,
    city: (ship.city || "") as string,
    country: (ship.country || "France") as string,
  };

  // 3. Calcul HT / TVA à partir du TTC
  const total = order.total_cents;
  const rate = INVOICE_VAT_RATE;
  const subtotal = Math.round(total / (1 + rate / 100));
  const tax = total - subtotal;

  // 4. Créer la ligne facture avec numéro séquentiel (RPC atomique)
  let invoiceRow = existing;
  if (!invoiceRow) {
    const { data: created, error: rpcErr } = await supabaseAdmin.rpc(
      "create_invoice_for_order",
      {
        _order_id: orderId,
        _subtotal_cents: subtotal,
        _tax_rate: rate,
        _tax_cents: tax,
        _total_cents: total,
        _currency: order.currency,
        _seller: INVOICE_SELLER as unknown as never,
        _buyer: buyer as unknown as never,
        _items: items as unknown as never,
      },
    );
    if (rpcErr || !created) {
      throw new Error(rpcErr?.message ?? "Création facture impossible.");
    }
    invoiceRow = {
      id: (created as { id: string }).id,
      number: (created as { number: string }).number,
      pdf_path: (created as { pdf_path: string | null }).pdf_path,
    };
  }

  // 5. Générer le PDF
  const { renderInvoicePdf } = await import("./invoice-pdf.server");
  const pdfBytes = await renderInvoicePdf({
    number: invoiceRow.number,
    issued_at: new Date(),
    order_number: order.order_number,
    currency: order.currency,
    subtotal_cents: subtotal,
    tax_rate: rate,
    tax_cents: tax,
    total_cents: total,
    buyer,
    items,
  });

  // 6. Upload dans le bucket privé
  const path = `${new Date().getFullYear()}/${invoiceRow.number}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`Upload facture : ${upErr.message}`);

  // 7. Mettre à jour la ligne facture avec le chemin PDF
  await supabaseAdmin
    .from("invoices")
    .update({ pdf_path: path, pdf_generated_at: new Date().toISOString() })
    .eq("id", invoiceRow.id);

  return { id: invoiceRow.id, number: invoiceRow.number, pdf_path: path };
}

// URL signée pour télécharger la facture (client connecté propriétaire OU admin).
export const getInvoiceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Vérifier propriétaire ou admin
    const [{ data: order }, { data: isAdminRes }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, user_id")
        .eq("id", data.orderId)
        .maybeSingle(),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
    ]);
    if (!order) throw new Error("Commande introuvable.");
    const isAdmin = Boolean(isAdminRes);
    if (!isAdmin && order.user_id !== context.userId) {
      throw new Error("Accès refusé.");
    }

    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("number, pdf_path")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!inv?.pdf_path) throw new Error("Facture non disponible.");

    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(inv.pdf_path, 60 * 10, {
        download: `${inv.number}.pdf`,
      });
    if (error || !signed) throw new Error(error?.message ?? "URL indisponible.");

    return { url: signed.signedUrl, number: inv.number };
  });

// Liste des factures d'un client (pour son espace compte)
export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invoices")
      .select("id, number, issued_at, total_cents, currency, order_id, orders!inner(order_number, user_id)")
      .eq("orders.user_id", context.userId)
      .order("issued_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Liste des factures pour l'admin, avec filtres période + recherche.
export const adminListInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        q: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdminRes } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdminRes) throw new Error("Accès refusé.");

    let query = context.supabase
      .from("invoices")
      .select(
        "id, number, issued_at, subtotal_cents, tax_cents, total_cents, currency, buyer, order_id, orders!inner(order_number, status)",
      )
      .order("issued_at", { ascending: false })
      .limit(1000);

    if (data.from) query = query.gte("issued_at", `${data.from}T00:00:00Z`);
    if (data.to) query = query.lte("issued_at", `${data.to}T23:59:59Z`);

    const q = (data.q ?? "").trim();
    if (q.length >= 2) {
      // Recherche numéro de facture OU nom client (JSONB buyer.full_name)
      query = query.or(
        `number.ilike.%${q}%,buyer->>full_name.ilike.%${q}%`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
