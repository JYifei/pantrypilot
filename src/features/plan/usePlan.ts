import { useMemo } from "react";
import { useApp } from "@/app/appContext";
import { buildShoppingList, type ShoppingList } from "@/domain/planning/shoppingList";
import type { PlanEntry } from "@/domain/planning/types";
import { matchPlan, type RecipeMatch } from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";

export interface PlanRow {
  entry: PlanEntry;
  /** Undefined when the recipe no longer exists. */
  recipe?: Recipe;
  /** This dish's share of the plan-wide allocation. */
  match?: RecipeMatch;
}

/** The plan with one shared allocation for all dishes, and the shopping list derived from it. */
export function usePlan(): { rows: PlanRow[]; list: ShoppingList } {
  const { planEntries, recipes, lots, definitionsById, today } = useApp();
  return useMemo(() => {
    const recipesById = new Map(recipes.map((r) => [r.id, r]));
    const rows: PlanRow[] = planEntries.map((entry) => ({
      entry,
      recipe: recipesById.get(entry.recipeId),
    }));
    const available = rows.filter((row) => row.recipe !== undefined);
    const matches = matchPlan(
      available.map((row) => ({ recipe: row.recipe!, servings: row.entry.servings })),
      { lots, definitionsById, today },
    );
    available.forEach((row, i) => (row.match = matches[i]));
    const list = buildShoppingList(
      available.map((row, i) => ({
        entryId: row.entry.id,
        match: matches[i]!,
        choices: row.entry.choices,
      })),
      definitionsById,
    );
    return { rows, list };
  }, [planEntries, recipes, lots, definitionsById, today]);
}
