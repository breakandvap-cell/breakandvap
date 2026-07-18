import { createFileRoute } from "@tanstack/react-router";
import { INVOICE_SELLER } from "@/lib/invoice-config";

// Seuil identique à celui utilisé pour le badge "stock faible" (< 10).
const LOW_STOCK_THRESHOLD = 10;
// N'envoie pas plus d'un email par 20 heures pour un même produit
// (regroupement quotidien demandé).
const RENOTIFY_INTERVAL_HOURS = 20;

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

export const Route = createFileRoute("/api/public/hooks/low-stock-alert")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const cutoff = new Date(
          Date.now() - RENOTIFY_INTERVAL_HOURS * 60 * 60 * 1000,
        ).toISOString();

        // Produits publiés dont le stock passe sous le seuil et qui n'ont pas
        // encore été signalés récemment.
        const { data: products, error } = await supabaseAdmin
          .from("products")
          .select("id, name, stock, low_stock_notified_at, is_published")
          .eq("is_published", true)
          .lt("stock", LOW_STOCK_THRESHOLD)
          .order("stock", { ascending: true });

        if (error) {
          console.error("[low-stock] fetch failed:", error);
          return new Response(JSON.stringify({ ok: false }), { status: 500 });
        }

        const pending = (products ?? []).filter(
          (p) => !p.low_stock_notified_at || p.low_stock_notified_at < cutoff,
        );

        if (pending.length === 0) {
          return new Response(JSON.stringify({ ok: true, notified: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const send = await loadSender();
        const summary = pending.map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
        }));

        let sent = false;
        if (send) {
          try {
            const res = await send("low-stock-alert", INVOICE_SELLER.email, {
              templateData: {
                products: summary,
                threshold: LOW_STOCK_THRESHOLD,
              },
              idempotencyKey: `low-stock-${new Date().toISOString().slice(0, 10)}`,
            });
            sent = res.sent;
          } catch (e) {
            console.error("[low-stock] email send failed:", e);
          }
        } else {
          console.warn(
            "[low-stock] Sender unavailable — configure email domain to receive alerts. Pending:",
            summary,
          );
        }

        // Marque comme notifié pour éviter les doublons quotidiens même si
        // l'envoi n'a pas pu partir (au moins l'admin peut consulter les logs).
        await supabaseAdmin
          .from("products")
          .update({ low_stock_notified_at: new Date().toISOString() })
          .in(
            "id",
            pending.map((p) => p.id),
          );

        return new Response(
          JSON.stringify({ ok: true, notified: pending.length, sent }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});