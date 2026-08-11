import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://breakandvap.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "weekly" | "daily" | "monthly";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/boutique", changefreq: "daily", priority: "0.9" },
          { path: "/a-propos", changefreq: "monthly", priority: "0.6" },
          { path: "/contact", changefreq: "monthly", priority: "0.6" },
          { path: "/livraison-retours", changefreq: "monthly", priority: "0.5" },
          { path: "/mentions-legales", changefreq: "yearly" as never, priority: "0.3" },
          { path: "/cgv", changefreq: "yearly" as never, priority: "0.3" },
          { path: "/confidentialite", changefreq: "yearly" as never, priority: "0.3" },
          { path: "/cookies", changefreq: "yearly" as never, priority: "0.3" },
        ];

        // Fiches produits publiées (mêmes filtres que le loader de /produit/$slug).
        try {
          const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
          const supabaseKey = import.meta.env[
            "VITE_SUPABASE_PUBLISHABLE_KEY"
          ] as string;
          if (supabaseUrl && supabaseKey) {
            const res = await fetch(
              `${supabaseUrl}/rest/v1/products?select=slug&is_published=eq.true`,
              { headers: { apikey: supabaseKey, Accept: "application/json" } },
            );
            if (res.ok) {
              const rows = (await res.json()) as Array<{ slug: string }>;
              for (const row of rows) {
                if (!row?.slug) continue;
                entries.push({
                  path: `/produit/${encodeURIComponent(row.slug)}`,
                  changefreq: "weekly",
                  priority: "0.8",
                });
              }
            }
          }
        } catch {
          // Le sitemap reste valide même si le catalogue est indisponible.
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});