import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import type { InventoryLot } from "../inventory/types";
import { matchPlan, matchRecipe, type MatchContext, type PlannedDish } from "../recipes/matching";
import type { Recipe, RecipeIngredient } from "../recipes/types";
import { buildShoppingList, type PlanDish } from "./shoppingList";

const definitionsById = new Map(BUILTIN_INGREDIENTS.map((d) => [d.id, d]));
const TODAY = "2026-10-04";

function lot(id: string, ingredientDefinitionId: string, extra: Partial<InventoryLot> = {}) {
  return {
    id,
    ingredientDefinitionId,
    processing: [],
    storage: "refrigerated",
    opened: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  } satisfies InventoryLot;
}

const ctx = (lots: InventoryLot[]): MatchContext => ({ lots, definitionsById, today: TODAY });

function recipe(
  id: string,
  ingredients: RecipeIngredient[],
  seasonings: Recipe["seasonings"] = [],
): Recipe {
  return {
    id,
    name: { zhCN: id },
    servings: 2,
    tags: [],
    ingredients,
    seasonings,
    steps: [],
    dataQuality: "user",
    isBuiltin: false,
  };
}

function list(dishes: PlannedDish[], lots: InventoryLot[], choices: Record<string, string>[] = []) {
  const matches = matchPlan(dishes, ctx(lots));
  const planDishes: PlanDish[] = matches.map((match, i) => ({
    entryId: `e${i}`,
    match,
    choices: choices[i] ?? {},
  }));
  return { matches, list: buildShoppingList(planDishes, definitionsById) };
}

const onionA = recipe("a", [{ key: "onion", ingredientId: "onion_raw", grams: 80 }]);
const onionB = recipe("b", [{ key: "onion", ingredientId: "onion_raw", grams: 80 }]);

describe("plan allocation", () => {
  it("shares 100 g of onion between two dishes needing 80 g each: one merged 60 g gap", () => {
    const { matches, list: result } = list(
      [
        { recipe: onionA, servings: 2 },
        { recipe: onionB, servings: 2 },
      ],
      [lot("onion", "onion_raw", { remainingWeightG: 100 })],
    );
    expect(matches[0]!.lines[0]!.status).toBe("enough");
    expect(matches[1]!.lines[0]).toMatchObject({ status: "partial", suppliedGrams: 20 });
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      ingredientId: "onion_raw",
      neededGrams: 160,
      inStockGrams: 100,
      gapGrams: 60,
    });
    expect(result.gaps[0]!.sources.map((s) => s.recipe.id)).toEqual(["a", "b"]);
  });

  it("scales by servings before sharing stock", () => {
    const { list: result } = list(
      [
        { recipe: onionA, servings: 1 },
        { recipe: onionB, servings: 4 },
      ],
      [lot("onion", "onion_raw", { remainingWeightG: 100 })],
    );
    // 40 g + 160 g needed, 100 g in stock.
    expect(result.gaps[0]).toMatchObject({ neededGrams: 200, inStockGrams: 100, gapGrams: 100 });
  });

  it("gives stock to the earlier dish when lines tie", () => {
    const { matches } = list(
      [
        { recipe: onionB, servings: 2 },
        { recipe: onionA, servings: 2 },
      ],
      [lot("onion", "onion_raw", { remainingWeightG: 100 })],
    );
    expect(matches[0]!.recipe.id).toBe("b");
    expect(matches[0]!.lines[0]!.status).toBe("enough");
    expect(matches[1]!.lines[0]!.status).toBe("partial");
  });

  it("matches a single dish exactly like matchRecipe", () => {
    const lots = [lot("onion", "onion_raw", { remainingWeightG: 100 })];
    const two = recipe("two", [
      { key: "x", ingredientId: "onion_raw", grams: 80 },
      { key: "y", ingredientId: "onion_raw", grams: 80 },
    ]);
    expect(matchPlan([{ recipe: two, servings: 3 }], ctx(lots))[0]).toEqual(
      matchRecipe(two, ctx(lots), 3),
    );
  });

  it("never changes the lots it plans with", () => {
    const lots = [lot("onion", "onion_raw", { remainingWeightG: 100 })];
    const before = structuredClone(lots);
    list(
      [
        { recipe: onionA, servings: 2 },
        { recipe: onionB, servings: 2 },
      ],
      lots,
    );
    expect(lots).toEqual(before);
  });
});

