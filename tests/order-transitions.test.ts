// Tests unitaires des règles de transition de statut des commandes.
// Exécuter avec :  bun test tests/order-transitions.test.ts
//
// Ces tests garantissent que :
//  - une commande « livrée » ou « annulée » ne peut plus être modifiée ;
//  - seules les transitions autorisées passent ;
//  - le drapeau de remboursement n'est actionnable que sur une annulation.

import { describe, it, expect } from "bun:test";
import {
  ORDER_STATUSES,
  FINAL_STATUSES,
  isFinalStatus,
  assertUpdateTransition,
  assertDeliverTransition,
  assertCancelTransition,
  assertRefundAllowed,
  type OrderStatus,
} from "../src/lib/order-transitions";

const ALL: OrderStatus[] = [...ORDER_STATUSES];

describe("états finaux", () => {
  it("livree et annulee sont finaux", () => {
    expect(isFinalStatus("livree")).toBe(true);
    expect(isFinalStatus("annulee")).toBe(true);
    expect(FINAL_STATUSES).toEqual(["livree", "annulee"]);
  });
  it("a_preparer et expediee ne sont pas finaux", () => {
    expect(isFinalStatus("a_preparer")).toBe(false);
    expect(isFinalStatus("expediee")).toBe(false);
  });
});

describe("assertUpdateTransition (endpoint d'édition générique)", () => {
  it("autorise a_preparer → a_preparer (maj suivi)", () => {
    expect(() => assertUpdateTransition("a_preparer", "a_preparer")).not.toThrow();
  });
  it("autorise a_preparer → expediee", () => {
    expect(() => assertUpdateTransition("a_preparer", "expediee")).not.toThrow();
  });
  it("autorise expediee → expediee (maj suivi)", () => {
    expect(() => assertUpdateTransition("expediee", "expediee")).not.toThrow();
  });
  it("refuse expediee → a_preparer", () => {
    expect(() => assertUpdateTransition("expediee", "a_preparer")).toThrow(
      /expédiée.+préparation/i,
    );
  });
  it("refuse toute transition via cet endpoint vers livree ou annulee", () => {
    for (const from of ["a_preparer", "expediee"] as OrderStatus[]) {
      expect(() => assertUpdateTransition(from, "livree")).toThrow(/action dédiée/i);
      expect(() => assertUpdateTransition(from, "annulee")).toThrow(/action dédiée/i);
    }
  });
  it("refuse toute modification quand la commande est livrée", () => {
    for (const to of ALL) {
      expect(() => assertUpdateTransition("livree", to)).toThrow(/état final/i);
    }
  });
  it("refuse toute modification quand la commande est annulée", () => {
    for (const to of ALL) {
      expect(() => assertUpdateTransition("annulee", to)).toThrow(/état final/i);
    }
  });
});

describe("assertDeliverTransition", () => {
  it("autorise uniquement depuis expediee", () => {
    expect(() => assertDeliverTransition("expediee")).not.toThrow();
  });
  it("refuse depuis a_preparer, livree, annulee", () => {
    for (const from of ["a_preparer", "livree", "annulee"] as OrderStatus[]) {
      expect(() => assertDeliverTransition(from)).toThrow(/expédiée/i);
    }
  });
});

describe("assertCancelTransition", () => {
  it("autorise depuis a_preparer et expediee", () => {
    expect(() => assertCancelTransition("a_preparer")).not.toThrow();
    expect(() => assertCancelTransition("expediee")).not.toThrow();
  });
  it("refuse depuis un état final", () => {
    expect(() => assertCancelTransition("livree")).toThrow(/déjà livrée ou annulée/i);
    expect(() => assertCancelTransition("annulee")).toThrow(/déjà livrée ou annulée/i);
  });
});

describe("assertRefundAllowed", () => {
  it("autorise uniquement pour annulee", () => {
    expect(() => assertRefundAllowed("annulee")).not.toThrow();
  });
  it("refuse pour tout autre statut", () => {
    for (const from of ["a_preparer", "expediee", "livree"] as OrderStatus[]) {
      expect(() => assertRefundAllowed(from)).toThrow(/annulées/i);
    }
  });
});

describe("matrice complète : aucune transition sortante depuis un état final", () => {
  it("toutes les fonctions de transition refusent livree et annulee comme point de départ", () => {
    for (const from of FINAL_STATUSES) {
      // Update : toujours refusé
      for (const to of ALL) {
        expect(() => assertUpdateTransition(from, to)).toThrow();
      }
      // Deliver / Cancel : toujours refusés
      expect(() => assertDeliverTransition(from)).toThrow();
      expect(() => assertCancelTransition(from)).toThrow();
    }
  });
});