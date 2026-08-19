/**
 * Tests de non-régression des règles de publication / lisibilité.
 *
 * Vérifie, via l'API Data avec la clé publique (rôle anon, RLS appliquée),
 * que :
 *  - seuls les produits publiés sont lisibles publiquement ;
 *  - seules les variantes actives rattachées à un produit publié sont lisibles ;
 *  - le public ne peut ni écrire ni modifier produits et variantes.
 *
 * Utilisation :
 *   bun test tests/variant-visibility.test.ts
 *   RLS_SUPABASE_URL=... RLS_SUPABASE_KEY=... bun test tests/variant-visibility.test.ts   # cible la prod
 *
 * Sans identifiants (ou sans réseau) les tests sont ignorés, sauf si RLS_REQUIRE=1.
 */
import { describe, expect, test, beforeAll } from "bun:test";

const URL_BASE = (
  process.env.RLS_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const KEY =
  process.env.RLS_SUPABASE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";
const REQUIRED = process.env.RLS_REQUIRE === "1";

let reachable = false;

async function rest(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

beforeAll(async () => {
  if (!URL_BASE || !KEY) return;
  try {
    const { status } = await rest("products?select=id&limit=1");
    reachable = status < 500;
  } catch {
    reachable = false;
  }
  if (!reachable && REQUIRED) {
    throw new Error("Backend injoignable alors que RLS_REQUIRE=1");
  }
});

const maybe = (name: string, fn: () => Promise<void>) =>
  test(name, async () => {
    if (!reachable) {
      console.warn(`[skip] ${name} — backend indisponible`);
      return;
    }
    await fn();
  });

describe("Lisibilité publique des produits", () => {
  maybe("aucun produit non publié n'est lisible", async () => {
    const { status, body } = await rest(
      "products?select=id,is_published&is_published=eq.false&limit=5",
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[]).length).toBe(0);
  });

  maybe("tous les produits retournés sont publiés", async () => {
    const { status, body } = await rest("products?select=id,is_published&limit=200");
    expect(status).toBe(200);
    const rows = body as Array<{ is_published: boolean }>;
    expect(rows.every((r) => r.is_published === true)).toBe(true);
  });
});

describe("Lisibilité publique des variantes", () => {
  maybe("aucune variante inactive n'est lisible", async () => {
    const { status, body } = await rest(
      "product_variants?select=id,is_active&is_active=eq.false&limit=5",
    );
    expect(status).toBe(200);
    expect((body as unknown[]).length).toBe(0);
  });

  maybe("toute variante lisible appartient à un produit publié", async () => {
    const { status, body } = await rest(
      "product_variants?select=id,is_active,product_id,products!product_variants_product_id_fkey(id,is_published)&limit=200",
    );
    expect(status).toBe(200);
    const rows = body as Array<{
      is_active: boolean;
      products: { is_published: boolean } | null;
    }>;
    for (const row of rows) {
      expect(row.is_active).toBe(true);
      // La jointure ne peut ramener que des produits eux-mêmes lisibles (publiés).
      expect(row.products?.is_published).toBe(true);
    }
  });
});

describe("Écriture publique interdite", () => {
  maybe("insertion de produit refusée", async () => {
    const { status } = await rest("products", {
      method: "POST",
      body: JSON.stringify({
        slug: `rls-test-${Date.now()}`,
        name: "RLS test",
        category: "accessoire_vape",
        price_cents: 100,
      }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  maybe("publication d'un produit refusée", async () => {
    const { status, body } = await rest(
      "products?select=id&limit=1",
    );
    expect(status).toBe(200);
    const rows = body as Array<{ id: string }>;
    if (rows.length === 0) return;
    const res = await rest(`products?id=eq.${rows[0]!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_published: false }),
      headers: { Prefer: "return=representation" },
    });
    // Soit refus explicite, soit aucune ligne affectée (RLS filtre l'UPDATE).
    if (res.status < 400) {
      expect((res.body as unknown[]).length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  maybe("insertion de variante refusée", async () => {
    const { status } = await rest("product_variants", {
      method: "POST",
      body: JSON.stringify({
        product_id: "00000000-0000-0000-0000-000000000000",
        volume_ml: 10,
        price_cents: 100,
        stock: 1,
      }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