describe("shopping list", () => {
  it("lists nothing when stock covers the plan", () => {
    const { list: result } = list(
      [
        { recipe: onionA, servings: 2 },
        { recipe: onionB, servings: 2 },
      ],
      [lot("onion", "onion_raw", { remainingWeightG: 200 })],
    );
    expect(result.gaps).toEqual([]);
    expect(result.toConfirm).toEqual([]);
  });

  it("puts unknown amounts under 'check stock first', never into gaps", () => {
    const { list: result } = list(
      [
        { recipe: onionA, servings: 2 },
        { recipe: onionB, servings: 2 },
      ],
      [lot("bag", "onion_raw", { count: 1, unit: "bag" })],
    );
    expect(result.gaps).toEqual([]);
    expect(result.toConfirm).toHaveLength(1);
    expect(result.toConfirm[0]!.ingredientId).toBe("onion_raw");
    expect(result.toConfirm[0]!.sources.map((s) => [s.recipe.id, s.reason])).toEqual([
      ["a", "unknown_amount"],
      ["b", "unknown_amount"],
    ]);
  });

  it("buys only the chosen alternative, converted with its ratio", () => {
    const rice = recipe("rice", [
      {
        key: "rice",
        ingredientId: "rice_cooked",
        grams: 400,
        alternatives: [{ ingredientId: "rice_white_raw", ratio: 0.45 }],
      },
    ]);
    const dish = [{ recipe: rice, servings: 2 }];
    const byDefault = list(dish, []).list;
    expect(byDefault.gaps.map((g) => [g.ingredientId, g.gapGrams])).toEqual([["rice_cooked", 400]]);
    const raw = list(dish, [], [{ rice: "rice_white_raw" }]).list;
    expect(raw.gaps.map((g) => [g.ingredientId, g.gapGrams])).toEqual([["rice_white_raw", 180]]);
    const unknownChoice = list(dish, [], [{ rice: "salmon_atlantic_raw" }]).list;
    expect(unknownChoice.gaps[0]!.ingredientId).toBe("rice_cooked");
  });

  it("merges lines of different dishes that buy the same ingredient", () => {
    const fried = recipe("fried", [{ key: "egg", ingredientId: "egg_whole", grams: 100 }]);
    const soup = recipe("soup", [{ key: "egg", ingredientId: "egg_whole", grams: 50 }]);
    const { list: result } = list(
      [
        { recipe: fried, servings: 2 },
        { recipe: soup, servings: 2 },
      ],
      [lot("eggs", "egg_whole", { count: 1, unit: "piece" })],
    );
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({ ingredientId: "egg_whole", gapGrams: 100 });
    expect(result.gaps[0]!.approxPieces).toBe(2);
  });

  it("leaves optional lines out", () => {
    const withGarnish = recipe("g", [
      { key: "onion", ingredientId: "onion_raw", grams: 80 },
      { key: "egg", ingredientId: "egg_whole", grams: 50, optional: true },
    ]);
    const { list: result } = list([{ recipe: withGarnish, servings: 2 }], []);
    expect(result.gaps.map((g) => g.ingredientId)).toEqual(["onion_raw"]);
  });

  it("lists seasonings once with their recipes and never as gaps", () => {
    const a = recipe(
      "a",
      [{ key: "onion", ingredientId: "onion_raw", grams: 80 }],
      [{ zhCN: "酱油", enUS: "Soy sauce" }, { zhCN: "盐" }],
    );
    const b = recipe(
      "b",
      [{ key: "onion", ingredientId: "onion_raw", grams: 80 }],
      [{ zhCN: "酱油", enUS: "Soy sauce" }],
    );
    const { list: result } = list(
      [
        { recipe: a, servings: 2 },
        { recipe: b, servings: 2 },
      ],
      [lot("onion", "onion_raw", { remainingWeightG: 500 })],
    );
    expect(result.gaps).toEqual([]);
    expect(result.seasonings.map((s) => [s.text.zhCN, s.recipes.map((r) => r.id)])).toEqual([
      ["酱油", ["a", "b"]],
      ["盐", ["a"]],
    ]);
  });
});
