import { StaleWriteError } from "@/db/database";
import { newId } from "@/domain/common/ids";
import type { InventoryLot } from "@/domain/inventory/types";
import {
  consumeFromLot,
  type InventoryErrorCode,
  type OperationResult,
} from "@/domain/inventory/lotOperations";
import type { CookingAllocation } from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";
import type { Repositories } from "@/repositories";
import { clockNow, systemClock, type Clock } from "./clock";
import { retryOnStaleWrite } from "./reliability";

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
  /** `replayed`: this operation ID was already applied; nothing changed this time. */
  | { ok: true; transactionCount: number; replayed?: boolean }
  | {
      ok: false;
      /**
       * `operation_conflict`: the operation ID was already used for a different request.
       * `stale`: inventory kept changing while cooking was being saved.
       */
      error: "recipe_not_found" | "nothing_to_consume" | "operation_conflict" | "stale";
    }
  | { ok: false; error: "lot_not_found" | InventoryErrorCode; lotId: string };

const COOK_OPERATION = "cook";

function isValidAmount(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

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
   * Deduct the given amounts from inventory after cooking a recipe. Each
   * transaction records the recipe ID.
   *
   * Amounts are validated against freshly read lots, then all deductions,
   * their transactions and the operation record are committed in one database
   * transaction: either every lot is updated or none. If a lot changes between
   * reading and committing, the attempt starts over with fresh data.
   *
   * `operationId` makes the call safe to retry: the same ID with the same
   * request returns the first result without deducting again.
   */
  async cook(
    recipeId: string,
    allocations: readonly CookingAllocation[],
    operationId?: string,
  ): Promise<CookResult> {
    const perLot = new Map<string, { grams?: number; count?: number }>();
    for (const allocation of allocations) {
      if (!isValidAmount(allocation.grams) || !isValidAmount(allocation.count)) {
        return { ok: false, error: "invalid_quantity", lotId: allocation.lotId };
      }
      const grams = allocation.grams ?? 0;
      const count = allocation.count ?? 0;
      if (grams === 0 && count === 0) continue;
      const entry = perLot.get(allocation.lotId) ?? {};
      if (grams > 0) entry.grams = (entry.grams ?? 0) + grams;
      if (count > 0) entry.count = (entry.count ?? 0) + count;
      perLot.set(allocation.lotId, entry);
    }
    const requestJson = JSON.stringify({
      recipeId,
      lots: [...perLot.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([lotId, amount]) => ({
          lotId,
          grams: amount.grams ?? null,
          count: amount.count ?? null,
        })),
    });

    if (operationId) {
      const previous = await this.previousCookResult(operationId, requestJson);
      if (previous) return previous;
    }
    const recipe = await this.repos.recipes.getById(recipeId);
    if (!recipe) return { ok: false, error: "recipe_not_found" };
    if (perLot.size === 0) return { ok: false, error: "nothing_to_consume" };

    try {
      return await retryOnStaleWrite(async (): Promise<CookResult> => {
        const now = clockNow(this.clock);
        const changes: { before: InventoryLot; result: Extract<OperationResult, { ok: true }> }[] =
          [];
        for (const [lotId, request] of perLot) {
          const lot = await this.repos.inventory.getLot(lotId);
          if (!lot) return { ok: false, error: "lot_not_found", lotId };
          const result = consumeFromLot(lot, request, { transactionId: newId(), now });
          if (!result.ok) return { ok: false, error: result.error, lotId };
          changes.push({ before: lot, result });
        }
        const transactionCount = changes.length;
        await this.repos.atomic(async (tx) => {
          if (operationId) {
            await tx.operations.record({
              id: operationId,
              kind: COOK_OPERATION,
              requestJson,
              resultJson: JSON.stringify({ transactionCount }),
              createdAt: now,
            });
          }
          for (const { before, result } of changes) {
            await tx.inventory.addTransaction({ ...result.transaction, recipeId });
            await tx.inventory.updateLotIfUnchanged(result.lot, before);
          }
        });
        return { ok: true, transactionCount };
      });
    } catch (error) {
      // A concurrent call with the same operation ID may have committed first.
      if (operationId) {
        const previous = await this.previousCookResult(operationId, requestJson);
        if (previous) return previous;
      }
      if (error instanceof StaleWriteError) return { ok: false, error: "stale" };
      throw error;
    }
  }

  private async previousCookResult(
    operationId: string,
    requestJson: string,
  ): Promise<CookResult | null> {
    const previous = await this.repos.operations.get(operationId);
    if (!previous) return null;
    if (previous.kind !== COOK_OPERATION || previous.requestJson !== requestJson) {
      return { ok: false, error: "operation_conflict" };
    }
    const stored = JSON.parse(previous.resultJson) as { transactionCount: number };
    return { ok: true, transactionCount: stored.transactionCount, replayed: true };
  }
}
