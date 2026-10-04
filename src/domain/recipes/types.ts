import type { IsoDateTime } from "../common/dates";
import type { LocalizedText } from "../common/localizedText";
import type { AnimalSpecies, ProductForm } from "../ingredients/taxonomy";

/** Another ingredient that can stand in for a requirement. */
export interface RecipeIngredientAlternative {
  ingredientId: string;
  /**
   * Grams of this alternative needed per gram of the requirement. Defaults to 1.
   * Example: 400 g cooked rice ≈ 180 g uncooked rice → ratio 0.45.
   */
  ratio?: number;
}

/**
 * One ingredient line of a recipe. Amounts are for `Recipe.servings` and
 * refer to the edible weight of the primary ingredient.
 *
 * Seasonings (soy sauce, salt, oil…) are not inventory-tracked and live in
 * `Recipe.seasonings` instead.
 */
export interface RecipeIngredient {
  /** Stable within the recipe; used to address the line in cooking plans. */
  key: string;
  /** Primary ingredient: used for the display name and the nutrition estimate. */
  ingredientId: string;
  alternatives?: RecipeIngredientAlternative[];
  /** Any ingredient of this species also satisfies the line (e.g. any pork cut). */
  anySpecies?: AnimalSpecies;
  /** Suggested form, shown as a hint only (e.g. thin slices). */
  form?: ProductForm;
  grams: number;
  /** Optional display amount in pieces (e.g. 2 eggs), alongside the grams. */
  count?: number;
  optional?: boolean;
}

export type RecipeDataQuality = "demo" | "user";

export interface Recipe {
  /** Built-ins use stable snake_case IDs (`recipe_oyakodon`); user recipes use UUIDs. */
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  servings: number;
  timeMinutes?: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  /** Pantry staples that are listed but not matched against inventory. */
  seasonings: LocalizedText[];
  steps: LocalizedText[];
  dataQuality: RecipeDataQuality;
  isBuiltin: boolean;
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}
