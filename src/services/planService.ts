import { newId } from "@/domain/common/ids";
import { buyOptions } from "@/domain/planning/shoppingList";
import {
  MAX_PLAN_SERVINGS,
  MAX_SHOPPING_TEXT_LENGTH,
  planItemId,
  type PlanEntry,
  type ShoppingItem,
} from "@/domain/planning/types";
import type { Repositories } from "@/repositories";
import { clockNow, systemClock, type Clock } from "./clock";

export type PlanError =
  | "recipe_not_found"
  | "entry_not_found"
  | "item_not_found"
  | "invalid_servings"
  | "invalid_choice"
  | "invalid_amount"
  | "invalid_text";

export type PlanResult = { ok: true } | { ok: false; error: PlanError };
export type AddToPlanResult =
  { ok: true; entry: PlanEntry; alreadyPlanned: boolean } | { ok: false; error: PlanError };

/** Edits to the stored state of a plan gap. `null` clears a value. */
export interface PlanItemPatch {
  bought?: boolean;
  plannedGrams?: number | null;
  note?: string | null;
}

export interface ManualItemPatch {
  label?: string;
  note?: string | null;
  bought?: boolean;
}

const isValidServings = (servings: number) =>
  Number.isInteger(servings) && servings > 0 && servings <= MAX_PLAN_SERVINGS;

/** Trimmed text, `undefined` when empty, `null` when too long. */
function cleanText(text: string | null | undefined): string | undefined | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return undefined;
  return trimmed.length > MAX_SHOPPING_TEXT_LENGTH ? null : trimmed;
}

/**
 * The meal plan and its shopping list. Nothing here reads or changes
 * inventory: gaps are computed in the UI from the plan and current stock, and
 * stock only changes when the user cooks or adds a lot.
 */
