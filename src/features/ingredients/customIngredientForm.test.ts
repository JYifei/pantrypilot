import { describe, expect, it } from "vitest";
import {
  customFormToInput,
  customIngredientSchema,
  definitionToCustomForm,
  emptyCustomIngredientForm,
} from "./customIngredientForm";

describe("custom ingredient form", () => {
  it("requires a Chinese name", () => {
    const result = customIngredientSchema.safeParse(emptyCustomIngredientForm());
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.nameRequired");
  });

  it("stores blank nutrition as null (unknown), not zeros", () => {
    const values = { ...emptyCustomIngredientForm(), nameZh: "自制酱" };
    expect(customIngredientSchema.safeParse(values).success).toBe(true);
    expect(customFormToInput(values).nutritionPer100g).toBeNull();
  });

  it("requires all core macros once any nutrient is entered", () => {
    const values = emptyCustomIngredientForm();
    values.nameZh = "自制酱";
    values.nutrition.kcal = "120";
    const result = customIngredientSchema.safeParse(values);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual([
      "nutrition.proteinG",
      "nutrition.fatG",
      "nutrition.carbohydrateG",
    ]);
  });

  it("converts and round-trips a complete entry", () => {
    const values = emptyCustomIngredientForm();
    Object.assign(values, {
      nameZh: "腊肉",
      nameEn: "Cured pork",
      aliases: "larou，腊肉片",
      category: "meat",
      species: "pork",
      cut: "belly",
      refrigeratedDays: "30",
    });
    Object.assign(values.nutrition, {
      kcal: "400",
      proteinG: "20",
      fatG: "35",
      carbohydrateG: "0",
      sodiumMg: "1500",
    });
    const input = customFormToInput(values);
    expect(input).toMatchObject({
      name: { zhCN: "腊肉", enUS: "Cured pork" },
      aliases: ["larou", "腊肉片"],
      animalSpecies: "pork",
      anatomicalCut: "belly",
      nutritionPer100g: { kcal: 400, proteinG: 20, fatG: 35, carbohydrateG: 0, sodiumMg: 1500 },
      defaultShelfLife: { refrigeratedDays: 30 },
    });
    expect(input.nutritionPer100g?.fiberG).toBeUndefined();

    const back = definitionToCustomForm({
      ...input,
      id: "x",
      dataQuality: "user",
      isBuiltin: false,
    });
    expect(back.nutrition.carbohydrateG).toBe("0");
    expect(back.nutrition.fiberG).toBe("");
  });
});
