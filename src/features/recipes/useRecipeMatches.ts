import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "@/app/appContext";
import { allLocalizedValues } from "@/domain/common/localizedText";
import { recentCooks, sortWithRepeatHints, type RecentCook } from "@/domain/cooking/history";
import { normalizeSearchText } from "@/domain/ingredients/search";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import { matchAllRecipes, type RecipeMatch } from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";

/** Recipes cooked within the repeat hint window set in settings. */
export function useRecentCooks(): ReadonlyMap<string, RecentCook> {
  const { sessions, today, settings } = useApp();
  return useMemo(
    () => recentCooks(sessions, today, settings.repeatHintDays),
    [sessions, today, settings.repeatHintDays],
  );
}

/** "Cooked today / yesterday / N days ago", or null when not cooked recently. */
export function useCookedAgoText(): (recipeId: string) => string | null {
  const { t } = useTranslation();
  const recent = useRecentCooks();
  return (recipeId) => {
    const cook = recent.get(recipeId);
    if (!cook) return null;
    if (cook.daysAgo === 0) return t("recipes.cookedToday");
    if (cook.daysAgo === 1) return t("recipes.cookedYesterday");
    return t("recipes.cookedDaysAgo", { count: cook.daysAgo });
  };
}

/**
 * All recipes matched against current inventory, best candidates first;
 * recently cooked recipes go after others of the same readiness.
 */
export function useRecipeMatches(): RecipeMatch[] {
  const { recipes, lots, definitionsById, today } = useApp();
  const recent = useRecentCooks();
  return useMemo(
    () => sortWithRepeatHints(matchAllRecipes(recipes, { lots, definitionsById, today }), recent),
    [recipes, lots, definitionsById, today, recent],
  );
}

/** Searchable text: recipe names in every language plus its ingredients' names and aliases. */
export function recipeSearchText(
  recipe: Recipe,
  definitionsById: ReadonlyMap<string, IngredientDefinition>,
): string {
  const parts = [...allLocalizedValues(recipe.name)];
  for (const line of recipe.ingredients) {
    const definition = definitionsById.get(line.ingredientId);
    if (definition) parts.push(...allLocalizedValues(definition.name), ...definition.aliases);
  }
  return normalizeSearchText(parts.join(" "));
}
