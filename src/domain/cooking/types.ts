import type { IsoDate, IsoDateTime } from "../common/dates";
import type { LocalizedText } from "../common/localizedText";
import type { InventoryUnit, ProductForm } from "../ingredients/taxonomy";

/**
 * How the weight of a used amount is known: weighed grams, an estimate from a
 * unit conversion (e.g. 1 egg ≈ 50 g), or not at all (a unit without estimate).
 */
export type WeightBasis = "exact" | "estimated" | "unknown";

/**
 * What one recipe line took from one lot, frozen at cooking time. Names and
 * amounts are copies, so later edits to the ingredient, the lot or the recipe
 * never change this record.
 */
export interface CookingSessionItem {
  /** Recipe line key at cooking time. */
  ingredientKey: string;
  /** Weak reference: the lot may be deleted later. */
  lotId: string;
  ingredientDefinitionId: string;
  ingredientName: LocalizedText;
  form?: ProductForm;
  /** Bone-in or whole: `grams` is purchased weight, not edible weight. */
  boneIn?: boolean;
  /** Deducted from the lot, in the lot's own measure: grams or count + unit. */
  grams?: number;
  count?: number;
  unit?: InventoryUnit;
  /** Grams of `count` when an estimate existed at cooking time. */
  estimatedGrams?: number;
  weightBasis: WeightBasis;
}

/**
 * One time a recipe was cooked. Saved in the same transaction as the
 * inventory deductions it caused; those transactions carry its ID.
 */
export interface CookingSession {
  id: string;
  cookedAt: IsoDateTime;
  /** Calendar date in the user's time zone. */
  localDate: IsoDate;
  /** Weak reference: the recipe may be edited or deleted later. */
  recipeId?: string;
  recipeName: LocalizedText;
  servings: number;
  items: CookingSessionItem[];
  note?: string;
}
