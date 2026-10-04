import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { BUILTIN_DATASET_VERSION, BUILTIN_NUTRITION_SOURCES } from "@/data/nutritionSources";
import type { Repositories } from "@/repositories";

const DATASET_VERSION_KEY = "builtinDatasetVersion";

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
