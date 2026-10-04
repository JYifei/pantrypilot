import { NUTRIENT_KEYS, type NutrientKey, type NutritionFacts } from "./types";

/**
 * Nutrient amounts for a concrete portion. `null` means unknown — either the
 * food has no nutrition record or the source does not report that nutrient.
 */
export type NutrientValues = Record<NutrientKey, number | null>;

/** Aggregated amount for one nutrient across several portions. */
export interface NutrientTotal {
  /** Sum of the known amounts, or null when no portion reported this nutrient. */
  amount: number | null;
  /** Portions that contributed a known value (including known zeros). */
  knownCount: number;
  /** Portions for which the value is unknown; when > 0 the total is a lower bound. */
  unknownCount: number;
}

export interface NutritionSummary {
  totals: Record<NutrientKey, NutrientTotal>;
  itemCount: number;
}

export function emptyNutrientValues(): NutrientValues {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null])) as NutrientValues;
}

/**
 * Scale per-100 g nutrition to a portion weight (grams of edible food).
 *
 * Deterministic and unrounded; round only for display.
 * Example: 200 g of a food with 200 kcal / 100 g → 400 kcal.
 */
export function calculateNutritionForWeight(
  per100g: NutritionFacts | null | undefined,
  grams: number,
): NutrientValues {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`Portion weight must be a non-negative number, got ${grams}`);
  }
  const result = emptyNutrientValues();
  if (!per100g) return result;
  for (const key of NUTRIENT_KEYS) {
    const value = per100g[key];
    result[key] =
      typeof value === "number" && Number.isFinite(value) ? (value * grams) / 100 : null;
  }
  return result;
}

/**
 * Sum several portions. Unknown values are not treated as zero: each total
 * tracks how many portions were unknown so the UI can mark it as incomplete.
 */
export function sumNutrition(items: readonly NutrientValues[]): NutritionSummary {
  const totals = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, { amount: null, knownCount: 0, unknownCount: 0 }]),
  ) as Record<NutrientKey, NutrientTotal>;

  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const total = totals[key];
      const value = item[key];
      if (value === null) {
        total.unknownCount += 1;
      } else {
        total.amount = (total.amount ?? 0) + value;
        total.knownCount += 1;
      }
    }
  }
  return { totals, itemCount: items.length };
}

/** True when some, but not all, portions reported this nutrient. */
export function isPartialTotal(total: NutrientTotal): boolean {
  return total.unknownCount > 0 && total.knownCount > 0;
}

/** Energy from protein / fat / carbohydrate using Atwater factors (4 / 9 / 4 kcal per g). */
export function macroEnergyShares(
  values: Pick<NutrientValues, "proteinG" | "fatG" | "carbohydrateG">,
): { protein: number; fat: number; carbohydrate: number } | null {
  const { proteinG, fatG, carbohydrateG } = values;
  if (proteinG === null || fatG === null || carbohydrateG === null) return null;
  const protein = proteinG * 4;
  const fat = fatG * 9;
  const carbohydrate = carbohydrateG * 4;
  const total = protein + fat + carbohydrate;
  if (total <= 0) return null;
  return { protein: protein / total, fat: fat / total, carbohydrate: carbohydrate / total };
}
