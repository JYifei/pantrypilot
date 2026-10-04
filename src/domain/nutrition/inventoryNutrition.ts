import type { IngredientDefinition } from "../ingredients/types";
import { getRemainingGrams } from "../inventory/lotOperations";
import type { InventoryLot } from "../inventory/types";
import { calculateNutritionForWeight, emptyNutrientValues, type NutrientValues } from "./calculate";

/**
 * Edible grams for a purchased weight. The definition's edible ratio is only
 * applied when the lot is bone-in or sold whole, because nutrition data is per
 * 100 g of edible portion and a boneless fillet is already 100 % edible.
 */
export function edibleGrams(
  purchasedGrams: number,
  lot: Pick<InventoryLot, "boneIn" | "form">,
  definition: Pick<IngredientDefinition, "defaultEdibleRatio">,
): number {
  const ratio = definition.defaultEdibleRatio;
  const applies = lot.boneIn === true || lot.form === "whole";
  return applies && ratio !== undefined ? purchasedGrams * ratio : purchasedGrams;
}

export interface LotNutrition {
  /** Edible grams used for the calculation, or null when the weight is unknown. */
  grams: number | null;
  weightIsEstimated: boolean;
  values: NutrientValues;
}

/** Nutrition contained in what is left of a lot. */
export function calculateInventoryNutrition(
  lot: InventoryLot,
  definition: IngredientDefinition,
): LotNutrition {
  const remaining = getRemainingGrams(lot, definition);
  if (!remaining) {
    return { grams: null, weightIsEstimated: false, values: emptyNutrientValues() };
  }
  const grams = edibleGrams(remaining.grams, lot, definition);
  return {
    grams,
    weightIsEstimated: remaining.isEstimate,
    values: calculateNutritionForWeight(definition.nutritionPer100g, grams),
  };
}
