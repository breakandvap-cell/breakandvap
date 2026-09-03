/**
 * Logique testable du formulaire de création rapide d'arômes « Mon Mix »
 * (page admin Configurateur Mon Mix).
 *
 * Ce module est volontairement pur (pas d'import React ni serveur) afin de
 * pouvoir être couvert par des tests unitaires avec `bun test`.
 */

export interface ExistingFlavorRef {
  id: string | null;
  slug: string | null;
  name: string;
}

export interface AvailabilityResult {
  available: boolean;
  existing: ExistingFlavorRef | null;
}

export type CreateFlavorResult =
  | { status: "duplicate"; existing: ExistingFlavorRef }
  | { status: "created"; product: { id: string; slug: string; name: string } };

export interface DuplicateInfo {
  id: string | null;
  name: string;
}

/**
 * Convertit la réponse de `adminCheckMixFlavorAvailability` en info doublon.
 * Retourne `null` si le nom est disponible ou si aucune fiche existante n'a
 * pu être identifiée.
 */
export function duplicateFromAvailability(
  res: AvailabilityResult,
): DuplicateInfo | null {
  if (res.available || !res.existing) return null;
  return { id: res.existing.id, name: res.existing.name };
}

/**
 * Convertit la réponse de `adminCreateMixFlavor` : soit un doublon à
 * afficher, soit une création réussie.
 */
export function duplicateFromCreate(
  res: CreateFlavorResult,
): { kind: "duplicate"; duplicate: DuplicateInfo } | { kind: "created" } {
  if (res.status === "duplicate") {
    return {
      kind: "duplicate",
      duplicate: { id: res.existing.id, name: res.existing.name },
    };
  }
  return { kind: "created" };
}

/** Route admin de la fiche produit e-liquide liée à un doublon. */
export const EXISTING_FLAVOR_ROUTE = "/admin/produits/eliquide/$id" as const;

/** Un doublon n'offre un lien que si l'on connaît l'identifiant de la fiche. */
export function canLinkToExisting(d: DuplicateInfo | null): d is DuplicateInfo & {
  id: string;
} {
  return d != null && typeof d.id === "string" && d.id.length > 0;
}

export type AvailabilityCheck = (input: {
  brand: string;
  flavor: string;
}) => Promise<AvailabilityResult>;

/**
 * Vérificateur d'unicité débouncé pour le champ « goût » du formulaire.
 *
 * Garanties :
 * - les frappes rapprochées (< delay ms) ne déclenchent qu'un seul appel
 *   réseau, sur la dernière valeur ;
 * - une réponse arrivée en retard (latence réseau) après une saisie plus
 *   récente est ignorée (pas de doublon obsolète affiché) ;
 * - une erreur réseau est silencieuse (la validation serveur reste la
 *   barrière finale) ;
 * - `cancel()` annule toute vérification en attente ou en vol.
 */
export class FlavorAvailabilityChecker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor(
    private readonly check: AvailabilityCheck,
    private readonly delayMs = 400,
  ) {}

  /**
   * Programme une vérification. `onChecking(true)` est appelé immédiatement ;
   * `onResult` reçoit l'info doublon (ou null si disponible) puis
   * `onChecking(false)`. Les valeurs de moins de 2 caractères sont ignorées.
   */
  schedule(input: { brand: string; flavor: string }, callbacks: {
    onChecking: (checking: boolean) => void;
    onResult: (duplicate: DuplicateInfo | null) => void;
  }): void {
    this.cancel();
    const flavor = input.flavor.trim();
    if (flavor.length < 2) {
      callbacks.onResult(null);
      callbacks.onChecking(false);
      return;
    }
    callbacks.onChecking(true);
    const mySeq = ++this.seq;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check({ brand: input.brand, flavor })
        .then((res) => {
          if (mySeq !== this.seq) return; // réponse obsolète
          callbacks.onResult(duplicateFromAvailability(res));
        })
        .catch(() => {
          // Silencieux : la validation serveur reste la barrière finale.
        })
        .finally(() => {
          if (mySeq !== this.seq) return;
          callbacks.onChecking(false);
        });
    }, this.delayMs);
  }

  /** Annule toute vérification en attente ou en vol. */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.seq++;
  }
}
