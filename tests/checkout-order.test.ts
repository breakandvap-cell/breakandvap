// Test d'intégration du tunnel de commande.
//
// Exécute réellement le handler de `createOrder` (src/lib/orders.functions.ts)
// contre une base Supabase simulée en mémoire : produits, variantes,
// boosters, réglages globaux, RPC de stock et insertions.
// Objectif : détecter rapidement les régressions de prix, de stock et de
// contenu des lignes de commande sans toucher à la vraie base.
//
// Exécuter avec :  bun test tests/checkout-order.test.ts

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Base de données simulée
// ---------------------------------------------------------------------------

const P_ACC = "11111111-1111-4111-8111-111111111111"; // accessoire simple
const P_LIQ = "22222222-2222-4222-8222-222222222222"; // e-liquide (variantes)
const P_BOOST = "33333333-3333-4333-8333-333333333333"; // booster normale
const V_50 = "44444444-4444-4444-8444-444444444444"; // variante 50 ml

type Row = Record<string, unknown>;

function makeDb() {
  return {
    products: [
      {
        id: P_ACC,
        name: "Clearomiseur Zenith",
        price_cents: 2500,
        currency: "EUR",
        stock: 5,
        stock_status: "in_stock",
        is_published: true,
        flavors: [],
        is_nicotine_booster: false,
        booster_type: null,
        created_at: "2026-01-01",
      },
      {
        id: P_LIQ,
        name: "Fruit Rouge",
        price_cents: 0,
        currency: "EUR",
        stock: 0,
        stock_status: "in_stock",
        is_published: true,
        flavors: [],
        is_nicotine_booster: false,
        booster_type: null,
        created_at: "2026-01-02",
      },
      {
        id: P_BOOST,
        name: "Booster nicotine 20 mg",
        price_cents: 100,
        currency: "EUR",
        stock: 999,
        stock_status: "in_stock",
        is_published: true,
        flavors: [],
        is_nicotine_booster: true,
        booster_type: "normale",
        created_at: "2026-01-03",
      },
    ] as Row[],
    product_variants: [
      {
        id: V_50,
        product_id: P_LIQ,
        volume_ml: 50,
        price_cents: 1500,
        stock: 4,
        available_nicotine_mg: [0, 3, 6],
        max_boosters: 2,
        nicotine_type: "normale",
        sku: "FRUROU-50-NO",
        is_active: true,
        quantity_tiers: [{ min_qty: 3, max_qty: null, price_cents: 1300 }],
      },
    ] as Row[],
    site_settings: {
      booster_volume_ml: 10,
      booster_concentration_mg_per_ml: 20,
      default_booster_normale_id: P_BOOST,
      default_booster_sel_id: null,
      default_booster_ice_id: null,
    } as Row,
  };
}

let db = makeDb();
let calls: { rpc: Array<{ name: string; args: Row }>; inserts: Record<string, Row[]>; deletes: string[] };
// Permet aux tests de faire échouer une RPC précise (stock épuisé).
let rpcFailures: Set<string>;

function makeSupabaseAdmin() {
  const rpc = async (name: string, args: Row) => {
    calls.rpc.push({ name, args });
    if (rpcFailures.has(name)) return { data: null, error: { message: "insufficient stock" } };
    return { data: 1, error: null };
  };

  const from = (table: string) => {
    const state: { op: "select" | "insert" | "delete"; filters: Row; payload?: unknown } = {
      op: "select",
      filters: {},
    };

    const resolveRows = (): Row[] => {
      if (table === "products") {
        if (state.filters["is_nicotine_booster"] === true) {
          return db.products.filter((p) => p["is_nicotine_booster"] === true);
        }
        const ids = (state.filters["id__in"] as string[]) ?? [];
        return db.products.filter((p) => ids.includes(p["id"] as string));
      }
      if (table === "product_variants") {
        const ids = (state.filters["id__in"] as string[]) ?? [];
        return db.product_variants.filter((v) => ids.includes(v["id"] as string));
      }
      if (table === "site_settings") return [db.site_settings];
      return [];
    };

    const builder: Record<string, unknown> = {};
    const chain = (fn?: () => void) => {
      fn?.();
      return builder;
    };

    Object.assign(builder, {
      select: () => chain(),
      order: () => chain(),
      eq: (col: string, val: unknown) =>
        chain(() => {
          state.filters[col] = val;
        }),
      in: (col: string, vals: unknown) =>
        chain(() => {
          state.filters[`${col}__in`] = vals;
        }),
      insert: (payload: unknown) =>
        chain(() => {
          state.op = "insert";
          state.payload = payload;
          const list = Array.isArray(payload) ? payload : [payload];
          calls.inserts[table] = [...(calls.inserts[table] ?? []), ...(list as Row[])];
        }),
      delete: () =>
        chain(() => {
          state.op = "delete";
          calls.deletes.push(table);
        }),
      maybeSingle: async () => ({ data: resolveRows()[0] ?? null, error: null }),
      single: async () => {
        if (state.op === "insert" && table === "orders") {
          const payload = state.payload as Row;
          return {
            data: {
              id: "99999999-9999-4999-8999-999999999999",
              order_number: "BNV-2026-0001",
              total_cents: payload["total_cents"],
              currency: payload["currency"],
            },
            error: null,
          };
        }
        return { data: resolveRows()[0] ?? null, error: null };
      },
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(
          state.op === "select"
            ? { data: resolveRows(), error: null }
            : { data: null, error: null },
        ).then(onFulfilled),
    });

    return builder;
  };

  return { from, rpc };
}

