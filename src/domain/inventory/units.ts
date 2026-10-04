import type { EstimateConfidence, UnitConversionEstimate } from "../ingredients/types";
import type { InventoryUnit } from "../ingredients/taxonomy";

export interface GramAmount {
  grams: number;
  /** False only for exact mass units (g, kg). */
  isEstimate: boolean;
  confidence: EstimateConfidence | "exact";
}

export type UnitConversions = Partial<Record<InventoryUnit, UnitConversionEstimate>>;

export function isMassUnit(unit: InventoryUnit): boolean {
  return unit === "g" || unit === "kg";
}

/**
 * Convert a quantity to grams.
 *
 * Mass units convert exactly. Other units (bag, piece, ml…) only convert when
 * an estimate is available — there is no universal "1 bag = 200 g". Litres
 * fall back to a per-ml estimate when no per-litre estimate exists.
 * Returns null when no conversion is possible.
 */
export function convertToGrams(
  quantity: number,
  unit: InventoryUnit,
  conversions: UnitConversions = {},
): GramAmount | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (unit === "g") return { grams: quantity, isEstimate: false, confidence: "exact" };
  if (unit === "kg") return { grams: quantity * 1000, isEstimate: false, confidence: "exact" };

  const direct = conversions[unit];
  if (direct) {
    return {
      grams: quantity * direct.estimatedGrams,
      isEstimate: true,
      confidence: direct.confidence,
    };
  }
  if (unit === "l" && conversions.ml) {
    return {
      grams: quantity * 1000 * conversions.ml.estimatedGrams,
      isEstimate: true,
      confidence: conversions.ml.confidence,
    };
  }
  return null;
}
