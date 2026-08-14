// Tests des taux de nicotine atteignables pour un mix personnalisé.
// Exécuter avec :  bun test tests/mix-nicotine-rates.test.ts
import { describe, it, expect } from "bun:test";
import {
  availableNicotineRates,
  formatMixNicotine,
  MIX_MAX_NICOTINE_MG,
} from "../src/lib/custom-mix";

// Configuration par défaut de site_settings : booster 10 ml dosé à 20 mg/ml.
const CFG = { boosterVolumeMl: 10, boosterConcentrationMgPerMl: 20 };

/** Référence indépendante : n boosters entiers, en laissant au moins un
 *  emplacement libre pour la base + les arômes, plafonné à 10 mg. */
function expectedRates(
  volumeMl: number,
  cfg: { boosterVolumeMl: number; boosterConcentrationMgPerMl: number },
) {
  const nMax = Math.max(0, Math.ceil(volumeMl / cfg.boosterVolumeMl) - 1);
  const out: number[] = [];
  for (let n = 0; n <= nMax; n++) {
    const rate =
      Math.round(((n * cfg.boosterVolumeMl * cfg.boosterConcentrationMgPerMl) / volumeMl) * 10) / 10;
    if (rate > MIX_MAX_NICOTINE_MG) break;
    if (!out.includes(rate)) out.push(rate);
  }
  return out.length > 0 ? out : [0];
}

describe("availableNicotineRates — valeurs exactes par contenance", () => {
  it("30 ml : 0 / 6,7 mg (2 boosters = 13,3 mg > 10, exclu)", () => {
    expect(availableNicotineRates(30, CFG)).toEqual([0, 6.7]);
  });
  it("60 ml : 0 / 3,3 / 6,7 / 10 mg", () => {
    expect(availableNicotineRates(60, CFG)).toEqual([0, 3.3, 6.7, 10]);
  });
  it("50 ml : 0 / 4 / 8 mg", () => {
    expect(availableNicotineRates(50, CFG)).toEqual([0, 4, 8]);
  });
  it("100 ml : 0 / 2 / 4 / 6 / 8 / 10 mg", () => {
    expect(availableNicotineRates(100, CFG)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it("10 ml : aucun booster possible, seul 0 mg", () => {
    expect(availableNicotineRates(10, CFG)).toEqual([0]);
  });
});

describe("availableNicotineRates — invariants", () => {
  const volumes = [10, 15, 20, 30, 50, 60, 100, 120, 200, 500];

  it("respecte toujours la limite de 10 mg", () => {
    for (const v of volumes) {
      for (const r of availableNicotineRates(v, CFG)) {
        expect(r).toBeLessThanOrEqual(MIX_MAX_NICOTINE_MG);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("correspond exactement à un nombre entier de boosters", () => {
    for (const v of volumes) {
      for (const r of availableNicotineRates(v, CFG)) {
        const n = (r * v) / (CFG.boosterVolumeMl * CFG.boosterConcentrationMgPerMl);
        // r est arrondi au dixième : on tolère l'écart induit par l'arrondi.
        expect(Math.abs(n - Math.round(n))).toBeLessThan(0.05 * v / 200 + 0.02);
      }
    }
  });

  it("laisse toujours de la place pour la base et les arômes", () => {
    for (const v of volumes) {
      const rates = availableNicotineRates(v, CFG);
      const nMax = Math.max(0, Math.ceil(v / CFG.boosterVolumeMl) - 1);
      expect(rates.length).toBeLessThanOrEqual(nMax + 1);
    }
  });

  it("commence à 0 mg, est strictement croissante et sans doublon", () => {
    for (const v of volumes) {
      const rates = availableNicotineRates(v, CFG);
      expect(rates[0]).toBe(0);
      expect(new Set(rates).size).toBe(rates.length);
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
      }
    }
  });

  it("reproduit le calcul de référence pour toutes les contenances", () => {
    for (const v of volumes) {
      expect(availableNicotineRates(v, CFG)).toEqual(expectedRates(v, CFG));
    }
  });
});

describe("availableNicotineRates — configuration site_settings personnalisée", () => {
  it("suit une concentration de booster différente (10 ml / 10 mg/ml)", () => {
    const cfg = { boosterVolumeMl: 10, boosterConcentrationMgPerMl: 10 };
    expect(availableNicotineRates(60, cfg)).toEqual([0, 1.7, 3.3, 5, 6.7, 8.3]);
  });

  it("suit un volume de booster différent (20 ml / 20 mg/ml)", () => {
    const cfg = { boosterVolumeMl: 20, boosterConcentrationMgPerMl: 20 };
    expect(availableNicotineRates(100, cfg)).toEqual([0, 4, 8]);
  });

  it("plafonne à 10 mg même avec une concentration très élevée", () => {
    const cfg = { boosterVolumeMl: 10, boosterConcentrationMgPerMl: 100 };
    for (const v of [30, 60, 100]) {
      for (const r of availableNicotineRates(v, cfg)) {
        expect(r).toBeLessThanOrEqual(MIX_MAX_NICOTINE_MG);
      }
    }
  });

  it("retombe sur les valeurs par défaut si la config est invalide", () => {
    const bad = { boosterVolumeMl: 0, boosterConcentrationMgPerMl: -5 };
    expect(availableNicotineRates(60, bad)).toEqual(availableNicotineRates(60, CFG));
  });
});

describe("availableNicotineRates — contenances invalides", () => {
  it("renvoie [0] pour null, undefined, 0 ou négatif", () => {
    expect(availableNicotineRates(null, CFG)).toEqual([0]);
    expect(availableNicotineRates(undefined, CFG)).toEqual([0]);
    expect(availableNicotineRates(0, CFG)).toEqual([0]);
    expect(availableNicotineRates(-30, CFG)).toEqual([0]);
  });
});

describe("formatMixNicotine", () => {
  it("formate les taux en français", () => {
    expect(formatMixNicotine(0)).toBe("0 mg");
    expect(formatMixNicotine(10)).toBe("10 mg");
    expect(formatMixNicotine(3.33)).toBe("3,3 mg");
  });
});
