import type { IsoDateTime } from "../common/dates";

/** Upper bound for servings in the plan and in the recipe dialog. */
export const MAX_PLAN_SERVINGS = 20;
export const MAX_SHOPPING_TEXT_LENGTH = 200;

/**
 * A dish the user intends to cook. Planning never changes inventory; only
 * confirming that a dish was cooked deducts stock.
 */
export interface PlanEntry {
  id: string;
  /** Weak reference: a recipe deleted later is shown as unavailable. */
  recipeId: string;
  servings: number;
  /** Order in the plan; earlier dishes get stock first when lines tie. */
  position: number;
  /**
   * The ingredient to buy for a recipe line (by line key) when the user picked
   * an alternative. Lines without an entry use the recipe's own ingredient.
   */
  choices: Record<string, string>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * A row of the shopping list that holds user input.
 * - `plan`: state for the gap of one ingredient, which itself is recomputed
 *   from the plan and the current inventory. The ID is `planItemId(ingredient)`.
 * - `manual`: free text the user added.
 * Ticking "bought" never changes inventory; entering stock is a separate step.
 */
export interface ShoppingItem {
  id: string;
  source: "plan" | "manual";
  ingredientDefinitionId?: string;
  label?: string;
  /** Plan items: grams the user intends to buy, replacing the computed gap. */
  plannedGrams?: number;
  /** Pack size or quantity in the user's words, e.g. "1 pack of 300 g". */
  note?: string;
  bought: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export const planItemId = (ingredientDefinitionId: string) => `plan:${ingredientDefinitionId}`;
