import { describe, expect, it } from "vitest";
import { calculateNutritionForWeight, sumNutrition } from "@/domain/nutrition/calculate";
import { calculateHeuristicScores } from "./nutritionScore";

const byKey = (scores: ReturnType<typeof calculateHeuristicScores>) =>
  Object.fromEntries(scores.map((s) => [s.key, s]));

describe("calculateHeuristicScores", () => {
  it("returns null scores when there is nothing to score", () => {
    const scores = byKey(calculateHeuristicScores([], sumNutrition([])));
    expect(scores.overall?.score).toBeNull();
    expect(scores.plantDiversity?.score).toBeNull();
  });

  it("scores a protein-rich, vegetable-diverse meal highly", () => {
    const items = [
      { definitionId: "chicken", category: "meat" as const, grams: 150 },
      { definitionId: "komatsuna", category: "vegetable" as const, grams: 100 },
      { definitionId: "pepper", category: "vegetable" as const, grams: 60 },
      { definitionId: "shimeji", category: "mushroom" as const, grams: 80 },
    ];
    const summary = sumNutrition([
      calculateNutritionForWeight(
        { kcal: 105, proteinG: 23, fatG: 2, carbohydrateG: 0, fiberG: 0 },
        150,
      ),
      calculateNutritionForWeight(
        { kcal: 13, proteinG: 1.5, fatG: 0.2, carbohydrateG: 2.4, fiberG: 1.9 },
        100,
      ),
      calculateNutritionForWeight(
        { kcal: 20, proteinG: 0.9, fatG: 0.2, carbohydrateG: 5, fiberG: 2.3 },
        60,
      ),
      calculateNutritionForWeight(
        { kcal: 22, proteinG: 2.7, fatG: 0.5, carbohydrateG: 4.8, fiberG: 3 },
        80,
      ),
    ]);
    const scores = byKey(calculateHeuristicScores(items, summary));
    expect(scores.proteinShare?.score).toBe(10);
    expect(scores.plantDiversity?.score).toBe(7);
    expect(scores.fiberDensity?.score).toBe(10);
    expect(scores.overall?.score).toBeGreaterThanOrEqual(9);
    for (const s of Object.values(scores)) {
      if (s.score !== null) {
        expect(s.score).toBeGreaterThanOrEqual(1);
        expect(s.score).toBeLessThanOrEqual(10);
      }
    }
  });

  it("flags partial data instead of treating unknown as zero", () => {
    const summary = sumNutrition([
      calculateNutritionForWeight(
        { kcal: 156, proteinG: 2.5, fatG: 0.3, carbohydrateG: 37, fiberG: 1.5 },
        200,
      ),
      calculateNutritionForWeight({ kcal: 218, proteinG: 20, fatG: 16.5, carbohydrateG: 0 }, 100),
    ]);
    const scores = byKey(
      calculateHeuristicScores(
        [
          { definitionId: "rice", category: "grain", grams: 200 },
          { definitionId: "salmon", category: "fish", grams: 100 },
        ],
        summary,
      ),
    );
    expect(scores.fiberDensity?.partial).toBe(true);
    expect(scores.overall?.partial).toBe(true);
  });
});
