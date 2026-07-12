
# Navigation progressive par catégories sur /boutique

## Objectif
Transformer la page boutique en un parcours visuel en 3 niveaux (catégories → sous-catégories → produits), avec gestion complète depuis l'admin. Le bouton "Découvrir le catalogue" continue de pointer vers `/boutique`.

## 1. Base de données (migration)

Nouvelles tables :

- `public.shop_categories` — catégories principales gérées en base
  - `key` (unique, ex: `cbd`, `e_liquide`, `accessoire_vape`, `accessoire_cbd`) — pont vers l'enum `product_category` existant
  - `name`, `description`, `image_url`, `sort_order`, `is_active`

- `public.shop_subcategories` — sous-catégories
  - `category_id` → `shop_categories.id`
  - `slug` (unique par catégorie), `name`, `description`, `image_url`, `sort_order`, `is_active`

- `products.subcategory_id` (nullable) → `shop_subcategories.id` ; `ON DELETE RESTRICT` pour bloquer la suppression d'une sous-catégorie ayant encore des produits.

RLS : lecture publique (anon + authenticated), écriture réservée aux admins via `has_role(auth.uid(), 'admin')`. GRANT SELECT à anon/authenticated ; ALL à service_role/authenticated pour écriture contrôlée par policy.

Seed initial dans la même migration :
- CBD → Accessoire, CBD, Venom, Amazon
- E-liquides → Frais & Glacé, Fruité & Exotique, Gourmand, Classique
- Accessoires Vape / Accessoires CBD → aucune sous-catégorie

Bucket storage `category-images` (public) pour les visuels, créé via l'outil dédié.

## 2. Page boutique `/boutique`

Refonte en state machine locale (pas de rechargement) pilotée par `useSearch` :

- Search params : `categorie?: string` (key), `sous_categorie?: string` (slug)
- Étape 1 (aucun param) : grille 2×2 des 4 catégories principales, grandes tuiles avec image + titre + description + CTA.
- Étape 2 (`categorie` seul) :
  - si la catégorie a des sous-catégories → tuiles des sous-catégories
  - sinon → produits directement filtrés
- Étape 3 (`categorie` + `sous_categorie`) : produits filtrés (join sur `subcategory_id`).
- Fil d'Ariane : `Boutique > CBD > Venom` (chaque niveau cliquable, remonte via `navigate` en modifiant les search params).
- Lien secondaire "Voir tout le catalogue" qui force `categorie=all` (bypass) → grille produits complète.
- Transitions douces via `framer-motion` (fade + slide léger) entre les étapes.

## 3. Admin `/admin/categories`

Nouvelle route sous `_authenticated/admin/categories.tsx` :

- Arborescence dépliable (catégorie → sous-catégories)
- Actions catégorie : éditer nom/description/image, réordonner (boutons ↑↓ + champ `sort_order`)
- Actions sous-catégorie : créer / éditer / supprimer / réordonner
- Upload d'image via le bucket `category-images`
- Suppression :
  - si des produits sont encore liés → refus avec message clair + lien vers la liste des produits concernés
  - sinon → confirmation
- Ajout d'un lien "Catégories" dans la nav admin (`route.tsx`)

Server functions dans `src/lib/categories.functions.ts` (list, create, update, delete, reorder) avec `requireSupabaseAuth` + vérification `has_role admin` pour les mutations.

## 4. Formulaire produit

Dans `admin/produits.$id.tsx` :
- Le sélecteur catégorie reste basé sur l'enum existant (`product_category`) pour compat.
- Ajout d'un second `<Select>` "Sous-catégorie" alimenté par les sous-catégories liées à la catégorie choisie (via la key). Vide autorisé.
- Sauvegarde `subcategory_id` sur `products`.

## 5. Page d'accueil — universes

Dans `flavor-universe.tsx`, mettre à jour les CTA :
- "Explorer la famille glacée" → `/boutique?categorie=e_liquide&sous_categorie=frais-glace`
- "Explorer les fruités" → `/boutique?categorie=e_liquide&sous_categorie=fruite-exotique`

## 6. Hors périmètre (inchangé)
Fiches produit, variantes, tunnel de commande, espace admin hors nouvelle page, RLS existante.

## Détails techniques

- Search schema Zod étendu, `stripSearchParams` pour retirer les valeurs par défaut.
- Requêtes React Query : `shopCategoriesQueryOptions`, `shopSubcategoriesQueryOptions(categoryId)`, `productsQueryOptions({ categoryKey, subcategorySlug })`.
- `products` query mise à jour pour supporter le filtre `subcategory_id`.
- Images : `image_url` stocke l'URL publique renvoyée par `supabase.storage.from('category-images').getPublicUrl(...)`.
