import { addDays, type IsoDate, type IsoDateTime } from "../common/dates";
import type { StorageType } from "../ingredients/taxonomy";
import type { IngredientDefinition } from "../ingredients/types";
import type { InventoryLot, InventoryTransaction } from "./types";
import { convertToGrams, type GramAmount } from "./units";

/**
 * Pure inventory operations. They never mutate their input and never touch
 * storage; services persist the returned lot and transaction.
 */

export interface OperationContext {
  /** ID for the transaction this operation creates. */
  transactionId: string;
  now: IsoDateTime;
}

export type InventoryErrorCode =
  "invalid_quantity" | "exceeds_remaining" | "weight_not_tracked" | "count_not_tracked";

export type OperationResult =
  | { ok: true; lot: InventoryLot; transaction: InventoryTransaction }
  | { ok: false; error: InventoryErrorCode };

export function tracksWeight(lot: InventoryLot): boolean {
  return typeof lot.remainingWeightG === "number";
}

export function tracksCount(lot: InventoryLot): boolean {
  return typeof lot.count === "number";
}

/** A lot is depleted when every tracked quantity has reached zero. */
export function isLotDepleted(lot: InventoryLot): boolean {
  if (tracksWeight(lot)) return lot.remainingWeightG! <= 0;
  if (tracksCount(lot)) return lot.count! <= 0;
  return false;
}

/**
 * Remaining weight in grams: exact when weight is tracked, otherwise estimated
 * from count × unit conversion. Null when neither is possible.
 */
export function getRemainingGrams(
  lot: InventoryLot,
  definition?: Pick<IngredientDefinition, "defaultUnitConversions">,
): GramAmount | null {
  if (tracksWeight(lot)) {
    return { grams: lot.remainingWeightG!, isEstimate: false, confidence: "exact" };
  }
  if (tracksCount(lot) && lot.unit) {
    return convertToGrams(lot.count!, lot.unit, definition?.defaultUnitConversions);
  }
  return null;
}

function isPositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Floating-point tolerant subtraction, so 0.3 - 0.1 - 0.2 does not leave -5e-17. */
function subtract(a: number, b: number): number {
  const result = Math.round((a - b) * 1e6) / 1e6;
  return result < 0 ? 0 : result;
}

export interface QuantityRequest {
  grams?: number;
  count?: number;
}

/**
 * Remove a consumed amount from a lot. Rejects amounts larger than what is
 * left — inventory can never go negative. Use `discardRemaining` to zero a lot.
 *
 * Example: 372 g remaining, consume 180 g → 192 g remaining.
 */
export function consumeFromLot(
  lot: InventoryLot,
  request: QuantityRequest,
  context: OperationContext,
): OperationResult {
  const { grams, count } = request;
  const hasGrams = grams !== undefined;
  const hasCount = count !== undefined;
  if (!hasGrams && !hasCount) return { ok: false, error: "invalid_quantity" };
  if ((hasGrams && !isPositive(grams)) || (hasCount && !isPositive(count))) {
    return { ok: false, error: "invalid_quantity" };
  }
  if (hasGrams && !tracksWeight(lot)) return { ok: false, error: "weight_not_tracked" };
  if (hasCount && !tracksCount(lot)) return { ok: false, error: "count_not_tracked" };
  if (hasGrams && grams! > lot.remainingWeightG! + 1e-9) {
    return { ok: false, error: "exceeds_remaining" };
  }
  if (hasCount && count! > lot.count! + 1e-9) return { ok: false, error: "exceeds_remaining" };

  const updated: InventoryLot = { ...lot, updatedAt: context.now };
  if (hasGrams) updated.remainingWeightG = subtract(lot.remainingWeightG!, grams!);
  if (hasCount) updated.count = subtract(lot.count!, count!);

  return {
    ok: true,
    lot: updated,
    transaction: {
      id: context.transactionId,
      inventoryLotId: lot.id,
      type: "consume",
      quantityG: hasGrams ? grams : undefined,
      quantityCount: hasCount ? count : undefined,
      createdAt: context.now,
    },
  };
}

