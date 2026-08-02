import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  shopCategoriesQueryOptions,
  shopSubcategoriesQueryOptions,
} from "@/lib/categories.functions";

/**
 * Deux listes déroulantes liées : Catégorie -> Sous-catégorie.
 * Les options proviennent exclusivement des tables de catégories existantes
 * (aucune saisie libre, aucune création). La sous-catégorie reste désactivée
 * tant qu'aucune catégorie n'est choisie.
 */
export function CategorySubcategoryFields({
  categoryKey,
  subcategory,
  onChange,
  showErrors = false,
}: {
  categoryKey: string;
  subcategory: string;
  onChange: (next: { categoryKey: string; subcategory: string }) => void;
  showErrors?: boolean;
}) {
  const { data: categories = [] } = useQuery(shopCategoriesQueryOptions());
  const { data: subcategories = [] } = useQuery(shopSubcategoriesQueryOptions());

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [categories],
  );

  const selectedCategory = useMemo(
    () => sortedCategories.find((c) => c.key === categoryKey) ?? null,
    [sortedCategories, categoryKey],
  );

  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    return subcategories
      .filter((s) => s.category_id === selectedCategory.id)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [subcategories, selectedCategory]);

  const handleCategoryChange = (nextKey: string) => {
    const nextCat = sortedCategories.find((c) => c.key === nextKey) ?? null;
    const stillValid =
      nextCat != null &&
      subcategory.length > 0 &&
      subcategories.some(
        (s) => s.category_id === nextCat.id && s.name === subcategory,
      );
    onChange({
      categoryKey: nextKey,
      subcategory: stillValid ? subcategory : "",
    });
  };

  const categoryMissing = showErrors && !categoryKey;
  const subcategoryMissing = showErrors && Boolean(categoryKey) && !subcategory;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="text-sm font-medium" htmlFor="product-category">
          Catégorie *
        </label>
        <select
          id="product-category"
          value={categoryKey}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base"
        >
          <option value="">Sélectionner une catégorie</option>
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
        {categoryMissing && (
          <p className="mt-1 text-xs text-destructive">
            Veuillez sélectionner une catégorie
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="product-subcategory">
          Sous-catégorie *
        </label>
        <select
          id="product-subcategory"
          value={subcategory}
          disabled={!categoryKey}
          onChange={(e) =>
            onChange({ categoryKey, subcategory: e.target.value })
          }
          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">
            {categoryKey
              ? "Sélectionner une sous-catégorie"
              : "Sélectionnez d'abord une catégorie"}
          </option>
          {availableSubcategories.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        {subcategoryMissing && (
          <p className="mt-1 text-xs text-destructive">
            Veuillez sélectionner une sous-catégorie
          </p>
        )}
      </div>
    </div>
  );
}
