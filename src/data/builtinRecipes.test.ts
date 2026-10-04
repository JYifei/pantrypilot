import { describe, expect, it } from "vitest";
import { referencedIngredientIds } from "@/domain/recipes/matching";
import { recipeSchema } from "@/domain/schemas";
import { BUILTIN_INGREDIENTS } from "./builtinIngredients";
import { BUILTIN_RECIPES } from "./builtinRecipes";

const ingredientIds = new Set(BUILTIN_INGREDIENTS.map((d) => d.id));

describe("built-in recipes", () => {
  it("have unique, stable snake_case IDs", () => {
    const ids = BUILTIN_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^recipe_[a-z0-9_]+$/);
  });

  it.each(BUILTIN_RECIPES.map((r) => [r.id, r] as const))("%s is valid", (_id, recipe) => {
    expect(recipeSchema.safeParse(recipe).success).toBe(true);
    expect(recipe.isBuiltin).toBe(true);
    expect(recipe.dataQuality).toBe("demo");
    for (const id of referencedIngredientIds(recipe)) expect(ingredientIds, id).toContain(id);
    const keys = recipe.ingredients.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(recipe.ingredients.some((i) => !i.optional)).toBe(true);
    expect(recipe.steps.length).toBeGreaterThan(0);
    for (const text of [recipe.name, ...recipe.steps, ...recipe.seasonings]) {
      expect(text.zhCN && text.enUS && text.jaJP).toBeTruthy();
    }
  });
});
