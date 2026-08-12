/**
 * Test de fumée du tunnel de commande.
 *
 * Charge successivement les pages clés du parcours client (accueil, boutique,
 * fiche produit, panier, checkout) via le serveur de rendu et vérifie qu'aucune
 * ne renvoie d'erreur (HTTP >= 400, page 500 SSR, écran d'erreur React, page
 * vide). Objectif : détecter tôt un crash de rendu du type "écran blanc".
 *
 * Utilisation :
 *   bun test tests/checkout-smoke.test.ts
 *   SMOKE_BASE_URL=https://breakandvap.lovable.app bun run test:smoke
 *
 * Le serveur doit tourner (bun run dev, ou une URL déployée via SMOKE_BASE_URL).
 * Si aucun serveur n'est joignable, le test est ignoré, sauf si SMOKE_REQUIRE=1.
 */
import { describe, expect, test, beforeAll } from "bun:test";

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const REQUIRE_SERVER = process.env.SMOKE_REQUIRE === "1";

let serverUp = false;
let productPath: string | null = null;

/** Marqueurs indiquant un rendu cassé côté serveur ou côté React. */
const ERROR_MARKERS = [
  '"unhandled":true',
  "Internal Server Error",
  "Une erreur est survenue", // fallback de l'Error Boundary global
  "Unexpected Application Error",
  "vite-error-overlay",
];

async function fetchPage(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "user-agent": "bnv-smoke-test" },
    redirect: "follow",
  });
  const html = await res.text();
  return { res, html };
}

function assertHealthyPage(path: string, res: Response, html: string) {
  expect(res.status, `${path} doit répondre 2xx (reçu ${res.status})`).toBeLessThan(400);

  for (const marker of ERROR_MARKERS) {
    expect(html.includes(marker), `${path} contient un marqueur d'erreur : ${marker}`).toBe(
      false,
    );
  }

  // Le document doit être une vraie page rendue, pas un shell vide.
  expect(html.length, `${path} renvoie un document quasi vide`).toBeGreaterThan(1000);
  expect(html.includes("<body"), `${path} n'est pas un document HTML`).toBe(true);
  expect(/<title[^>]*>/.test(html), `${path} n'a pas de balise <title>`).toBe(true);
}

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/`, { redirect: "follow" });
    serverUp = res.ok;
  } catch {
    serverUp = false;
  }

  if (!serverUp) {
    const message = `Serveur injoignable sur ${BASE_URL} — lancez "bun run dev" ou définissez SMOKE_BASE_URL.`;
    if (REQUIRE_SERVER) throw new Error(message);
    console.warn(`[smoke] ${message} Tests ignorés.`);
    return;
  }

  // Repère une fiche produit réelle depuis la boutique pour la tester.
  try {
    const { html } = await fetchPage("/boutique");
    const match = html.match(/href="(\/produit\/[a-z0-9-]+)"/i);
    productPath = match?.[1] ?? null;
  } catch {
    productPath = null;
  }
});

describe("smoke — parcours client", () => {
  const pages: Array<[string, string]> = [
    ["accueil", "/"],
    ["boutique", "/boutique"],
    ["panier", "/panier"],
    ["checkout", "/checkout"],
  ];

  for (const [label, path] of pages) {
    test(`${label} (${path}) s'affiche sans erreur`, async () => {
      if (!serverUp) return;
      const { res, html } = await fetchPage(path);
      assertHealthyPage(path, res, html);
    });
  }

  test("fiche produit s'affiche sans erreur", async () => {
    if (!serverUp) return;
    if (!productPath) {
      console.warn("[smoke] Aucune fiche produit trouvée dans /boutique — étape ignorée.");
      return;
    }
    const { res, html } = await fetchPage(productPath);
    assertHealthyPage(productPath, res, html);
    // La fiche doit exposer son balisage produit (rendu métier effectif).
    expect(html.includes("Product") || html.includes("ajouter au panier".toLowerCase())).toBe(
      true,
    );
  });

  test("le checkout rend bien le formulaire de commande", async () => {
    if (!serverUp) return;
    const { html } = await fetchPage("/checkout");
    expect(html.toLowerCase().includes("commande")).toBe(true);
    expect(html.includes("<form")).toBe(true);
  });
});
