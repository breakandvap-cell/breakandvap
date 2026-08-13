// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
// @ts-expect-error - script Node en JS pur, sans types
import { assertSingletons } from "./scripts/check-singletons.mjs";

/**
 * Échoue le build si React ou TanStack Router sont installés en double
 * (cause classique de "resolveDispatcher().use is null" / écran blanc).
 */
function singletonGuard(): Plugin {
  let ran = false;
  return {
    name: "lovable-singleton-guard",
    // Exécuter aussi en développement : le crash se produit dans le navigateur
    // bien avant qu'une build de production ne lance cette vérification.
    buildStart() {
      if (ran) return; // le build tourne en plusieurs environnements (client/ssr)
      ran = true;
      const report = assertSingletons(process.cwd()) as string[];
      this.info?.("Singletons OK — " + report.join(" | "));
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [singletonGuard()],
    optimizeDeps: {
      // TanStack Start découvre sinon ces imports profonds après le premier rendu
      // SSR. Vite lance alors une seconde optimisation et remplace en cours de
      // page les chunks auxquels React Router est relié. Pré-bundler tout le
      // sous-graphe dès le démarrage garantit une seule génération de cache.
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "@tanstack/react-router > @tanstack/react-store",
        "@tanstack/history",
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "h3-v2",
        "seroval",
      ],
      // Le preset active cette option expérimentale, mais Vite précise qu'elle
      // peut conserver simultanément l'ancienne et la nouvelle référence d'un
      // module lorsqu'une seconde vague de pré-bundling se produit. Pour React,
      // cela dissocie le dispatcher utilisé par react-dom de celui des hooks et
      // provoque `resolveDispatcher().use is null`.
      //
      // En la désactivant, une requête vers un chunk optimisé devenu obsolète
      // échoue proprement et force le navigateur à recharger un graphe cohérent
      // au lieu de mélanger deux générations du cache Vite.
      ignoreOutdatedRequests: false,
    },
    resolve: {
      // Le preset Lovable déduplique déjà react/react-dom/react-query ;
      // on y ajoute les paquets du router pour interdire toute instance parallèle.
      dedupe: [
        "@tanstack/react-router",
        "@tanstack/react-start",
        "@tanstack/router-core",
        "@tanstack/history",
      ],
    },
  },
});
