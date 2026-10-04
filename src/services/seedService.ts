import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { BUILTIN_RECIPES, BUILTIN_RECIPES_VERSION } from "@/data/builtinRecipes";
import { BUILTIN_DATASET_VERSION, BUILTIN_NUTRITION_SOURCES } from "@/data/nutritionSources";
import type { Repositories } from "@/repositories";

const DATASET_VERSION_KEY = "builtinDatasetVersion";
const RECIPES_VERSION_KEY = "builtinRecipesVersion";

/**
 * Upsert built-in nutrition sources and ingredient definitions when the
 * shipped dataset version differs from the one stored in the database.
 * Built-ins are never deleted, because existing inventory may reference them.
 *
 * @returns true when the dataset was (re-)seeded.
 */
export async function ensureBuiltinData(repos: Repositories): Promise<boolean> {
  const stored = await repos.settings.getMeta(DATASET_VERSION_KEY);
  if (stored === BUILTIN_DATASET_VERSION) return false;

  for (const source of BUILTIN_NUTRITION_SOURCES) {
    await repos.ingredients.saveSource(source, true);
  }
  for (const definition of BUILTIN_INGREDIENTS) {
    await repos.ingredients.save(definition);
  }
  await repos.settings.setMeta(DATASET_VERSION_KEY, BUILTIN_DATASET_VERSION);
  return true;
}

/**
 * Upsert built-in recipes when their version changes. Unlike ingredients,
 * built-in recipes that are no longer shipped are removed: nothing depends on
 * them except the weak `recipeId` reference in transaction history.
 */
export async function ensureBuiltinRecipes(repos: Repositories): Promise<boolean> {
  const stored = await repos.settings.getMeta(RECIPES_VERSION_KEY);
  if (stored === BUILTIN_RECIPES_VERSION) return false;

  for (const recipe of BUILTIN_RECIPES) {
    await repos.recipes.save(recipe);
  }
  await repos.recipes.deleteBuiltinExcept(BUILTIN_RECIPES.map((r) => r.id));
  await repos.settings.setMeta(RECIPES_VERSION_KEY, BUILTIN_RECIPES_VERSION);
  return true;
}
