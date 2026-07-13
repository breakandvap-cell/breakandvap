// Envois d'emails liés au cycle de vie d'une commande.
// Actifs dès que le domaine expéditeur est configuré via la scaffolding
// Lovable Emails. Tant que le domaine n'est pas configuré, l'helper d'envoi
// n'est pas disponible et les appels no-op silencieusement.

type SendFn = (
  name: string,
  to: string,
  opts?: { templateData?: unknown; idempotencyKey?: string },
) => Promise<{ sent: boolean }>;

async function loadSender(): Promise<SendFn | null> {
  try {
    // Chemin construit à l'exécution pour éviter la résolution statique du bundler
    // tant que le helper n'est pas scaffoldé.
    const specifier = ["@", "lib", "email-templates", "send-email"].join("/").replace("@/", "@/");
    const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
    const mod = (await dynamicImport(specifier)) as { sendTemplateEmail?: SendFn };
    return mod.sendTemplateEmail ?? null;
  } catch {
    console.warn("[email] send helper unavailable — configure email domain to enable order emails");
    return null;
  }
}

async function loadOrderContext(orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [ordRes, invRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id, order_number, guest_email, user_id, total_cents, currency")
      .eq("id", orderId)
      .maybeSingle(),
    supabaseAdmin
      .from("invoices")
      .select("number, pdf_path")
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);
  const order = ordRes.data;
  if (!order) return null;
  let recipient = order.guest_email ?? null;
  if (!recipient && order.user_id) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", order.user_id)
      .maybeSingle();
    recipient = prof?.email ?? null;
  }
  if (!recipient) return null;
  return { order, invoice: invRes.data, recipient, supabaseAdmin };
}

export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  const ctx = await loadOrderContext(orderId);
  if (!ctx) return;
  const send = await loadSender();
  if (!send) return;
  // Lien signé vers la facture (valide 7 jours) — Lovable Emails ne supporte
  // pas les pièces jointes, on transmet un lien de téléchargement sécurisé.
  let invoiceUrl: string | null = null;
  if (ctx.invoice?.pdf_path) {
    const { data: signed } = await ctx.supabaseAdmin.storage
      .from("invoices")
      .createSignedUrl(ctx.invoice.pdf_path, 60 * 60 * 24 * 7, {
        download: `${ctx.invoice.number}.pdf`,
      });
    invoiceUrl = signed?.signedUrl ?? null;
  }
  await send("order-confirmation", ctx.recipient, {
    templateData: {
      orderNumber: ctx.order.order_number,
      totalLabel: `${(ctx.order.total_cents / 100).toFixed(2).replace(".", ",")} ${ctx.order.currency}`,
      invoiceNumber: ctx.invoice?.number ?? null,
      invoiceUrl,
    },
    idempotencyKey: `order-confirm-${ctx.order.id}`,
  });
}

export async function sendOrderDeliveredEmail(orderId: string): Promise<void> {
  const ctx = await loadOrderContext(orderId);
  if (!ctx) return;
  const send = await loadSender();
  if (!send) return;
  await send("order-delivered", ctx.recipient, {
    templateData: {
      orderNumber: ctx.order.order_number,
    },
    idempotencyKey: `order-delivered-${ctx.order.id}`,
  });
}

export async function sendOrderCancelledEmail(
  orderId: string,
  reason: string | null,
): Promise<void> {
  const ctx = await loadOrderContext(orderId);
  if (!ctx) return;
  const send = await loadSender();
  if (!send) return;
  await send("order-cancelled", ctx.recipient, {
    templateData: {
      orderNumber: ctx.order.order_number,
      reason: reason ?? null,
    },
    idempotencyKey: `order-cancelled-${ctx.order.id}`,
  });
}