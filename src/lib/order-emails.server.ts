// Envoi d'email de confirmation de commande.
// Actif dès que le domaine expéditeur est configuré via la scaffolding Lovable Emails.
// Tant que le domaine n'est pas configuré, l'appel throw et est capturé par le caller.

export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
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
  if (!order) return;

  let recipient = order.guest_email ?? null;
  if (!recipient && order.user_id) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", order.user_id)
      .maybeSingle();
    recipient = prof?.email ?? null;
  }
  if (!recipient) return;

  // Lien signé vers la facture (valide 7 jours) — Lovable Emails ne supportant pas
  // les pièces jointes, on transmet un lien de téléchargement sécurisé.
  let invoiceUrl: string | null = null;
  if (invRes.data?.pdf_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("invoices")
      .createSignedUrl(invRes.data.pdf_path, 60 * 60 * 24 * 7, {
        download: `${invRes.data.number}.pdf`,
      });
    invoiceUrl = signed?.signedUrl ?? null;
  }

  // Import dynamique du helper d'envoi — présent seulement après scaffolding email.
  let sendTemplateEmail:
    | ((name: string, to: string, opts?: { templateData?: unknown; idempotencyKey?: string }) => Promise<{ sent: boolean }>)
    | null = null;
  try {
    // Chemin construit à l'exécution pour éviter la résolution statique du bundler
    // tant que le helper n'est pas scaffoldé (domaine expéditeur non configuré).
    const specifier = ["@", "lib", "email-templates", "send-email"].join("/").replace("@/", "@/");
    const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
    const mod = (await dynamicImport(specifier)) as {
      sendTemplateEmail: typeof sendTemplateEmail;
    };
    sendTemplateEmail = mod.sendTemplateEmail!;
  } catch {
    // Templates non scaffoldés (domaine expéditeur pas encore configuré).
    console.warn("[email] send helper unavailable — configure email domain to enable order confirmation emails");
    return;
  }

  if (!sendTemplateEmail) return;

  const fn = sendTemplateEmail as (
    name: string,
    to: string,
    opts?: { templateData?: unknown; idempotencyKey?: string },
  ) => Promise<{ sent: boolean }>;
  await fn("order-confirmation", recipient, {
    templateData: {
      orderNumber: order.order_number,
      totalLabel: `${(order.total_cents / 100).toFixed(2).replace(".", ",")} ${order.currency}`,
      invoiceNumber: invRes.data?.number ?? null,
      invoiceUrl,
    },
    idempotencyKey: `order-confirm-${order.id}`,
  });
}
