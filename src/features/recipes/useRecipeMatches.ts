import { useMemo } from "react";
import { useApp } from "@/app/appContext";
import { allLocalizedValues } from "@/domain/common/localizedText";
import { normalizeSearchText } from "@/domain/ingredients/search";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import { matchAllRecipes, type RecipeMatch } from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";

/** All recipes matched against current inventory, best candidates first. */
export function useRecipeMatches(): RecipeMatch[] {
  const { recipes, lots, definitionsById, today } = useApp();
  return useMemo(
    () => matchAllRecipes(recipes, { lots, definitionsById, today }),
    [recipes, lots, definitionsById, today],
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
