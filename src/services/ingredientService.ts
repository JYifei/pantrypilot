import { newId } from "@/domain/common/ids";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { NutritionSource } from "@/domain/nutrition/types";
import { referencedIngredientIds } from "@/domain/recipes/matching";
import type { Repositories } from "@/repositories";
import { clockNow, systemClock, type Clock } from "./clock";

/** Editable fields of a user-created ingredient. */
export type CustomIngredientInput = Pick<
  IngredientDefinition,
  | "name"
  | "aliases"
  | "category"
  | "animalSpecies"
  | "anatomicalCut"
  | "nutritionPer100g"
  | "tags"
  | "defaultShelfLife"
  | "defaultEdibleRatio"
  | "defaultUnitConversions"
>;

export type DeleteIngredientResult =
  | { ok: true }
  | { ok: false; error: "builtin" | "not_found" }
  | { ok: false; error: "in_use"; lotCount: number }
  | { ok: false; error: "in_recipes"; recipeCount: number };

export class IngredientService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  listAll(): Promise<IngredientDefinition[]> {
    return this.repos.ingredients.listAll();
  }

  listSources(): Promise<NutritionSource[]> {
    return this.repos.ingredients.listSources();
  }

  async createCustom(input: CustomIngredientInput): Promise<IngredientDefinition> {
    const now = clockNow(this.clock);
    const definition: IngredientDefinition = {
      ...input,
      id: newId(),
      dataQuality: "user",
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.ingredients.save(definition);
    return definition;
  }

  async updateCustom(id: string, input: CustomIngredientInput): Promise<IngredientDefinition> {
    const existing = await this.repos.ingredients.getById(id);
    if (!existing) throw new Error(`Ingredient not found: ${id}`);
    if (existing.isBuiltin) throw new Error("Built-in ingredients cannot be edited");
    const updated: IngredientDefinition = {
      ...existing,
      ...input,
      updatedAt: clockNow(this.clock),
    };
    await this.repos.ingredients.save(updated);
    return updated;
  }

  /** Delete a user-created ingredient that no inventory lot or recipe references. */
  async deleteCustom(id: string): Promise<DeleteIngredientResult> {
    const existing = await this.repos.ingredients.getById(id);
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.isBuiltin) return { ok: false, error: "builtin" };
    const lotCount = await this.repos.inventory.countLotsForIngredient(id);
    if (lotCount > 0) return { ok: false, error: "in_use", lotCount };
    const recipes = await this.repos.recipes.listUserCreated();
    const recipeCount = recipes.filter((r) => referencedIngredientIds(r).includes(id)).length;
    if (recipeCount > 0) return { ok: false, error: "in_recipes", recipeCount };
    await this.repos.ingredients.delete(id);
    return { ok: true };
  }
}
