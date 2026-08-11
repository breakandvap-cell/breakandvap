import { describe, expect, test } from "bun:test";
import {
  flattenJsonLd,
  validateHtmlStructuredData,
  validateJsonLdDocument,
  validateNode,
} from "../src/lib/structured-data";

const productLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "E-liquide Fraise",
  description: "Un e-liquide fruité.",
  image: "https://breakandvap.lovable.app/img/fraise.jpg",
  brand: { "@type": "Brand", name: "Break and Vap" },
  offers: {
    "@type": "Offer",
    url: "https://breakandvap.lovable.app/produit/eliquide-fraise",
    price: "12.90",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  },
};

const homeLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "Break and Vap", url: "https://breakandvap.lovable.app/" },
    {
      "@type": "Organization",
      name: "SAS Break and Vap",
      url: "https://breakandvap.lovable.app/",
      address: {
        "@type": "PostalAddress",
        streetAddress: "5 Boulevard de Lattre de Tassigny",
        addressLocality: "Montceau-les-Mines",
        postalCode: "71300",
        addressCountry: "FR",
      },
    },
  ],
};

describe("Product", () => {
  test("accepte un produit conforme", () => {
    expect(validateNode(productLd)).toMatchObject({ type: "Product", valid: true });
  });

  test("refuse un prix formaté avec devise", () => {
    const bad = { ...productLd, offers: { ...productLd.offers, price: "12,90 €" } };
    const r = validateNode(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "offers.price")).toBe(true);
  });

  test("refuse une disponibilité hors vocabulaire schema.org", () => {
    const bad = { ...productLd, offers: { ...productLd.offers, availability: "InStock" } };
    expect(validateNode(bad).errors.some((e) => e.path === "offers.availability")).toBe(true);
  });

  test("refuse une image relative et exige offers", () => {
    expect(validateNode({ ...productLd, image: "/img/x.jpg" }).valid).toBe(false);
    const { offers, ...withoutOffers } = productLd;
    expect(validateNode(withoutOffers).errors.some((e) => e.path === "offers")).toBe(true);
  });
});

describe("Organization / LocalBusiness / WebSite", () => {
  test("valide le graphe de la page d'accueil", () => {
    const reports = validateJsonLdDocument(homeLd);
    expect(reports.map((r) => r.type).sort()).toEqual(["Organization", "WebSite"]);
    expect(reports.every((r) => r.valid)).toBe(true);
  });

  test("exige une URL absolue pour Organization", () => {
    const reports = validateJsonLdDocument({
      "@type": "Organization",
      name: "X",
      url: "/",
    });
    expect(reports[0].errors.some((e) => e.path === "url")).toBe(true);
  });

  test("exige une adresse complète pour LocalBusiness", () => {
    const r = validateNode({ "@type": "LocalBusiness", name: "Boutique" });
    expect(r.errors.some((e) => e.path === "address")).toBe(true);
  });
});

describe("extraction", () => {
  test("aplatit @graph et tableaux", () => {
    expect(flattenJsonLd([homeLd, productLd])).toHaveLength(3);
  });

  test("extrait et valide le JSON-LD d'une page HTML", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(
      productLd,
    )}</script></head><body></body></html>`;
    const res = validateHtmlStructuredData(html);
    expect(res.blocks).toBe(1);
    expect(res.parseErrors).toHaveLength(0);
    expect(res.reports[0].valid).toBe(true);
  });

  test("signale un JSON-LD mal formé", () => {
    const res = validateHtmlStructuredData(
      `<script type="application/ld+json">{ oops }</script>`,
    );
    expect(res.parseErrors).toHaveLength(1);
  });
});
