/**
 * Construit le JSON-LD CollectionPage + ItemList de la page /boutique,
 * conforme aux règles validées par src/lib/structured-data.ts.
 */
export type ShopJsonLdItem = {
  name: string;
  slug: string;
  photo: string | null;
  priceCents: number;
  currency: string;
  outOfStock: boolean;
  brand: string | null;
};

const SITE = "https://breakandvap.lovable.app";

export function buildShopCollectionJsonLd(items: ShopJsonLdItem[]) {
  const listItems = items.map((p, i) => {
    const url = `${SITE}/produit/${p.slug}`;
    return {
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        url,
        ...(p.photo ? { image: p.photo } : {}),
        ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
        offers: {
          "@type": "Offer",
          url,
          price: (p.priceCents / 100).toFixed(2),
          priceCurrency: p.currency || "EUR",
          availability: p.outOfStock
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        },
      },
    };
  });
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Boutique CBD, e-liquides & accessoires — Break and Vap",
    description:
      "Catalogue Break and Vap : fleurs et résines CBD, e-liquides et accessoires de vape, avec prix et disponibilité à jour.",
    url: `${SITE}/boutique`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listItems.length,
      itemListElement: listItems,
    },
  };
}