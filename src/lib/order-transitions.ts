// Pure transition rules for the admin order lifecycle.
// Source of truth used by the admin server functions AND by the tests
// under tests/order-transitions.test.ts.
//
// Lifecycle:
//   a_preparer ──► expediee ──► livree  (état final)
//              └─► annulee            (état final)
//   expediee   ──► annulee            (état final)
//
// « livree » et « annulee » sont définitifs : aucune transition sortante.

export const ORDER_STATUSES = ["a_preparer", "expediee", "livree", "annulee"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FINAL_STATUSES: readonly OrderStatus[] = ["livree", "annulee"];

export function isFinalStatus(s: OrderStatus): boolean {
  return FINAL_STATUSES.includes(s);
}

/** Validates a status change requested via the generic "edit" endpoint
 *  (adminUpdateOrder). Only tracking updates and a_preparer → expediee
 *  are allowed here; delivery and cancellation go through dedicated
 *  endpoints. Throws a user-facing Error otherwise. */
export function assertUpdateTransition(from: OrderStatus, to: OrderStatus): void {
  if (isFinalStatus(from)) {
    throw new Error("Cette commande est dans un état final et ne peut plus être modifiée.");
  }
  if (to !== "a_preparer" && to !== "expediee") {
    throw new Error("Utilisez l'action dédiée pour ce changement de statut.");
  }
  if (from === "expediee" && to === "a_preparer") {
    throw new Error("Impossible de repasser une commande expédiée en préparation.");
  }
}

/** Only an expediee order can be marked livree. */
export function assertDeliverTransition(from: OrderStatus): void {
  if (from !== "expediee") {
    throw new Error("Seule une commande expédiée peut être marquée comme livrée.");
  }
}

/** a_preparer or expediee can be cancelled; final states cannot. */
export function assertCancelTransition(from: OrderStatus): void {
  if (isFinalStatus(from)) {
    throw new Error("Impossible d'annuler une commande déjà livrée ou annulée.");
  }
}

/** The refund-processed flag only applies to cancelled orders. */
export function assertRefundAllowed(from: OrderStatus): void {
  if (from !== "annulee") {
    throw new Error("Le remboursement ne concerne que les commandes annulées.");
  }
}