export class PlanService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  listEntries(): Promise<PlanEntry[]> {
    return this.repos.plan.listEntries();
  }

  listItems(): Promise<ShoppingItem[]> {
    return this.repos.plan.listItems();
  }

  /** Add a dish to the end of the plan. A recipe already planned is left as it is. */
  async addRecipe(recipeId: string, servings: number): Promise<AddToPlanResult> {
    if (!isValidServings(servings)) return { ok: false, error: "invalid_servings" };
    const recipe = await this.repos.recipes.getById(recipeId);
    if (!recipe) return { ok: false, error: "recipe_not_found" };
    const entries = await this.repos.plan.listEntries();
    const existing = entries.find((e) => e.recipeId === recipeId);
    if (existing) return { ok: true, entry: existing, alreadyPlanned: true };
    const now = clockNow(this.clock);
    const entry: PlanEntry = {
      id: newId(),
      recipeId,
      servings,
      position: entries.reduce((max, e) => Math.max(max, e.position + 1), 0),
      choices: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.plan.saveEntry(entry);
    return { ok: true, entry, alreadyPlanned: false };
  }

  async setServings(entryId: string, servings: number): Promise<PlanResult> {
    if (!isValidServings(servings)) return { ok: false, error: "invalid_servings" };
    return this.updateEntry(entryId, (entry) => ({ ...entry, servings }));
  }

  /** Choose which ingredient to buy for a recipe line; `null` goes back to the recipe's own. */
  async setChoice(
    entryId: string,
    ingredientKey: string,
    ingredientId: string | null,
  ): Promise<PlanResult> {
    const entry = await this.findEntry(entryId);
    if (!entry) return { ok: false, error: "entry_not_found" };
    const recipe = await this.repos.recipes.getById(entry.recipeId);
    const line = recipe?.ingredients.find((i) => i.key === ingredientKey);
    if (!line) return { ok: false, error: "invalid_choice" };
    const choices = { ...entry.choices };
    if (ingredientId === null || ingredientId === line.ingredientId) {
      delete choices[ingredientKey];
    } else if (buyOptions(line).some((o) => o.ingredientId === ingredientId)) {
      choices[ingredientKey] = ingredientId;
    } else {
      return { ok: false, error: "invalid_choice" };
    }
    return this.updateEntry(entryId, (current) => ({ ...current, choices }));
  }

  /** Remove a dish. When the plan becomes empty, the state of its gaps goes too. */
  async removeEntry(entryId: string): Promise<PlanResult> {
    const entries = await this.repos.plan.listEntries();
    if (!entries.some((e) => e.id === entryId)) return { ok: false, error: "entry_not_found" };
    await this.repos.atomic(async (tx) => {
      await tx.plan.deleteEntry(entryId);
      if (entries.length === 1) await tx.plan.deletePlanItems();
    });
    return { ok: true };
  }

  /** Empty the plan and forget the state of its gaps. Manual items stay. */
  async clearPlan(): Promise<void> {
    const entries = await this.repos.plan.listEntries();
    await this.repos.atomic(async (tx) => {
      for (const entry of entries) await tx.plan.deleteEntry(entry.id);
      await tx.plan.deletePlanItems();
    });
  }

  /** Tick, amount or note for the gap of one ingredient. */
  async updatePlanItem(ingredientId: string, patch: PlanItemPatch): Promise<PlanResult> {
    const id = planItemId(ingredientId);
    const now = clockNow(this.clock);
    const existing = (await this.repos.plan.listItems()).find((i) => i.id === id);
    const item: ShoppingItem = existing
      ? { ...existing, updatedAt: now }
      : {
          id,
          source: "plan",
          ingredientDefinitionId: ingredientId,
          bought: false,
          createdAt: now,
          updatedAt: now,
        };
    if (patch.bought !== undefined) item.bought = patch.bought;
    if (patch.plannedGrams !== undefined) {
      if (patch.plannedGrams === null) delete item.plannedGrams;
      else if (Number.isFinite(patch.plannedGrams) && patch.plannedGrams > 0) {
        item.plannedGrams = Math.round(patch.plannedGrams * 10) / 10;
      } else return { ok: false, error: "invalid_amount" };
    }
    if (patch.note !== undefined) {
      const note = cleanText(patch.note);
      if (note === null) return { ok: false, error: "invalid_text" };
      if (note === undefined) delete item.note;
      else item.note = note;
    }
    await this.repos.plan.saveItem(item);
    return { ok: true };
  }

  async addManualItem(label: string, note?: string): Promise<PlanResult> {
    const cleanLabel = cleanText(label);
    const cleanNote = cleanText(note);
    if (!cleanLabel || cleanNote === null) return { ok: false, error: "invalid_text" };
    const now = clockNow(this.clock);
    const item: ShoppingItem = {
      id: newId(),
      source: "manual",
      label: cleanLabel,
      bought: false,
      createdAt: now,
      updatedAt: now,
    };
    if (cleanNote) item.note = cleanNote;
    await this.repos.plan.saveItem(item);
    return { ok: true };
  }

  async updateManualItem(id: string, patch: ManualItemPatch): Promise<PlanResult> {
    const existing = (await this.repos.plan.listItems()).find((i) => i.id === id);
    if (!existing || existing.source !== "manual") return { ok: false, error: "item_not_found" };
    const item: ShoppingItem = { ...existing, updatedAt: clockNow(this.clock) };
    if (patch.label !== undefined) {
      const label = cleanText(patch.label);
      if (!label) return { ok: false, error: "invalid_text" };
      item.label = label;
    }
    if (patch.note !== undefined) {
      const note = cleanText(patch.note);
      if (note === null) return { ok: false, error: "invalid_text" };
      if (note === undefined) delete item.note;
      else item.note = note;
    }
    if (patch.bought !== undefined) item.bought = patch.bought;
    await this.repos.plan.saveItem(item);
    return { ok: true };
  }

  removeItem(id: string): Promise<void> {
    return this.repos.plan.deleteItem(id);
  }

  /** Forget the stored state of a gap, e.g. after its purchase was entered as stock. */
  resetPlanItem(ingredientId: string): Promise<void> {
    return this.repos.plan.deleteItem(planItemId(ingredientId));
  }

  /** Remove ticked items. Stock is not touched. */
  clearBought(): Promise<void> {
    return this.repos.plan.deleteBoughtItems();
  }

  private async findEntry(entryId: string): Promise<PlanEntry | undefined> {
    return (await this.repos.plan.listEntries()).find((e) => e.id === entryId);
  }

  private async updateEntry(
    entryId: string,
    change: (entry: PlanEntry) => PlanEntry,
  ): Promise<PlanResult> {
    const entry = await this.findEntry(entryId);
    if (!entry) return { ok: false, error: "entry_not_found" };
    await this.repos.plan.saveEntry({ ...change(entry), updatedAt: clockNow(this.clock) });
    return { ok: true };
  }
}
