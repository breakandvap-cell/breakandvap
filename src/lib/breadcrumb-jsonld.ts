/**
 * Construit le JSON-LD BreadcrumbList (fil d'Ariane) affiché dans les SERP.
 * Les URLs sont absolues, comme exigé par Google.
 */
const SITE = "https://breakandvap.lovable.app";

export type Crumb = { name: string; path: string };

export function buildBreadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.path}`,
    })),
  };
}

export const HOME_CRUMB: Crumb = { name: "Accueil", path: "/" };
