import { StaleWriteError } from "@/db/database";
import { newId } from "@/domain/common/ids";
import { snapshotItem } from "@/domain/cooking/history";
import type { CookingSession } from "@/domain/cooking/types";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { InventoryLot } from "@/domain/inventory/types";
import {
  consumeFromLot,
  type InventoryErrorCode,
  type OperationResult,
} from "@/domain/inventory/lotOperations";
import type { CookingAllocation } from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";
import type { Repositories } from "@/repositories";
import { clockNow, clockToday, systemClock, type Clock } from "./clock";
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
  /**
   * `sessionId`: the cooking session saved with the deductions (absent only when
   * replaying an operation recorded before sessions existed).
   * `replayed`: this operation ID was already applied; nothing changed this time.
   */
  | { ok: true; transactionCount: number; sessionId?: string; replayed?: boolean }
  | {
      ok: false;
      /**
       * `operation_conflict`: the operation ID was already used for a different request.
       * `stale`: inventory kept changing while cooking was being saved.
       */
      error:
        | "recipe_not_found"
        | "nothing_to_consume"
        | "operation_conflict"
        | "stale"
        | "invalid_servings";
    }
  | { ok: false; error: "lot_not_found" | InventoryErrorCode; lotId: string };

/** What the cooking session records besides the deductions. */
export interface CookDetails {
  /** Servings prepared; defaults to the recipe's own servings. */
  servings?: number;
  note?: string;
}

const COOK_OPERATION = "cook";
export const MAX_COOK_NOTE_LENGTH = 500;

function isValidAmount(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

type Amount = { grams?: number; count?: number };

function addAmount(map: Map<string, Amount>, key: string, grams: number, count: number) {
  const entry = map.get(key) ?? {};
  if (grams > 0) entry.grams = (entry.grams ?? 0) + grams;
  if (count > 0) entry.count = (entry.count ?? 0) + count;
  map.set(key, entry);
}

export class RecipeService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  listAll(): Promise<Recipe[]> {
    return this.repos.recipes.listAll();
  }

  /** Every cooking session, newest first. */
  listSessions(): Promise<CookingSession[]> {
    return this.repos.sessions.list();
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
   * Deduct the given amounts from inventory after cooking a recipe and record
   * a cooking session: a snapshot of the recipe name, servings and what each
   * line took from each lot. Each transaction records the recipe and session.
   *
   * Amounts are validated against freshly read lots, then the session, all
   * deductions, their transactions and the operation record are committed in
   * one database transaction: all of them or none. If a lot changes between
   * reading and committing, the attempt starts over with fresh data.
   *
   * `operationId` makes the call safe to retry: the same ID with the same
   * request returns the first result without deducting or recording again.
   */
  async cook(
    recipeId: string,
    allocations: readonly CookingAllocation[],
    operationId?: string,
    details: CookDetails = {},
  ): Promise<CookResult> {
    const perLot = new Map<string, Amount>();
    const perLine = new Map<string, Amount>();
    const lineKey = (ingredientKey: string, lotId: string) =>
      JSON.stringify([ingredientKey, lotId]);
    for (const allocation of allocations) {
      if (!isValidAmount(allocation.grams) || !isValidAmount(allocation.count)) {
        return { ok: false, error: "invalid_quantity", lotId: allocation.lotId };
      }
      const grams = allocation.grams ?? 0;
      const count = allocation.count ?? 0;
      if (grams === 0 && count === 0) continue;
      addAmount(perLot, allocation.lotId, grams, count);
      addAmount(perLine, lineKey(allocation.ingredientKey, allocation.lotId), grams, count);
    }
    if (
      details.servings !== undefined &&
      !(Number.isInteger(details.servings) && details.servings > 0)
    ) {
      return { ok: false, error: "invalid_servings" };
    }
    const note = details.note?.trim().slice(0, MAX_COOK_NOTE_LENGTH) || undefined;
    const lines = [...perLine.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, amount]) => {
        const [ingredientKey, lotId] = JSON.parse(key) as [string, string];
        return { ingredientKey, lotId, grams: amount.grams ?? null, count: amount.count ?? null };
      });
    const requestJson = JSON.stringify({
      recipeId,
      servings: details.servings ?? null,
      note: note ?? null,
      lines,
    });

    if (operationId) {
      const previous = await this.previousCookResult(operationId, requestJson);
      if (previous) return previous;
    }
    const recipe = await this.repos.recipes.getById(recipeId);
    if (!recipe) return { ok: false, error: "recipe_not_found" };
    if (perLot.size === 0) return { ok: false, error: "nothing_to_consume" };
    const sessionId = newId();

    try {
      return await retryOnStaleWrite(async (): Promise<CookResult> => {
        const now = clockNow(this.clock);
        const changes: { before: InventoryLot; result: Extract<OperationResult, { ok: true }> }[] =
          [];
        const lots = new Map<string, InventoryLot>();
        for (const [lotId, request] of perLot) {
          const lot = await this.repos.inventory.getLot(lotId);
          if (!lot) return { ok: false, error: "lot_not_found", lotId };
          const result = consumeFromLot(lot, request, { transactionId: newId(), now });
          if (!result.ok) return { ok: false, error: result.error, lotId };
          changes.push({ before: lot, result });
          lots.set(lotId, lot);
        }
        const definitions = new Map<string, IngredientDefinition | undefined>();
        for (const lot of lots.values()) {
          const id = lot.ingredientDefinitionId;
          if (!definitions.has(id))
            definitions.set(id, (await this.repos.ingredients.getById(id)) ?? undefined);
        }
        const session: CookingSession = {
          id: sessionId,
          cookedAt: now,
          localDate: clockToday(this.clock),
          recipeId,
          recipeName: recipe.name,
          servings: details.servings ?? recipe.servings,
          items: lines.map((line) => {
            const lot = lots.get(line.lotId)!;
            return snapshotItem(
              line.ingredientKey,
              lot,
              definitions.get(lot.ingredientDefinitionId),
              {
                grams: line.grams ?? undefined,
                count: line.grams === null ? (line.count ?? 0) : undefined,
              },
            );
          }),
        };
        if (note) session.note = note;
        const transactionCount = changes.length;
        await this.repos.atomic(async (tx) => {
          if (operationId) {
            await tx.operations.record({
              id: operationId,
              kind: COOK_OPERATION,
              requestJson,
              resultJson: JSON.stringify({ transactionCount, sessionId }),
              createdAt: now,
            });
          }
          await tx.sessions.insert(session);
          for (const { before, result } of changes) {
            await tx.inventory.addTransaction({
              ...result.transaction,
              recipeId,
              cookingSessionId: sessionId,
            });
            await tx.inventory.updateLotIfUnchanged(result.lot, before);
          }
        });
        return { ok: true, transactionCount, sessionId };
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
    const stored = JSON.parse(previous.resultJson) as {
      transactionCount: number;
      sessionId?: string;
    };
    return stored.sessionId
      ? {
          ok: true,
          transactionCount: stored.transactionCount,
          sessionId: stored.sessionId,
          replayed: true,
        }
      : { ok: true, transactionCount: stored.transactionCount, replayed: true };
  }
}
