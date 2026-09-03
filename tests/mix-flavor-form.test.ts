// Tests du formulaire de création rapide d'arômes « Mon Mix » :
// unicité du slug, doublons, latence réseau et lien vers la fiche existante.
// Exécuter avec :  bun test tests/mix-flavor-form.test.ts
import { describe, it, expect } from "bun:test";
import {
  FlavorAvailabilityChecker,
  canLinkToExisting,
  duplicateFromAvailability,
  duplicateFromCreate,
  EXISTING_FLAVOR_ROUTE,
  type AvailabilityResult,
  type CreateFlavorResult,
  type DuplicateInfo,
} from "../src/lib/mix-flavor-form";

const EXISTING = {
  id: "b3b2c1d4-0000-4000-8000-aaaaaaaaaaaa",
  slug: "alchimix-cerise",
  name: "Alchimix Cerise",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Mapping des réponses serveur vers l'état « doublon » du formulaire
// ---------------------------------------------------------------------------

describe("duplicateFromAvailability", () => {
  it("slug disponible → aucun doublon affiché", () => {
    const res: AvailabilityResult = { available: true, existing: null };
    expect(duplicateFromAvailability(res)).toBeNull();
  });

  it("slug dupliqué → doublon avec id et nom de la fiche existante", () => {
    const res: AvailabilityResult = { available: false, existing: EXISTING };
    expect(duplicateFromAvailability(res)).toEqual({
      id: EXISTING.id,
      name: "Alchimix Cerise",
    });
  });

  it("non disponible mais fiche introuvable → pas de faux lien", () => {
    expect(
      duplicateFromAvailability({ available: false, existing: null }),
    ).toBeNull();
  });
});

describe("duplicateFromCreate (soumission)", () => {
  it("conflit détecté côté serveur → doublon affiché, pas de toast succès", () => {
    const res: CreateFlavorResult = { status: "duplicate", existing: EXISTING };
    const outcome = duplicateFromCreate(res);
    expect(outcome).toEqual({
      kind: "duplicate",
      duplicate: { id: EXISTING.id, name: "Alchimix Cerise" },
    });
  });

  it("création réussie → pas de doublon", () => {
    const res: CreateFlavorResult = {
      status: "created",
      product: { id: "x", slug: "mixologue-mangue", name: "Mixologue Mangue" },
    };
    expect(duplicateFromCreate(res).kind).toBe("created");
  });

  it("conflit de course sans fiche résolue → doublon sans lien", () => {
    const res: CreateFlavorResult = {
      status: "duplicate",
      existing: { id: null, slug: null, name: "Alchimix Cerise" },
    };
    const outcome = duplicateFromCreate(res);
    expect(outcome.kind).toBe("duplicate");
    if (outcome.kind === "duplicate") {
      expect(canLinkToExisting(outcome.duplicate)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Lien vers la fiche produit existante
// ---------------------------------------------------------------------------

describe("lien vers la fiche existante", () => {
  it("route ciblant la fiche produit e-liquide admin", () => {
    expect(EXISTING_FLAVOR_ROUTE).toBe("/admin/produits/eliquide/$id");
  });

  it("lien affiché uniquement si l'id est connu", () => {
    expect(canLinkToExisting(null)).toBe(false);
    expect(canLinkToExisting({ id: null, name: "X" })).toBe(false);
    expect(canLinkToExisting({ id: "", name: "X" })).toBe(false);
    expect(canLinkToExisting({ id: EXISTING.id, name: "X" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Vérificateur débouncé : slug disponible / dupliqué / latence réseau
// ---------------------------------------------------------------------------

describe("FlavorAvailabilityChecker", () => {
  function harness(check: (input: { brand: string; flavor: string }) => Promise<AvailabilityResult>) {
    const checker = new FlavorAvailabilityChecker(check, 15);
    const events: string[] = [];
    let duplicate: DuplicateInfo | null = null;
    const callbacks = {
      onChecking: (c: boolean) => events.push(c ? "checking" : "idle"),
      onResult: (d: DuplicateInfo | null) => {
        duplicate = d;
        events.push(d ? `dup:${d.name}` : "ok");
      },
    };
    return { checker, events, callbacks, getDuplicate: () => duplicate };
  }

  it("slug disponible → onResult(null), indicateur arrêté", async () => {
    const h = harness(async () => ({ available: true, existing: null }));
    h.checker.schedule({ brand: "Alchimix", flavor: "Mangue" }, h.callbacks);
    await sleep(60);
    expect(h.getDuplicate()).toBeNull();
    expect(h.events).toEqual(["checking", "ok", "idle"]);
  });

  it("slug dupliqué → doublon avec nom et id pour le lien", async () => {
    const h = harness(async () => ({ available: false, existing: EXISTING }));
    h.checker.schedule({ brand: "Alchimix", flavor: "Cerise" }, h.callbacks);
    await sleep(60);
    expect(h.getDuplicate()).toEqual({ id: EXISTING.id, name: "Alchimix Cerise" });
    expect(canLinkToExisting(h.getDuplicate())).toBe(true);
  });

  it("frappes rapprochées → un seul appel réseau sur la dernière valeur", async () => {
    const calls: string[] = [];
    const h = harness(async ({ flavor }) => {
      calls.push(flavor);
      return { available: true, existing: null };
    });
    h.checker.schedule({ brand: "Mixologue", flavor: "Ma" }, h.callbacks);
    h.checker.schedule({ brand: "Mixologue", flavor: "Man" }, h.callbacks);
    h.checker.schedule({ brand: "Mixologue", flavor: "Mangue" }, h.callbacks);
    await sleep(80);
    expect(calls).toEqual(["Mangue"]);
  });

  it("latence réseau : réponse obsolète ignorée après une saisie plus récente", async () => {
    const h = harness(async ({ flavor }) => {
      if (flavor === "Cerise") {
        // Première requête lente qui finit par trouver un doublon…
        await sleep(80);
        return { available: false, existing: EXISTING };
      }
      return { available: true, existing: null };
    });
    h.checker.schedule({ brand: "Alchimix", flavor: "Cerise" }, h.callbacks);
    await sleep(20); // laisse partir la requête lente
    h.checker.schedule({ brand: "Alchimix", flavor: "Citron" }, h.callbacks);
    await sleep(120); // les deux requêtes ont répondu
    // La réponse lente (doublon « Cerise ») ne doit pas écraser l'état final.
    expect(h.getDuplicate()).toBeNull();
    expect(h.events[h.events.length - 1]).toBe("idle");
    expect(h.events).not.toContain("dup:Alchimix Cerise");
  });

  it("latence réseau : indicateur « Vérification… » reste actif jusqu'à la réponse", async () => {
    const h = harness(async () => {
      await sleep(50);
      return { available: true, existing: null };
    });
    h.checker.schedule({ brand: "Mixologue", flavor: "Fraise" }, h.callbacks);
    await sleep(30); // délai débouncé écoulé, requête encore en vol
    expect(h.events).toEqual(["checking"]);
    await sleep(60);
    expect(h.events).toEqual(["checking", "ok", "idle"]);
  });

  it("erreur réseau → silencieuse, pas de doublon fantôme", async () => {
    const h = harness(async () => {
      throw new Error("network down");
    });
    h.checker.schedule({ brand: "Alchimix", flavor: "Cerise" }, h.callbacks);
    await sleep(60);
    expect(h.getDuplicate()).toBeNull();
    expect(h.events).toEqual(["checking", "idle"]);
  });

  it("saisie trop courte → aucune requête, état réinitialisé", async () => {
    let called = 0;
    const h = harness(async () => {
      called++;
      return { available: true, existing: null };
    });
    h.checker.schedule({ brand: "Alchimix", flavor: "C" }, h.callbacks);
    await sleep(60);
    expect(called).toBe(0);
    expect(h.getDuplicate()).toBeNull();
    expect(h.events).toEqual(["ok", "idle"]);
  });

  it("cancel() avant l'envoi → aucune requête réseau", async () => {
    let called = 0;
    const h = harness(async () => {
      called++;
      return { available: false, existing: EXISTING };
    });
    h.checker.schedule({ brand: "Alchimix", flavor: "Cerise" }, h.callbacks);
    h.checker.cancel();
    await sleep(60);
    expect(called).toBe(0);
    expect(h.getDuplicate()).toBeNull();
  });
});
