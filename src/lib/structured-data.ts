/**
 * Validation des données structurées JSON-LD (règles Google Rich Results).
 * Implémente les exigences documentées par Google pour les types utilisés
 * sur le site : Product, Organization, LocalBusiness, WebSite.
 */

export type JsonLdIssue = { path: string; message: string };
export type JsonLdReport = {
  type: string;
  errors: JsonLdIssue[];
  warnings: JsonLdIssue[];
  valid: boolean;
};

type Node = Record<string, any>;

const AVAILABILITY = new Set([
  "https://schema.org/InStock",
  "https://schema.org/OutOfStock",
  "https://schema.org/PreOrder",
  "https://schema.org/BackOrder",
  "https://schema.org/Discontinued",
  "https://schema.org/LimitedAvailability",
  "https://schema.org/SoldOut",
]);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isAbsoluteUrl = (v: unknown): boolean =>
  isNonEmptyString(v) && /^https?:\/\/[^\s]+$/i.test(v);

/** Aplatit un document JSON-LD (@graph, tableaux) en une liste de nœuds typés. */
export function flattenJsonLd(input: unknown): Node[] {
  const out: Node[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Node;
    if (Array.isArray(node["@graph"])) {
      node["@graph"].forEach(walk);
      if (!node["@type"]) return;
    }
    if (node["@type"]) out.push(node);
  };
  walk(input);
  return out;
}

function validateProduct(node: Node, errors: JsonLdIssue[], warnings: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) {
    errors.push({ path: "name", message: "Le champ « name » est requis." });
  }
  if (!isNonEmptyString(node.description)) {
    warnings.push({ path: "description", message: "« description » recommandé." });
  }
  const image = Array.isArray(node.image) ? node.image[0] : node.image;
  if (image === undefined) {
    warnings.push({ path: "image", message: "« image » recommandé pour les rich results." });
  } else if (!isAbsoluteUrl(image)) {
    errors.push({ path: "image", message: "« image » doit être une URL absolue." });
  }
  if (node.brand !== undefined) {
    const brand = node.brand as Node;
    if (typeof brand !== "object" || brand["@type"] !== "Brand" || !isNonEmptyString(brand.name)) {
      errors.push({ path: "brand", message: "« brand » doit être un objet Brand avec un name." });
    }
  }
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  if (!offers || typeof offers !== "object") {
    errors.push({ path: "offers", message: "« offers » (Offer) est requis pour Product." });
    return;
  }
  const o = offers as Node;
  if (o["@type"] !== "Offer" && o["@type"] !== "AggregateOffer") {
    errors.push({ path: "offers.@type", message: "@type doit être Offer ou AggregateOffer." });
  }
  if (!isAbsoluteUrl(o.url)) {
    warnings.push({ path: "offers.url", message: "« url » absolue recommandée dans Offer." });
  }
  if (o.price === undefined || !/^\d+(\.\d{1,2})?$/.test(String(o.price))) {
    errors.push({
      path: "offers.price",
      message: "« price » doit être un nombre sans symbole monétaire (ex. « 12.90 »).",
    });
  }
  if (!/^[A-Z]{3}$/.test(String(o.priceCurrency ?? ""))) {
    errors.push({ path: "offers.priceCurrency", message: "Code devise ISO 4217 requis (ex. EUR)." });
  }
  if (!AVAILABILITY.has(String(o.availability ?? ""))) {
    errors.push({
      path: "offers.availability",
      message: "« availability » doit être une valeur schema.org (ex. https://schema.org/InStock).",
    });
  }
}

function validateOrganization(node: Node, errors: JsonLdIssue[], warnings: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) {
    errors.push({ path: "name", message: "Le champ « name » est requis." });
  }
  if (!isAbsoluteUrl(node.url)) {
    errors.push({ path: "url", message: "« url » absolue requise." });
  }
  if (node.logo !== undefined && !isAbsoluteUrl(node.logo)) {
    errors.push({ path: "logo", message: "« logo » doit être une URL absolue." });
  }
  if (node.address !== undefined) validateAddress(node.address, errors);
  else warnings.push({ path: "address", message: "« address » recommandé." });
}

function validateLocalBusiness(node: Node, errors: JsonLdIssue[], warnings: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) {
    errors.push({ path: "name", message: "Le champ « name » est requis." });
  }
  if (node.address === undefined) {
    errors.push({ path: "address", message: "« address » (PostalAddress) est requis." });
  } else {
    validateAddress(node.address, errors);
  }
  if (!isAbsoluteUrl(node.url)) {
    warnings.push({ path: "url", message: "« url » absolue recommandée." });
  }
  if (node.telephone !== undefined && !isNonEmptyString(node.telephone)) {
    errors.push({ path: "telephone", message: "« telephone » ne doit pas être vide." });
  }
}

function validateAddress(address: unknown, errors: JsonLdIssue[]) {
  if (!address || typeof address !== "object") {
    errors.push({ path: "address", message: "« address » doit être un objet PostalAddress." });
    return;
  }
  const a = address as Node;
  if (a["@type"] !== "PostalAddress") {
    errors.push({ path: "address.@type", message: "@type doit être PostalAddress." });
  }
  for (const field of ["addressLocality", "addressCountry"]) {
    if (!isNonEmptyString(a[field])) {
      errors.push({ path: `address.${field}`, message: `« ${field} » est requis.` });
    }
  }
}

