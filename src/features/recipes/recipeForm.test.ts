import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { BUILTIN_RECIPES } from "@/data/builtinRecipes";
import {
  emptyRecipeForm,
  formValuesToRecipeInput,
  mergeLocalized,
  recipeFormSchema,
  recipeToFormValues,
} from "./recipeForm";

const definitionsById = new Map(BUILTIN_INGREDIENTS.map((d) => [d.id, d]));

describe("recipe form", () => {
  it("requires a name and at least one required ingredient", () => {
    const values = emptyRecipeForm();
    values.ingredients = [
      { key: "i1", ingredientId: "onion_raw", grams: "100", optional: true, anySpecies: false },
    ];
    const result = recipeFormSchema.safeParse(values);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).sort()).toEqual([
      "validation.recipeNameRequired",
      "validation.requiredIngredient",
    ]);
  });

  it("rejects non-positive amounts and fractional servings", () => {
    const values = {
      ...emptyRecipeForm(),
      name: "x",
      servings: "1.5",
      ingredients: [
        { key: "i1", ingredientId: "onion_raw", grams: "0", optional: false, anySpecies: false },
      ],
    };
    const messages = recipeFormSchema.safeParse(values).error?.issues.map((i) => i.message);
    expect(messages).toEqual(["validation.positiveInteger", "validation.positiveNumber"]);
  });

  it("converts form values into a recipe", () => {
    const input = formValuesToRecipeInput(
      {
        name: " 牛排盖饭 ",
        description: "",
        servings: "1",
        timeMinutes: "20",
        ingredients: [
          {
            key: "i1",
            ingredientId: "beef_misuji_raw",
            grams: "150",
            optional: false,
            anySpecies: true,
          },
          { key: "i1", ingredientId: "onion_raw", grams: "50", optional: true, anySpecies: true },
        ],
        seasonings: "酱油，盐、 胡椒",
        steps: "煎牛排\n\n切片铺在米饭上\n",
      },
      "zh-CN",
      definitionsById,
    );
    expect(input).toEqual({
      name: { zhCN: "牛排盖饭" },
      description: undefined,
      servings: 1,
      timeMinutes: 20,
      tags: [],
      ingredients: [
        { key: "i1", ingredientId: "beef_misuji_raw", grams: 150, anySpecies: "beef" },
        // Duplicate key is renamed; anySpecies is ignored for non-meat.
        { key: "i2", ingredientId: "onion_raw", grams: 50, optional: true },
      ],
      seasonings: [{ zhCN: "酱油" }, { zhCN: "盐" }, { zhCN: "胡椒" }],
      steps: [{ zhCN: "煎牛排" }, { zhCN: "切片铺在米饭上" }],
    });
  });

  it("keeps translations, alternatives and counts of unchanged parts when editing", () => {
    const original = {
      ...BUILTIN_RECIPES.find((r) => r.id === "recipe_oyakodon")!,
      isBuiltin: false,
    };
    const values = recipeToFormValues(original, "en-US");
    values.steps = values.steps.replace("Slide over bowls of rice.", "Serve on rice.");
    const input = formValuesToRecipeInput(values, "en-US", definitionsById, original);

    expect(input.name).toEqual(original.name);
    expect(input.ingredients).toEqual(original.ingredients);
    expect(input.steps.slice(0, 3)).toEqual(original.steps.slice(0, 3));
    expect(input.steps[3]).toEqual({ zhCN: "Serve on rice.", enUS: "Serve on rice." });
  });

  it("mergeLocalized writes the current language slot", () => {
    expect(mergeLocalized(undefined, "Curry", "en-US")).toEqual({ zhCN: "Curry", enUS: "Curry" });
    expect(mergeLocalized(undefined, "カレー", "ja-JP")).toEqual({
      zhCN: "カレー",
      jaJP: "カレー",
    });
  });
});
