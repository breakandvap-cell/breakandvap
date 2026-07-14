// Tests des règles de vérification d'âge (fonctions pures extraites de
// src/components/age-gate.tsx). Exécuter avec :  bun test tests/age-gate.test.ts

import { describe, it, expect } from "bun:test";
import { computeAge, isPlausibleBirthDate } from "../src/components/age-gate";

const TODAY = new Date(2026, 6, 14); // 14 juillet 2026 (mois 0-indexé)

describe("computeAge", () => {
  it("retourne l'âge exact quand l'anniversaire est passé cette année", () => {
    expect(computeAge({ year: 2000, month: 1, day: 1 }, TODAY)).toBe(26);
  });
  it("retourne l'âge - 1 quand l'anniversaire n'est pas encore passé", () => {
    expect(computeAge({ year: 2000, month: 12, day: 31 }, TODAY)).toBe(25);
  });
  it("compte 18 ans le jour même de l'anniversaire", () => {
    expect(computeAge({ year: 2008, month: 7, day: 14 }, TODAY)).toBe(18);
  });
  it("compte 17 ans la veille de la majorité", () => {
    expect(computeAge({ year: 2008, month: 7, day: 15 }, TODAY)).toBe(17);
  });
});

describe("isPlausibleBirthDate", () => {
  it("accepte une date valide", () => {
    expect(isPlausibleBirthDate(1990, 5, 20, TODAY)).toBe(true);
  });
  it("refuse un mois hors 1-12", () => {
    expect(isPlausibleBirthDate(1990, 13, 1, TODAY)).toBe(false);
    expect(isPlausibleBirthDate(1990, 0, 1, TODAY)).toBe(false);
  });
  it("refuse un jour inexistant (31 février)", () => {
    expect(isPlausibleBirthDate(2000, 2, 31, TODAY)).toBe(false);
  });
  it("refuse une année dans le futur", () => {
    expect(isPlausibleBirthDate(2100, 1, 1, TODAY)).toBe(false);
  });
  it("refuse une année aberrante dans le passé", () => {
    expect(isPlausibleBirthDate(1800, 1, 1, TODAY)).toBe(false);
  });
  it("accepte le 29 février d'une année bissextile", () => {
    expect(isPlausibleBirthDate(2000, 2, 29, TODAY)).toBe(true);
  });
  it("refuse le 29 février d'une année non bissextile", () => {
    expect(isPlausibleBirthDate(2001, 2, 29, TODAY)).toBe(false);
  });
});