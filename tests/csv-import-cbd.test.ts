import { describe, expect, it } from "vitest";
import { classify, parseCsv } from "@/routes/_authenticated/admin/produits.import";

const CSV = `Nom;Marque;Sous-catégorie suggérée;Type;Stock;Catégorie
Purple Haze;Green Lab;CBD;fleur;120
Gorilla Glue;Green Lab;Venom;résine;40
Amnesia;Green Lab;Amazon;pré-roll;15
`.replace(/(\d+)\n/g, "$1;cbd\n");

describe("import CSV CBD", () => {
  it("accepte les 3 sous-catégories CBD", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(4);
    const parsed = rows.slice(1).map((r) => ({
      line: 0,
      marque: r[1],
      nom: r[0],
      volume_ml: null,
      type: r[3],
      nicotines_10ml: [],
      stock: Number(r[4]),
      category: r[5],
      subcategory: r[2],
      ref_fournisseur: "",
    }));
    expect(parsed.map((p) => p.subcategory)).toEqual(["CBD", "Venom", "Amazon"]);
    expect(parsed.map((p) => classify(p))).toEqual([null, null, null]);
  });

  it("refuse une ligne CBD sans type", () => {
    expect(
      classify({
        line: 2, marque: "", nom: "X", volume_ml: null, type: "",
        nicotines_10ml: [], stock: 0, category: "cbd", subcategory: "CBD", ref_fournisseur: "",
      }),
    ).toMatch(/Type manquant/);
  });
});