function validateWebSite(node: Node, errors: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) {
    errors.push({ path: "name", message: "Le champ « name » est requis." });
  }
  if (!isAbsoluteUrl(node.url)) {
    errors.push({ path: "url", message: "« url » absolue requise." });
  }
}

/** Valide un ItemList (liste de produits d'une page catalogue). */
function validateItemList(node: Node, errors: JsonLdIssue[], warnings: JsonLdIssue[], prefix = "") {
  const p = (s: string) => `${prefix}${s}`;
  const elements = node.itemListElement;
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push({ path: p("itemListElement"), message: "« itemListElement » (tableau non vide) est requis." });
    return;
  }
  if (node.numberOfItems !== undefined && Number(node.numberOfItems) !== elements.length) {
    warnings.push({
      path: p("numberOfItems"),
      message: "« numberOfItems » devrait correspondre au nombre d'éléments listés.",
    });
  }
  elements.forEach((raw, i) => {
    const base = p(`itemListElement[${i}]`);
    if (!raw || typeof raw !== "object") {
      errors.push({ path: base, message: "Chaque élément doit être un objet ListItem." });
      return;
    }
    const el = raw as Node;
    if (el["@type"] !== "ListItem") {
      errors.push({ path: `${base}.@type`, message: "@type doit être ListItem." });
    }
    if (typeof el.position !== "number" || el.position < 1) {
      errors.push({ path: `${base}.position`, message: "« position » (entier ≥ 1) est requis." });
    }
    const item = el.item as Node | undefined;
    if (item && typeof item === "object") {
      if (item["@type"] === "Product") {
        // Dans une liste, la description par produit n'est pas attendue.
        const nestedWarnings: JsonLdIssue[] = [];
        validateProduct(item, errors, nestedWarnings);
        warnings.push(...nestedWarnings.filter((w) => w.path !== "description"));
      } else if (!isNonEmptyString(item.name)) {
        errors.push({ path: `${base}.item.name`, message: "« name » est requis." });
      }
      if (!isAbsoluteUrl(item.url)) {
        errors.push({ path: `${base}.item.url`, message: "« url » absolue requise." });
      }
    } else if (!isAbsoluteUrl(el.url)) {
      errors.push({ path: `${base}.item`, message: "« item » (ou « url » absolue) est requis." });
    }
  });
}

/** Valide une CollectionPage (page de listing) et son ItemList imbriqué. */
function validateCollectionPage(node: Node, errors: JsonLdIssue[], warnings: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) {
    errors.push({ path: "name", message: "Le champ « name » est requis." });
  }
  if (!isAbsoluteUrl(node.url)) {
    errors.push({ path: "url", message: "« url » absolue requise." });
  }
  if (!isNonEmptyString(node.description)) {
    warnings.push({ path: "description", message: "« description » recommandé." });
  }
  const main = node.mainEntity as Node | undefined;
  if (!main || typeof main !== "object") {
    errors.push({ path: "mainEntity", message: "« mainEntity » (ItemList) est requis." });
    return;
  }
  if (main["@type"] !== "ItemList") {
    errors.push({ path: "mainEntity.@type", message: "@type doit être ItemList." });
  }
  validateItemList(main, errors, warnings, "mainEntity.");
}

/** Valide un nœud JSON-LD isolé selon son @type. */
export function validateNode(node: Node): JsonLdReport {
  const errors: JsonLdIssue[] = [];
  const warnings: JsonLdIssue[] = [];
  const type = String(node["@type"] ?? "");
  switch (type) {
    case "Product":
      validateProduct(node, errors, warnings);
      break;
    case "Organization":
      validateOrganization(node, errors, warnings);
      break;
    case "LocalBusiness":
    case "Store":
      validateLocalBusiness(node, errors, warnings);
      break;
    case "WebSite":
      validateWebSite(node, errors);
      break;
    case "ItemList":
      validateItemList(node, errors, warnings);
      break;
    case "CollectionPage":
      validateCollectionPage(node, errors, warnings);
      break;
    default:
      warnings.push({ path: "@type", message: `Type « ${type || "inconnu"} » non vérifié.` });
  }
  return { type: type || "Unknown", errors, warnings, valid: errors.length === 0 };
}

/** Valide un document JSON-LD complet (objet, tableau ou @graph). */
export function validateJsonLdDocument(input: unknown): JsonLdReport[] {
  const nodes = flattenJsonLd(input);
  if (nodes.length === 0) {
    return [
      {
        type: "Unknown",
        errors: [{ path: "@type", message: "Aucun nœud typé trouvé dans le JSON-LD." }],
        warnings: [],
        valid: false,
      },
    ];
  }
  return nodes.map(validateNode);
}

/** Extrait et valide tous les blocs application/ld+json d'une page HTML. */
export function validateHtmlStructuredData(html: string): {
  blocks: number;
  reports: JsonLdReport[];
  parseErrors: string[];
} {
  const parseErrors: string[] = [];
  const reports: JsonLdReport[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let blocks = 0;
  while ((match = re.exec(html)) !== null) {
    blocks += 1;
    try {
      reports.push(...validateJsonLdDocument(JSON.parse(match[1])));
    } catch (e) {
      parseErrors.push(`Bloc ${blocks} : JSON invalide (${(e as Error).message})`);
    }
  }
  return { blocks, reports, parseErrors };
}
