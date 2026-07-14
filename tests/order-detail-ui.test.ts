// Test structurel de la page admin `commandes/$id` :
// vérifie que les boutons de modification (statut, suivi, livrée, annuler)
// sont bien conditionnés par `!isFinal` (livrée / annulée sont en lecture
// seule). Ce test ne rend pas la page mais analyse la source pour
// bloquer toute régression qui retirerait le garde-fou.
//
// Exécuter avec :  bun test tests/order-detail-ui.test.ts

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, "../src/routes/_authenticated/admin/commandes.$id.tsx"),
  "utf8",
);

describe("commandes.$id.tsx — verrouillage des états finaux", () => {
  it("définit isFinal à partir de 'livree' ET 'annulee'", () => {
    // Recherche tolérante aux espaces/quotes.
    const re = /isFinal\s*=\s*order\.status\s*===\s*["']livree["']\s*\|\|\s*order\.status\s*===\s*["']annulee["']/;
    expect(source).toMatch(re);
  });

  it("branche isFinal ? (lecture seule) : (formulaire d'édition)", () => {
    expect(source).toMatch(/\{isFinal\s*\?/);
  });

  it("le bouton « Marquer comme livrée » est conditionné par status === 'expediee'", () => {
    const idx = source.indexOf("Marquer comme livrée");
    expect(idx).toBeGreaterThan(-1);
    // Doit être précédé d'un test sur order.status === "expediee" dans la
    // même branche (non-finale).
    const window = source.slice(Math.max(0, idx - 800), idx);
    expect(window).toMatch(/order\.status\s*===\s*["']expediee["']/);
  });

  it("la case « Remboursement traité » n'apparaît que dans la branche annulée finale", () => {
    // Doit référencer refund_processed_at et rester à l'intérieur d'un bloc
    // conditionné par order.status === 'annulee'.
    const idx = source.indexOf("Remboursement traité");
    expect(idx).toBeGreaterThan(-1);
    const before = source.slice(0, idx);
    const lastAnnulee = before.lastIndexOf('order.status === "annulee"');
    const lastAPreparer = before.lastIndexOf('order.status === "a_preparer"');
    expect(lastAnnulee).toBeGreaterThan(-1);
    expect(lastAnnulee).toBeGreaterThan(lastAPreparer);
  });

  it("importe les server-fns dédiées de livraison et d'annulation", () => {
    expect(source).toMatch(/adminMarkOrderDelivered/);
    expect(source).toMatch(/adminCancelOrder/);
    expect(source).toMatch(/adminSetOrderRefundProcessed/);
  });

  it("ne propose pas 'livree' ni 'annulee' dans le <select> d'édition libre", () => {
    // Extrait le contenu du select (repère « À préparer »/« Expédiée »).
    const selectMatch = source.match(/<select[\s\S]*?<\/select>/);
    expect(selectMatch).not.toBeNull();
    const select = selectMatch![0];
    expect(select).not.toMatch(/value=["']livree["']/);
    expect(select).not.toMatch(/value=["']annulee["']/);
  });
});