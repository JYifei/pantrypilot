import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import type { InventoryLot } from "../inventory/types";
import {
  compareRecipeMatches,
  displayIngredientId,
  estimateRecipeNutritionPerServing,
  matchAllRecipes,
  matchRecipe,
  planCooking,
  type MatchContext,
} from "./matching";
import type { Recipe } from "./types";

const definitionsById = new Map(BUILTIN_INGREDIENTS.map((d) => [d.id, d]));
const TODAY = "2026-10-04";

let lotSeq = 0;
function lot(ingredientDefinitionId: string, extra: Partial<InventoryLot> = {}): InventoryLot {
  lotSeq += 1;
  return {
    id: `lot-${lotSeq}`,
    ingredientDefinitionId,
    processing: [],
    storage: "refrigerated",
    opened: false,
    createdAt: `2026-10-01T00:00:0${lotSeq % 10}.000Z`,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  };
}

const ctx = (lots: InventoryLot[]): MatchContext => ({ lots, definitionsById, today: TODAY });

const oyakodon: Recipe = {
  id: "test_oyakodon",
  name: { zhCN: "亲子丼" },
  servings: 2,
  tags: [],
  ingredients: [
    {
      key: "chicken",
      ingredientId: "chicken_thigh_skin_on_raw",
      alternatives: [{ ingredientId: "chicken_breast_skinless_raw" }],
      grams: 250,
    },
    { key: "egg", ingredientId: "egg_whole", grams: 150, count: 3 },
    { key: "onion", ingredientId: "onion_raw", grams: 100 },
    {
      key: "rice",
      ingredientId: "rice_cooked",
      alternatives: [{ ingredientId: "rice_white_raw", ratio: 0.45 }],
      grams: 400,
    },
    { key: "mushroom", ingredientId: "shiitake_raw", grams: 30, optional: true },
  ],
  seasonings: [],
  steps: [],
  dataQuality: "demo",
  isBuiltin: true,
};

const steak: Recipe = {
  id: "test_steak",
  name: { zhCN: "牛排" },
  servings: 1,
  tags: [],
  ingredients: [{ key: "beef", ingredientId: "beef_sirloin_raw", anySpecies: "beef", grams: 250 }],
  seasonings: [],
  steps: [],
  dataQuality: "demo",
  isBuiltin: true,
};

describe("matchRecipe", () => {
  it("is ready when every required line is in stock; optional lines do not block", () => {
    const match = matchRecipe(
      oyakodon,
      ctx([
        lot("chicken_thigh_skin_on_raw", { remainingWeightG: 300 }),
        lot("egg_whole", { count: 6, unit: "piece" }),
        lot("onion_raw", { remainingWeightG: 200 }),
        lot("rice_white_raw", { remainingWeightG: 5000 }),
      ]),
    );
    expect(match.readiness).toBe("ready");
    expect(match.shortLines).toEqual([]);
    expect(match.lines.find((l) => l.ingredient.key === "mushroom")!.status).toBe("missing");
  });

  it("accepts alternatives with their ratio (uncooked rice for cooked rice)", () => {
    const match = matchRecipe(oyakodon, ctx([lot("rice_white_raw", { remainingWeightG: 100 })]));
    const rice = match.lines.find((l) => l.ingredient.key === "rice")!;
    // 100 g uncooked ≈ 222 g cooked, less than the 400 g needed.
    expect(rice.availableGrams).toBeCloseTo(222.2, 1);
    expect(rice.status).toBe("partial");
  });

  it("matches any cut of the same species (misuji for a sirloin steak recipe)", () => {
    const match = matchRecipe(steak, ctx([lot("beef_misuji_raw", { remainingWeightG: 251 })]));
    expect(match.readiness).toBe("ready");
  });

  it("shows the stocked substitute when the recipe's own ingredient is absent", () => {
    const [line] = matchRecipe(
      steak,
      ctx([lot("beef_misuji_raw", { remainingWeightG: 251 })]),
    ).lines;
    expect(displayIngredientId(line!)).toBe("beef_misuji_raw");
    const [none] = matchRecipe(steak, ctx([])).lines;
    expect(displayIngredientId(none!)).toBe("beef_sirloin_raw");
  });

  it("does not match a different species", () => {
    const match = matchRecipe(steak, ctx([lot("pork_loin_raw", { remainingWeightG: 500 })]));
    expect(match.readiness).toBe("missing");
  });

  it("ignores expired and depleted lots", () => {
    const match = matchRecipe(
      steak,
      ctx([
        lot("beef_misuji_raw", { remainingWeightG: 300, expirationDate: "2026-10-03" }),
        lot("beef_round_raw", { remainingWeightG: 0, originalWeightG: 300 }),
      ]),
    );
    expect(match.readiness).toBe("missing");
  });

  it("is 'almost' with one or two required items short", () => {
    const match = matchRecipe(
      oyakodon,
      ctx([
        lot("chicken_thigh_skin_on_raw", { remainingWeightG: 300 }),
        lot("egg_whole", { count: 6, unit: "piece" }),
      ]),
    );
    expect(match.readiness).toBe("almost");
    expect(match.shortLines.map((l) => l.ingredient.key)).toEqual(["onion", "rice"]);
  });

  it("scales amounts with servings", () => {
    const lots = [lot("beef_misuji_raw", { remainingWeightG: 300 })];
    expect(matchRecipe(steak, ctx(lots), 1).readiness).toBe("ready");
    const two = matchRecipe(steak, ctx(lots), 2);
    expect(two.lines[0]!.neededGrams).toBe(500);
    expect(two.readiness).toBe("almost");
    expect(two.lines[0]!.status).toBe("partial");
  });

  it("raises urgency for lots that expire soon", () => {
    const fresh = matchRecipe(
      steak,
      ctx([lot("beef_misuji_raw", { remainingWeightG: 300, expirationDate: "2026-10-20" })]),
    );
    const urgent = matchRecipe(
      steak,
      ctx([lot("beef_misuji_raw", { remainingWeightG: 300, expirationDate: "2026-10-05" })]),
    );
    expect(fresh.urgency).toBe(0);
    expect(urgent.urgency).toBeGreaterThan(0);
    expect(urgent.expiringLotIds).toHaveLength(1);
    expect(compareRecipeMatches(urgent, fresh)).toBeLessThan(0);
  });
});

