import { createFileRoute } from "@tanstack/react-router";

/**
 * Filet de sécurité : rejoue l'envoi des alertes de réapprovisionnement
 * en attente pour tout produit/variante dont le stock est repassé au-dessus
 * de 0 (quel que soit le chemin de mise à jour du stock).
 */
export const Route = createFileRoute("/api/public/hooks/restock-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LOW_STOCK_ALERT_SECRET"];
        if (!expected) return new Response(JSON.stringify({ ok: false }), { status: 500 });
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const a = new TextEncoder().encode(provided);
        const b = new TextEncoder().encode(expected);
        let diff = a.length ^ b.length;
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
        if (diff !== 0) return new Response(JSON.stringify({ ok: false }), { status: 401 });

        const { dispatchRestockNotifications } = await import(
          "@/lib/stock-notifications.server"
        );
        const result = await dispatchRestockNotifications();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});