/**
 * Set the remaining quantity directly (e.g. after weighing). The transaction
 * records the signed difference. Values may not be negative.
 */
export function adjustRemaining(
  lot: InventoryLot,
  target: { remainingWeightG?: number; count?: number },
  context: OperationContext,
): OperationResult {
  const { remainingWeightG, count } = target;
  if (remainingWeightG === undefined && count === undefined) {
    return { ok: false, error: "invalid_quantity" };
  }
  for (const value of [remainingWeightG, count]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      return { ok: false, error: "invalid_quantity" };
    }
  }
  const updated: InventoryLot = { ...lot, updatedAt: context.now };
  let deltaG: number | undefined;
  let deltaCount: number | undefined;
  if (remainingWeightG !== undefined) {
    deltaG = remainingWeightG - (lot.remainingWeightG ?? 0);
    updated.remainingWeightG = remainingWeightG;
    if (updated.originalWeightG === undefined) updated.originalWeightG = remainingWeightG;
  }
  if (count !== undefined) {
    deltaCount = count - (lot.count ?? 0);
    updated.count = count;
  }
  return {
    ok: true,
    lot: updated,
    transaction: {
      id: context.transactionId,
      inventoryLotId: lot.id,
      type: "adjust",
      quantityG: deltaG,
      quantityCount: deltaCount,
      createdAt: context.now,
    },
  };
}

/** Throw away whatever is left (spoiled, forgotten…). */
export function discardRemaining(lot: InventoryLot, context: OperationContext): OperationResult {
  const updated: InventoryLot = { ...lot, updatedAt: context.now };
  if (tracksWeight(lot)) updated.remainingWeightG = 0;
  if (tracksCount(lot)) updated.count = 0;
  return {
    ok: true,
    lot: updated,
    transaction: {
      id: context.transactionId,
      inventoryLotId: lot.id,
      type: "discard",
      quantityG: lot.remainingWeightG,
      quantityCount: lot.count,
      createdAt: context.now,
    },
  };
}

/** The "add" event recorded when a lot enters the inventory. */
export function createAddTransaction(
  lot: InventoryLot,
  context: OperationContext,
): InventoryTransaction {
  return {
    id: context.transactionId,
    inventoryLotId: lot.id,
    type: "add",
    quantityG: lot.remainingWeightG,
    quantityCount: lot.count,
    createdAt: context.now,
  };
}

export function changeStorage(
  lot: InventoryLot,
  storage: StorageType,
  now: IsoDateTime,
): InventoryLot {
  return { ...lot, storage, updatedAt: now };
}

/**
 * Move a lot to the freezer. When the definition has a frozen shelf-life
 * estimate, the expiration date is moved to today + that many days (never
 * earlier than the current date on the label).
 */
export function freezeLot(
  lot: InventoryLot,
  definition: Pick<IngredientDefinition, "defaultShelfLife"> | undefined,
  today: IsoDate,
  now: IsoDateTime,
): InventoryLot {
  const updated: InventoryLot = { ...lot, storage: "frozen", updatedAt: now };
  const frozenDays = definition?.defaultShelfLife?.frozenDays;
  if (frozenDays !== undefined) {
    const frozenUntil = addDays(today, frozenDays);
    if (!lot.expirationDate || frozenUntil > lot.expirationDate) {
      updated.expirationDate = frozenUntil;
    }
  }
  return updated;
}

export function markOpened(lot: InventoryLot, opened: boolean, now: IsoDateTime): InventoryLot {
  return { ...lot, opened, updatedAt: now };
}

/** Suggested expiration date for a new lot, from the definition's shelf-life estimate. */
export function suggestExpirationDate(
  definition: Pick<IngredientDefinition, "defaultShelfLife"> | undefined,
  storage: StorageType,
  purchaseDate: IsoDate,
): IsoDate | undefined {
  const shelfLife = definition?.defaultShelfLife;
  if (!shelfLife) return undefined;
  const days =
    storage === "frozen"
      ? shelfLife.frozenDays
      : storage === "refrigerated"
        ? shelfLife.refrigeratedDays
        : undefined;
  return days === undefined ? undefined : addDays(purchaseDate, days);
}