// ---------------------------------------------------------------------------
// Mocks des dépendances serveur
// ---------------------------------------------------------------------------

mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (d: unknown) => unknown = (d) => d;
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      middleware: () => b,
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return b;
      },
      handler:
        (h: (a: { data: unknown; context: Row }) => unknown) =>
        (arg: { data?: unknown } = {}) =>
          h({ data: validator(arg.data), context: {} }),
    });
    return b;
  },
  createMiddleware: () => {
    const mb: Record<string, unknown> = {};
    Object.assign(mb, {
      middleware: () => mb,
      server: () => mb,
      client: () => mb,
      inputValidator: () => mb,
    });
    return mb;
  },
  useServerFn: (f: unknown) => f,
}));

mock.module("@tanstack/react-start/server", () => ({
  getRequestHeader: () => undefined, // commande invité
  getRequest: () => new Request("http://localhost/"),
  setResponseHeader: () => {},
  setResponseStatus: () => {},
}));

mock.module("../src/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return makeSupabaseAdmin();
  },
}));

mock.module("../src/lib/invoices.functions", () => ({
  ensureInvoiceForOrderInternal: async () => ({ ok: true }),
}));

mock.module("../src/lib/order-emails.server", () => ({
  sendOrderConfirmationEmail: async () => ({ ok: true }),
  sendOrderShippedEmail: async () => ({ ok: true }),
}));

const { createOrder } = (await import("../src/lib/orders.functions")) as unknown as {
  createOrder: (arg: { data: unknown }) => Promise<{
    orderId: string;
    orderNumber: string;
    totalCents: number;
    currency: string;
  }>;
};

const shipping = {
  fullName: "Jeanne Testeuse",
  phone: "0600000000",
  line1: "5 Boulevard de Lattre de Tassigny",
  line2: "",
  postalCode: "71300",
  city: "Montceau-les-Mines",
  country: "France",
};

const baseInput = (items: unknown[]) => ({
  email: "cliente@example.com",
  shipping,
  items,
});

beforeEach(() => {
  db = makeDb();
  calls = { rpc: [], inserts: {}, deletes: [] };
  rpcFailures = new Set();
});

// ---------------------------------------------------------------------------