describe("matchAllRecipes", () => {
  it("ranks ready recipes before incomplete ones", () => {
    const ranked = matchAllRecipes(
      [oyakodon, steak],
      ctx([lot("beef_misuji_raw", { remainingWeightG: 300 })]),
    );
    expect(ranked.map((m) => m.recipe.id)).toEqual(["test_steak", "test_oyakodon"]);
  });
});

describe("planCooking", () => {
  it("takes from the earliest-expiring lot first and spills over to the next", () => {
    const later = lot("beef_round_raw", { remainingWeightG: 400, expirationDate: "2026-10-10" });
    const sooner = lot("beef_misuji_raw", { remainingWeightG: 151, expirationDate: "2026-10-06" });
    const plan = planCooking(matchRecipe(steak, ctx([later, sooner])));
    expect(plan).toEqual([
      { ingredientKey: "beef", lotId: sooner.id, grams: 151 },
      { ingredientKey: "beef", lotId: later.id, grams: 99 },
    ]);
  });

  it("deducts count-only lots in pieces and alternatives with their ratio", () => {
    const eggs = lot("egg_whole", { count: 10, unit: "piece" });
    const rice = lot("rice_white_raw", { remainingWeightG: 5000 });
    const plan = planCooking(matchRecipe(oyakodon, ctx([eggs, rice])));
    expect(plan).toContainEqual({ ingredientKey: "egg", lotId: eggs.id, count: 3 });
    expect(plan).toContainEqual({ ingredientKey: "rice", lotId: rice.id, grams: 180 });
  });

  it("never plans more than a lot holds", () => {
    const small = lot("onion_raw", { remainingWeightG: 40 });
    const plan = planCooking(matchRecipe(oyakodon, ctx([small])));
    expect(plan).toEqual([{ ingredientKey: "onion", lotId: small.id, grams: 40 }]);
  });
});

describe("estimateRecipeNutritionPerServing", () => {
  it("divides the primary ingredients' nutrition by servings", () => {
    const sirloin = definitionsById.get("beef_sirloin_raw")!.nutritionPer100g!;
    const summary = estimateRecipeNutritionPerServing(steak, definitionsById);
    expect(summary.totals.kcal.amount).toBeCloseTo(sirloin.kcal * 2.5, 5);

    const perServing = estimateRecipeNutritionPerServing(
      { ...steak, servings: 2 },
      definitionsById,
    );
    expect(perServing.totals.kcal.amount).toBeCloseTo((sirloin.kcal * 2.5) / 2, 5);
  });
});
