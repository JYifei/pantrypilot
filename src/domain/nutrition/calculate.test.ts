import { describe, expect, it } from "vitest";
import {
  calculateNutritionForWeight,
  isPartialTotal,
  macroEnergyShares,
  sumNutrition,
} from "./calculate";
import type { NutritionFacts } from "./types";

const food: NutritionFacts = { kcal: 200, proteinG: 20, fatG: 10, carbohydrateG: 0 };

describe("calculateNutritionForWeight", () => {
  it("scales per-100 g values linearly with weight", () => {
    const result = calculateNutritionForWeight(food, 200);
    expect(result.kcal).toBe(400);
    expect(result.proteinG).toBe(40);
    expect(result.fatG).toBe(20);
    expect(result.carbohydrateG).toBe(0);
  });

  it("keeps known zero distinct from unknown", () => {
    const result = calculateNutritionForWeight(food, 150);
    expect(result.carbohydrateG).toBe(0);
    expect(result.fiberG).toBeNull();
    expect(result.vitaminCMg).toBeNull();
  });

  it("returns all-unknown values when the food has no nutrition data", () => {
    const result = calculateNutritionForWeight(null, 100);
    expect(Object.values(result).every((v) => v === null)).toBe(true);
  });

  it("handles zero grams", () => {
    expect(calculateNutritionForWeight(food, 0).kcal).toBe(0);
  });

  it("rejects negative or non-finite weights", () => {
    expect(() => calculateNutritionForWeight(food, -1)).toThrow(RangeError);
    expect(() => calculateNutritionForWeight(food, Number.NaN)).toThrow(RangeError);
  });
});

describe("sumNutrition", () => {
  it("adds known amounts across portions", () => {
    const rice = calculateNutritionForWeight(
      { kcal: 156, proteinG: 2.5, fatG: 0.3, carbohydrateG: 37.1, fiberG: 1.5 },
      180,
    );
    const salmon = calculateNutritionForWeight(
      { kcal: 218, proteinG: 20.1, fatG: 16.5, carbohydrateG: 0.1 },
      140,
    );
    const summary = sumNutrition([rice, salmon]);
    expect(summary.itemCount).toBe(2);
    expect(summary.totals.kcal.amount).toBeCloseTo(156 * 1.8 + 218 * 1.4, 6);
    expect(summary.totals.proteinG.amount).toBeCloseTo(4.5 + 28.14, 6);
  });

  it("marks totals as partial when some portions are unknown", () => {
    const withFiber = calculateNutritionForWeight({ ...food, fiberG: 2 }, 100);
    const withoutFiber = calculateNutritionForWeight(food, 100);
    const summary = sumNutrition([withFiber, withoutFiber]);
    expect(summary.totals.fiberG).toEqual({ amount: 2, knownCount: 1, unknownCount: 1 });
    expect(isPartialTotal(summary.totals.fiberG)).toBe(true);
    expect(isPartialTotal(summary.totals.kcal)).toBe(false);
  });

  it("returns null (not 0) when no portion reports a nutrient", () => {
    const summary = sumNutrition([calculateNutritionForWeight(food, 100)]);
    expect(summary.totals.vitaminDMcg.amount).toBeNull();
    expect(summary.totals.vitaminDMcg.unknownCount).toBe(1);
  });

  it("returns empty totals for no items", () => {
    const summary = sumNutrition([]);
    expect(summary.itemCount).toBe(0);
    expect(summary.totals.kcal.amount).toBeNull();
  });
});

describe("macroEnergyShares", () => {
  it("computes energy shares with Atwater factors", () => {
    const shares = macroEnergyShares({ proteinG: 25, fatG: 0, carbohydrateG: 75 });
    expect(shares?.protein).toBeCloseTo(0.25);
    expect(shares?.carbohydrate).toBeCloseTo(0.75);
  });

  it("returns null when a macro is unknown", () => {
    expect(macroEnergyShares({ proteinG: null, fatG: 1, carbohydrateG: 1 })).toBeNull();
  });
});
