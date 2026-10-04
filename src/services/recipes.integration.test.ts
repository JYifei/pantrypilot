import { describe, expect, it } from "vitest";
import { BUILTIN_RECIPES } from "@/data/builtinRecipes";
import { parseBackup, serializeBackup } from "@/domain/backup/backup";
import { matchRecipe, planCooking } from "@/domain/recipes/matching";
import { createTestServices, fixedClock } from "@/test/testDatabase";
import type { LotInput } from "./inventoryService";
import type { RecipeInput } from "./recipeService";

const clock = fixedClock("2026-10-04T09:00:00.000Z");

const misuji: LotInput = {
  ingredientDefinitionId: "beef_misuji_raw",
  cut: "misuji",
  form: "steak",
  originalWeightG: 251,
  thicknessMm: 35,
  processing: [],
  storage: "refrigerated",
  opened: false,
  expirationDate: "2026-10-06",
};

const customRecipe: RecipeInput = {
  name: { zhCN: "牛排盖饭" },
  servings: 1,
  tags: [],
  ingredients: [
    { key: "beef", ingredientId: "beef_sirloin_raw", anySpecies: "beef", grams: 150 },
    { key: "rice", ingredientId: "rice_cooked", grams: 200 },
  ],
  seasonings: [{ zhCN: "酱油" }],
  steps: [{ zhCN: "煎牛排，切片铺在米饭上。" }],
};

async function setup() {
  const services = await createTestServices(clock);
  const definitionsById = new Map(
    (await services.ingredients.listAll()).map((d) => [d.id, d] as const),
  );
  return { services, definitionsById };
}

describe("recipes (sql.js)", () => {
  it("seeds the built-in recipes", async () => {
    const { services } = await setup();
    const recipes = await services.recipes.listAll();
    expect(recipes.filter((r) => r.isBuiltin)).toHaveLength(BUILTIN_RECIPES.length);
    const steak = recipes.find((r) => r.id === "recipe_beef_steak");
    expect(steak?.name.jaJP).toBe("ビーフステーキ");
    expect(steak?.ingredients[0]?.anySpecies).toBe("beef");
  });

  it("cooks a steak from the misuji lot and records the recipe on the transaction", async () => {
    const { services, definitionsById } = await setup();
    const lot = await services.inventory.addLot(misuji);
    const recipe = (await services.recipes.listAll()).find((r) => r.id === "recipe_beef_steak")!;

    const match = matchRecipe(recipe, {
      lots: await services.inventory.listLots(),
      definitionsById,
      today: "2026-10-04",
    });
    expect(match.readiness).toBe("ready");
    const plan = planCooking(match);
    expect(plan).toEqual([{ ingredientKey: "beef", lotId: lot.id, grams: 250 }]);

    const result = await services.recipes.cook(recipe.id, plan);
    expect(result).toEqual({ ok: true, transactionCount: 1 });

    const [stored] = await services.inventory.listLots();
    expect(stored?.remainingWeightG).toBe(1);
    const transactions = await services.inventory.listTransactions(lot.id);
    expect(transactions.at(-1)).toMatchObject({
      type: "consume",
      quantityG: 250,
      recipeId: "recipe_beef_steak",
    });
  });

  it("writes nothing when any deduction is invalid", async () => {
    const { services } = await setup();
    const beef = await services.inventory.addLot(misuji);
    const onion = await services.inventory.addLot({
      ...misuji,
      ingredientDefinitionId: "onion_raw",
      cut: undefined,
      form: undefined,
      originalWeightG: 50,
    });
    const result = await services.recipes.cook("recipe_gyudon", [
      { ingredientKey: "beef", lotId: beef.id, grams: 200 },
      { ingredientKey: "onion", lotId: onion.id, grams: 150 },
    ]);
    expect(result).toEqual({ ok: false, error: "exceeds_remaining", lotId: onion.id });
    const lots = await services.inventory.listLots();
    expect(lots.map((l) => l.remainingWeightG)).toEqual([251, 50]);
    expect(await services.inventory.listTransactions()).toHaveLength(2);
  });

  it("creates, edits, duplicates and deletes custom recipes", async () => {
    const { services } = await setup();
    const created = await services.recipes.createCustom(customRecipe);
    expect(created.isBuiltin).toBe(false);
    expect(created.dataQuality).toBe("user");

    await services.recipes.updateCustom(created.id, { ...customRecipe, servings: 2 });
    const copy = await services.recipes.duplicate("recipe_oyakodon", " (copy)");
    expect(copy.name.zhCN).toBe("亲子丼 (copy)");
    expect(copy.isBuiltin).toBe(false);

    const custom = (await services.recipes.listAll()).filter((r) => !r.isBuiltin);
    expect(custom.map((r) => r.servings)).toEqual([2, 2]);

    expect(await services.recipes.deleteCustom("recipe_oyakodon")).toEqual({
      ok: false,
      error: "builtin",
    });
    expect(await services.recipes.deleteCustom(created.id)).toEqual({ ok: true });
  });

  it("blocks deleting a custom ingredient that a custom recipe uses", async () => {
    const { services } = await setup();
    const sauce = await services.ingredients.createCustom({
      name: { zhCN: "自制酱" },
      aliases: [],
      category: "seasoning",
      nutritionPer100g: null,
      tags: [],
    });
    await services.recipes.createCustom({
      ...customRecipe,
      ingredients: [
        ...customRecipe.ingredients,
        { key: "sauce", ingredientId: sauce.id, grams: 10 },
      ],
    });
    expect(await services.ingredients.deleteCustom(sauce.id)).toEqual({
      ok: false,
      error: "in_recipes",
      recipeCount: 1,
    });
  });

  it("includes custom recipes and recipe links in the backup round trip", async () => {
    const { services } = await setup();
    const lot = await services.inventory.addLot(misuji);
    await services.recipes.cook("recipe_beef_steak", [
      { ingredientKey: "beef", lotId: lot.id, grams: 100 },
    ]);
    await services.recipes.createCustom(customRecipe);

    const exported = await services.backup.exportAll();
    expect(exported.data.recipes).toHaveLength(1);
    const parsed = parseBackup(serializeBackup(exported));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = (await setup()).services;
    const result = await target.backup.importReplacingAll(parsed.backup);
    expect(result).toMatchObject({ ok: true, counts: { recipes: 1, inventoryLots: 1 } });
    const recipes = await target.recipes.listAll();
    expect(recipes.filter((r) => !r.isBuiltin).map((r) => r.name.zhCN)).toEqual(["牛排盖饭"]);
    expect(recipes.filter((r) => r.isBuiltin)).toHaveLength(BUILTIN_RECIPES.length);
    const transactions = await target.inventory.listTransactions();
    expect(transactions.at(-1)?.recipeId).toBe("recipe_beef_steak");
  });
});