describe("tunnel de commande — createOrder", () => {
  it("crée une commande simple et calcule le total côté serveur", async () => {
    const res = await createOrder({
      data: baseInput([{ productId: P_ACC, quantity: 2 }]),
    });

    expect(res.orderNumber).toBe("BNV-2026-0001");
    expect(res.totalCents).toBe(5000); // 2 × 25,00 €
    expect(res.currency).toBe("EUR");

    const order = calls.inserts["orders"]?.[0] as Row;
    expect(order["status"]).toBe("a_preparer");
    expect(order["guest_email"]).toBe("cliente@example.com");
    expect((order["shipping_address"] as Row)["postal_code"]).toBe("71300");

    const items = calls.inserts["order_items"] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]!["unit_price_cents"]).toBe(2500);
    expect(items[0]!["quantity"]).toBe(2);
  });

  it("ignore les prix envoyés par le client (recalcul serveur)", async () => {
    const res = await createOrder({
      data: baseInput([
        { productId: P_ACC, quantity: 1, priceCents: 1 } as unknown as Row,
      ]),
    });
    expect(res.totalCents).toBe(2500);
  });

  it("facture les boosters en supplément du prix du flacon", async () => {
    const res = await createOrder({
      data: baseInput([
        {
          productId: P_LIQ,
          variantId: V_50,
          nicotineMg: 3,
          quantity: 1,
          boostersCount: 2,
        },
      ]),
    });

    // 15,00 € (flacon 50 ml) + 2 boosters × 1,00 €
    expect(res.totalCents).toBe(1700);
    const item = (calls.inserts["order_items"] ?? [])[0] as Row;
    expect(item["boosters_count"]).toBe(2);
    expect(item["booster_unit_price_cents"]).toBe(100);
    expect(item["base_price_cents"]).toBe(1500);
    expect(item["variant_sku"]).toBe("FRUROU-50-NO");
    expect(item["product_name"]).toContain("50 ml");
  });

  it("applique les paliers de prix dégressifs", async () => {
    const res = await createOrder({
      data: baseInput([
        { productId: P_LIQ, variantId: V_50, quantity: 3, nicotineMg: 0 },
      ]),
    });
    expect(res.totalCents).toBe(3900); // 3 × 13,00 €
  });

  it("décrémente les stocks de façon atomique via les RPC", async () => {
    await createOrder({
      data: baseInput([
        { productId: P_ACC, quantity: 1 },
        { productId: P_LIQ, variantId: V_50, quantity: 1, nicotineMg: 0 },
      ]),
    });
    const names = calls.rpc.map((c) => c.name);
    expect(names).toContain("decrement_product_stock");
    expect(names).toContain("decrement_variant_stock");
  });

  it("rembobine les stocks et n'insère aucune commande si un décrément échoue", async () => {
    rpcFailures.add("decrement_variant_stock");

    await expect(
      createOrder({
        data: baseInput([
          { productId: P_ACC, quantity: 1 },
          { productId: P_LIQ, variantId: V_50, quantity: 1, nicotineMg: 0 },
        ]),
      }),
    ).rejects.toThrow(/Stock épuisé/);

    expect(calls.rpc.map((c) => c.name)).toContain("increment_product_stock");
    expect(calls.inserts["orders"]).toBeUndefined();
  });

  it("refuse une quantité supérieure au stock disponible", async () => {
    await expect(
      createOrder({ data: baseInput([{ productId: P_ACC, quantity: 9 }]) }),
    ).rejects.toThrow(/Stock insuffisant/);
    expect(calls.inserts["orders"]).toBeUndefined();
  });

  it("refuse un produit dépublié", async () => {
    (db.products.find((p) => p["id"] === P_ACC) as Row)["is_published"] = false;
    await expect(
      createOrder({ data: baseInput([{ productId: P_ACC, quantity: 1 }]) }),
    ).rejects.toThrow(/indisponible/);
  });

  it("rejette un panier vide ou un email invalide", async () => {
    await expect(createOrder({ data: baseInput([]) })).rejects.toThrow();
    await expect(
      createOrder({
        data: { ...baseInput([{ productId: P_ACC, quantity: 1 }]), email: "pas-un-email" },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Garde-fou côté page checkout : la payload envoyée au serveur doit conserver
// les champs critiques du tunnel (adresse choisie, boosters, variante).
// ---------------------------------------------------------------------------

describe("page /checkout — payload transmise", () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../src/routes/checkout.tsx"),
    "utf8",
  );

  it("appelle createOrder via useServerFn", () => {
    expect(source).toMatch(/useServerFn\(createOrder\)/);
    expect(source).toMatch(/createOrderFn\(\{\s*data:\s*input\s*\}\)/);
  });

  it("transmet variante, nicotine, goût et boosters", () => {
    for (const key of ["productId", "variantId", "nicotineMg", "flavor", "quantity", "boostersCount"]) {
      expect(source).toContain(`${key}:`);
    }
  });

  it("empêche la validation sans adresse de livraison", () => {
    expect(source).toMatch(/canProceed\s*=/);
    expect(source).toMatch(/disabled=\{[^}]*!canProceed/);
  });
});
