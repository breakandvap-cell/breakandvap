// Chargement des données de commande + rendu de la fiche de picking.
import { renderPickingPdf } from "./picking-pdf.server";

export async function buildPickingSheet(orderId: string): Promise<{
  filename: string;
  base64: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [ord, its] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("order_number, created_at, shipping_address, user_id, guest_email")
      .eq("id", orderId)
      .maybeSingle(),
    supabaseAdmin
      .from("order_items")
      .select("product_name, quantity, volume_ml, nicotine_mg, flavor, boosters_count, variant_sku")
      .eq("order_id", orderId),
  ]);
  if (ord.error) throw new Error(ord.error.message);
  if (!ord.data) throw new Error("Commande introuvable.");
  if (its.error) throw new Error(its.error.message);

  const ship = (ord.data.shipping_address ?? {}) as Record<string, string | null>;
  let customer = ship.full_name ?? null;
  if (!customer && ord.data.user_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", ord.data.user_id)
      .maybeSingle();
    customer = profile?.full_name ?? null;
  }

  const bytes = await renderPickingPdf({
    order_number: ord.data.order_number,
    created_at: ord.data.created_at,
    customer_name: customer ?? ord.data.guest_email ?? null,
    shipping_city: ship.city ?? null,
    items: its.data ?? [],
  });

  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return {
    filename: `picking-${ord.data.order_number}.pdf`,
    base64: btoa(binary),
  };
}