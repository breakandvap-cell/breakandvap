# Refonte UX admin — parcours de création produit en étapes

## Objectif

Remplacer l'ouverture directe du formulaire produit par un parcours guidé pour les catégories **simples** (CBD, Accessoire Vape, Accessoire CBD). Le parcours e-liquide reste inchangé et continue d'ouvrir le formulaire complet actuel.

## Portée

- Nouvelle page « choisir une catégorie » avant création.
- Nouveau parcours 4 étapes pour les 3 catégories simples.
- Écran de relecture avec blocage de publication si champs manquants.
- Aucune modification du schéma DB, des server functions d'écriture, ni du parcours e-liquide.

## Parcours utilisateur

### Écran de départ « Nouveau produit »

Route : `/admin/produits/nouveau` (aujourd'hui = formulaire vide).

À la place, affiche 4 cartes :

- **CBD** — « Fleurs, résines, huiles… » — *~45 s*
- **E-liquide** — « Fiole avec contenance, nicotine, goût » — *~3 à 5 min*
- **Accessoire Vape** — « Batterie, résistance, flacon vide… » — *~45 s*
- **Accessoire CBD** — « Grinder, papier, briquet… » — *~45 s*

Chaque carte navigue vers `/admin/produits/nouveau/{slug}` avec `slug ∈ { cbd, e-liquide, accessoire-vape, accessoire-cbd }`. La carte « E-liquide » redirige vers l'ancien formulaire complet (aucune régression).

### Parcours simple en 4 étapes

Route : `/admin/produits/nouveau/$categorie` pour les 3 catégories simples.

Barre de progression sticky en haut : `Étape N sur 4 — Nom de l'étape`.

1. **Base produit** — nom, marque (optionnel), photo principale, catégorie verrouillée (affichée mais non modifiable).
2. **Vente** — prix TTC, stock, SKU (auto-généré depuis nom + timestamp court, modifiable), description courte.
3. **Données métier**
   - **CBD** : taux de CBD (%), taux de THC (%), intensité (léger/modéré/fort), URL certificat d'analyse. Avertissement rouge si THC > 0,3 %.
   - **Accessoire Vape / CBD** : rien par défaut. Deux cases à cocher optionnelles « Ce produit est un booster de nicotine » et « Ce produit est un flacon vide » — si cochées, affiche les champs déjà existants (type de booster / contenance ml).
4. **Relecture** — résumé complet en sections (Base, Vente, Métier), avec badge « Prêt à publier » (vert) ou « Champs manquants » (ambre) listant précisément ce qui bloque. Bouton **« Publier »** actif seulement si tout est complet ; bouton secondaire **« Enregistrer en brouillon »** toujours actif.

### Validation

- Erreurs affichées à côté du champ **ET** dans un bandeau récapitulatif en haut de l'étape en cours si l'employé clique « Étape suivante » avec des champs invalides.
- Aucune donnée perdue entre étapes (état local persistant tant que la page est ouverte). Retour arrière libre.
- Champs obligatoires pour publier : nom, photo, prix > 0, description courte, + pour CBD : CBD % et THC % renseignés (peuvent être 0), certificat obligatoire.
- Publication toujours bloquée si THC > 0,3 % (seuil légal français), même avec bouton « Publier » — remplacé par un message d'erreur explicite dans le bandeau.

## Détails techniques

### Fichiers créés

- `src/routes/_authenticated/admin/produits.nouveau.tsx` — écran de choix (4 cartes). Remplace le rendu actuel de `produits.$id.tsx` lorsque `id === "nouveau"` (on continue d'accepter `/admin/produits/nouveau` mais on redirige vers cette route dédiée).
- `src/routes/_authenticated/admin/produits.nouveau.$categorie.tsx` — parcours guidé. Gère `cbd`, `accessoire-vape`, `accessoire-cbd` ; pour `e-liquide`, redirige vers `/admin/produits/nouveau?legacy=1` (qui rouvre l'ancien formulaire complet).
- `src/components/product-wizard/` — composants découpés :
  - `wizard-progress.tsx` (barre de progression)
  - `step-base.tsx`, `step-sale.tsx`, `step-meta.tsx`, `step-review.tsx`
  - `wizard-context.tsx` (state + validation par étape via un petit reducer local, pas de librairie externe)

### Fichiers modifiés

- `src/routes/_authenticated/admin/produits.$id.tsx` — quand `id === "nouveau"`, `redirect()` vers `/admin/produits/nouveau`. Le formulaire complet reste utilisé pour toute édition existante (`id ≠ "nouveau"`) et pour le fallback e-liquide via query `?legacy=1`.
- `src/routes/_authenticated/admin/produits.index.tsx` — le bouton « + Nouveau produit » pointe vers `/admin/produits/nouveau` (identique côté URL, mais rendra désormais l'écran de choix).

### Écriture en base

Le wizard appelle **la server function existante** `adminUpsertProduct` avec le payload équivalent à ce que produit le formulaire complet, en fixant `is_published = true` (bouton Publier) ou `false` (Enregistrer en brouillon). Aucun changement DB, aucune migration.

### Post-publication

Après succès, redirection vers `/admin/produits/$id` (fiche complète existante) pour permettre les ajustements avancés (variantes, quantités dégressives, etc.).

## Tests manuels

1. Créer un CBD complet via le wizard → publication réussie, produit apparaît publié dans la liste.
2. Laisser le THC vide → étape 4 affiche « Champs manquants : Taux de THC », bouton « Publier » désactivé, bandeau rouge à la tentative.
3. Saisir THC = 0,5 % → avertissement rouge dès l'étape 3, publication bloquée en étape 4 avec message légal.
4. Créer un Accessoire Vape « simple » (sans cocher booster/flacon) → 4 étapes, publication OK sans champ métier.
5. Cliquer « E-liquide » sur l'écran de choix → ouvre l'ancien formulaire complet inchangé.

## Hors périmètre

- Parcours e-liquide (reste sur le formulaire complet actuel).
- Édition d'un produit existant (reste sur le formulaire complet).
- Refonte des références techniques (déjà livrée à la brique précédente).
