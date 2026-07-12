import { Link } from "@tanstack/react-router";
import { Snowflake, Palmtree } from "lucide-react";

/**
 * Sections d'ambiance visuelle animée pour les grandes familles de goût.
 * - Animations 100 % CSS (transformations + opacité), zéro image lourde.
 * - Respect de `prefers-reduced-motion`.
 * - Le contenu texte/CTA repose toujours sur une carte solide au premier plan.
 */
export function FlavorUniverses() {
  return (
    <section
      aria-label="Univers de goûts"
      className="mx-auto max-w-6xl px-4 pb-24 sm:pb-32"
    >
      <div className="mb-10 max-w-2xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Nos univers de goût
        </p>
        <h2 className="text-3xl sm:text-4xl">
          Deux ambiances, deux voyages sensoriels.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Un aperçu de nos familles de saveurs phares. D'autres univers
          arrivent bientôt.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FrostUniverse />
        <TropicalUniverse />
      </div>
    </section>
  );
}

function FrostUniverse() {
  // 24 flocons — assez pour la sensation, léger pour le GPU.
  const flakes = Array.from({ length: 24 });
  return (
    <article className="universe universe--frost">
      <div aria-hidden className="universe__bg universe__bg--frost" />
      <div aria-hidden className="universe__snow">
        {flakes.map((_, i) => (
          <span
            key={i}
            className="universe__flake"
            style={{
              left: `${(i * 4.17) % 100}%`,
              animationDelay: `${(i % 8) * -1.4}s`,
              animationDuration: `${8 + (i % 5) * 1.4}s`,
              opacity: 0.35 + ((i * 37) % 50) / 100,
              transform: `scale(${0.5 + ((i * 13) % 100) / 100})`,
            }}
          />
        ))}
      </div>
      <div aria-hidden className="universe__scrim universe__scrim--frost" />

      <div className="universe__content">
        <div className="universe__icon universe__icon--frost">
          <Snowflake strokeWidth={1.25} className="h-6 w-6" />
        </div>
        <h3 className="universe__title">Univers Frais &amp; Glacé</h3>
        <p className="universe__lede">
          Menthol vif, fraîcheur polaire, notes glacées. Les recettes qui
          claquent en fin de bouffée.
        </p>
        <div className="universe__card">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sélection glacée
          </span>
          <p className="mt-1 text-sm text-foreground">
            Ice Berg, Fresh Menthol, Polar Storm… retrouvez toute la famille
            fraîcheur.
          </p>
          <Link
            to="/boutique"
            search={{ categorie: "e_liquide", sous_categorie: "frais-glace", tout: false }}
            className="universe__cta universe__cta--frost mt-3"
          >
            Explorer la famille glacée →
          </Link>
        </div>
      </div>
    </article>
  );
}

function TropicalUniverse() {
  const leaves = Array.from({ length: 5 });
  return (
    <article className="universe universe--tropical">
      <div aria-hidden className="universe__bg universe__bg--tropical" />
      <div aria-hidden className="universe__sun" />
      <div aria-hidden className="universe__leaves">
        {leaves.map((_, i) => (
          <span
            key={i}
            className={`universe__leaf universe__leaf--${i + 1}`}
          />
        ))}
      </div>
      <div aria-hidden className="universe__scrim universe__scrim--tropical" />

      <div className="universe__content">
        <div className="universe__icon universe__icon--tropical">
          <Palmtree strokeWidth={1.25} className="h-6 w-6" />
        </div>
        <h3 className="universe__title">Univers Fruité &amp; Exotique</h3>
        <p className="universe__lede">
          Mangue mûre, fruit de la passion, ananas grillé. Le soleil au creux
          du flacon.
        </p>
        <div className="universe__card">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sélection exotique
          </span>
          <p className="mt-1 text-sm text-foreground">
            Des recettes gourmandes et solaires, aux notes de fruits mûrs.
          </p>
          <Link
            to="/boutique"
            search={{ categorie: "e_liquide", sous_categorie: "fruite-exotique", tout: false }}
            className="universe__cta universe__cta--tropical mt-3"
          >
            Explorer la famille exotique →
          </Link>
        </div>
      </div>
    </article>
  );
}