import { newId } from "@/domain/common/ids";
import {
  consumeFromLot,
  type InventoryErrorCode,
  type OperationResult,
} from "@/domain/inventory/lotOperations";
import type { CookingAllocation } from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";
import type { Repositories } from "@/repositories";
import { clockNow, systemClock, type Clock } from "./clock";

/** Editable fields of a user-created recipe. */
export type RecipeInput = Pick<
  Recipe,
  | "name"
  | "description"
  | "servings"
  | "timeMinutes"
  | "tags"
  | "ingredients"
  | "seasonings"
  | "steps"
>;

export type DeleteRecipeResult = { ok: true } | { ok: false; error: "builtin" | "not_found" };

export type CookResult =
  | { ok: true; transactionCount: number }
  | { ok: false; error: "recipe_not_found" | "nothing_to_consume" }
  | { ok: false; error: "lot_not_found" | InventoryErrorCode; lotId: string };

export class RecipeService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  listAll(): Promise<Recipe[]> {
    return this.repos.recipes.listAll();
  }

  async createCustom(input: RecipeInput): Promise<Recipe> {
    const now = clockNow(this.clock);
    const recipe: Recipe = {
      ...input,
      id: newId(),
      dataQuality: "user",
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.recipes.save(recipe);
    return recipe;
  }

  async updateCustom(id: string, input: RecipeInput): Promise<Recipe> {
    const existing = await this.repos.recipes.getById(id);
    if (!existing) throw new Error(`Recipe not found: ${id}`);
    if (existing.isBuiltin) throw new Error("Built-in recipes cannot be edited");
    const updated: Recipe = { ...existing, ...input, updatedAt: clockNow(this.clock) };
    await this.repos.recipes.save(updated);
    return updated;
  }

  /** Copy any recipe (typically a built-in) into an editable user recipe. */
  async duplicate(id: string, nameSuffix: string): Promise<Recipe> {
    const source = await this.repos.recipes.getById(id);
    if (!source) throw new Error(`Recipe not found: ${id}`);
    const withSuffix = (value: string | undefined) =>
      value === undefined ? undefined : `${value}${nameSuffix}`;
    const name: Recipe["name"] = {
      zhCN: `${source.name.zhCN}${nameSuffix}`,
      enUS: withSuffix(source.name.enUS),
      jaJP: withSuffix(source.name.jaJP),
    };
    return this.createCustom({
      name,
      description: source.description,
      servings: source.servings,
      timeMinutes: source.timeMinutes,
      tags: source.tags,
      ingredients: source.ingredients,
      seasonings: source.seasonings,
      steps: source.steps,
    });
  }

  async deleteCustom(id: string): Promise<DeleteRecipeResult> {
    const existing = await this.repos.recipes.getById(id);
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.isBuiltin) return { ok: false, error: "builtin" };
    await this.repos.recipes.delete(id);
    return { ok: true };
  }

  /**
   * Deduct the given amounts from inventory after cooking a recipe. Every
   * deduction is validated before anything is written, so either all lots are
   * updated or none. Each transaction records the recipe ID.
   */
  async cook(recipeId: string, allocations: readonly CookingAllocation[]): Promise<CookResult> {
    const recipe = await this.repos.recipes.getById(recipeId);
    if (!recipe) return { ok: false, error: "recipe_not_found" };

    const perLot = new Map<string, { grams?: number; count?: number }>();
    for (const allocation of allocations) {
      const grams = allocation.grams ?? 0;
      const count = allocation.count ?? 0;
      if (grams <= 0 && count <= 0) continue;
      const entry = perLot.get(allocation.lotId) ?? {};
      if (grams > 0) entry.grams = (entry.grams ?? 0) + grams;
      if (count > 0) entry.count = (entry.count ?? 0) + count;
      perLot.set(allocation.lotId, entry);
    }
    if (perLot.size === 0) return { ok: false, error: "nothing_to_consume" };

    const now = clockNow(this.clock);
    const results: Extract<OperationResult, { ok: true }>[] = [];
    for (const [lotId, request] of perLot) {
      const lot = await this.repos.inventory.getLot(lotId);
      if (!lot) return { ok: false, error: "lot_not_found", lotId };
      const result = consumeFromLot(lot, request, { transactionId: newId(), now });
      if (!result.ok) return { ok: false, error: result.error, lotId };
      results.push(result);
    }

    for (const result of results) {
      await this.repos.inventory.addTransaction({ ...result.transaction, recipeId });
      await this.repos.inventory.saveLot(result.lot);
    }
    return { ok: true, transactionCount: results.length };
  }
}
