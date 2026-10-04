import { describe, expect, it } from "vitest";
import { ingredientDefinitionSchema } from "@/domain/schemas";
import { BUILTIN_INGREDIENTS } from "./builtinIngredients";
import { BUILTIN_NUTRITION_SOURCES } from "./nutritionSources";

const REQUIRED_IDS = [
  "beef_misuji_raw",
  "beef_sirloin_raw",
  "pork_belly_raw",
  "pork_loin_raw",
  "chicken_thigh_skin_on_raw",
  "chicken_breast_skinless_raw",
  "salmon_atlantic_raw",
  "mackerel_raw",
  "egg_whole",
  "tofu_momen",
  "rice_cooked",
  "udon_cooked",
  "komatsuna_raw",
  "green_pepper_raw",
  "onion_raw",
  "shiitake_raw",
  "shimeji_raw",
];

describe("built-in ingredient dataset", () => {
  it("contains the required sample definitions", () => {
    const ids = new Set(BUILTIN_INGREDIENTS.map((d) => d.id));
    for (const id of REQUIRED_IDS) expect(ids, id).toContain(id);
  });

  it("uses unique, language-independent snake_case IDs", () => {
    const ids = BUILTIN_INGREDIENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  it("validates against the domain schema", () => {
    for (const definition of BUILTIN_INGREDIENTS) {
      const result = ingredientDefinitionSchema.safeParse(definition);
      expect(result.success, `${definition.id}: ${result.error?.message}`).toBe(true);
    }
  });

  it("names every ingredient in all three languages", () => {
    for (const d of BUILTIN_INGREDIENTS) {
      expect(d.name.zhCN, d.id).toBeTruthy();
      expect(d.name.enUS, d.id).toBeTruthy();
      expect(d.name.jaJP, d.id).toBeTruthy();
    }
  });

  it("marks all built-in nutrition as demo data with provenance", () => {
    const sourceIds = new Set(BUILTIN_NUTRITION_SOURCES.map((s) => s.id));
    for (const d of BUILTIN_INGREDIENTS) {
      expect(d.dataQuality).toBe("demo");
      if (d.nutritionPer100g) expect(sourceIds.has(d.sourceId ?? "")).toBe(true);
    }
  });
});
