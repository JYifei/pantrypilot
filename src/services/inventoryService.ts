import { newId } from "@/domain/common/ids";
import type { StorageType } from "@/domain/ingredients/taxonomy";
import {
  adjustRemaining,
  changeStorage,
  consumeFromLot,
  createAddTransaction,
  discardRemaining,
  freezeLot,
  markOpened,
  type OperationResult,
  type QuantityRequest,
} from "@/domain/inventory/lotOperations";
import type { InventoryLot, InventoryTransaction } from "@/domain/inventory/types";
import { inventoryLotSchema } from "@/domain/schemas";
import type { Repositories } from "@/repositories";
import { clockNow, clockToday, systemClock, type Clock } from "./clock";
import { InvalidInputError, retryOnStaleWrite } from "./reliability";

/** Fields a user provides when adding or editing a lot. */
export type LotInput = Omit<InventoryLot, "id" | "createdAt" | "updatedAt">;

export class LotNotFoundError extends Error {
  constructor(id: string) {
    super(`Inventory lot not found: ${id}`);
    this.name = "LotNotFoundError";
  }
}

function assertValidLot(lot: InventoryLot): void {
  const parsed = inventoryLotSchema.safeParse(lot);
  if (!parsed.success) {
    throw new InvalidInputError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
}

/**
 * Application service for inventory use cases. Applies pure domain operations
 * and persists their results. A quantity change and its transaction are
 * committed together in one database transaction. Lot updates are guarded
 * against concurrent changes: the attempt is re-run on fresh data instead of
 * overwriting a change made in between.
 */
export class InventoryService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  listLots(): Promise<InventoryLot[]> {
    return this.repos.inventory.listLots();
  }

  listTransactions(lotId?: string): Promise<InventoryTransaction[]> {
    return this.repos.inventory.listTransactions(lotId);
  }

  async addLot(input: LotInput): Promise<InventoryLot> {
    const now = clockNow(this.clock);
    const lot: InventoryLot = {
      ...input,
      remainingWeightG: input.remainingWeightG ?? input.originalWeightG,
      originalWeightG: input.originalWeightG ?? input.remainingWeightG,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    assertValidLot(lot);
    await this.repos.atomic(async (tx) => {
      await tx.inventory.saveLot(lot);
      await tx.inventory.addTransaction(createAddTransaction(lot, { transactionId: newId(), now }));
    });
    return lot;
  }

  /** Edit lot details. A changed remaining quantity is recorded as an adjustment. */
  updateLot(id: string, input: LotInput): Promise<InventoryLot> {
    return retryOnStaleWrite(async () => {
      const existing = await this.requireLot(id);
      const now = clockNow(this.clock);
      const updated: InventoryLot = {
        ...input,
        id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      assertValidLot(updated);
      const weightChanged = updated.remainingWeightG !== existing.remainingWeightG;
      const countChanged = updated.count !== existing.count;
      await this.repos.atomic(async (tx) => {
        if (weightChanged || countChanged) {
          await tx.inventory.addTransaction({
            id: newId(),
            inventoryLotId: id,
            type: "adjust",
            quantityG: weightChanged
              ? (updated.remainingWeightG ?? 0) - (existing.remainingWeightG ?? 0)
              : undefined,
            quantityCount: countChanged ? (updated.count ?? 0) - (existing.count ?? 0) : undefined,
            createdAt: now,
            notes: "edit",
          });
        }
        await tx.inventory.updateLotIfUnchanged(updated, existing);
      });
      return updated;
    });
  }

  consume(id: string, request: QuantityRequest): Promise<OperationResult> {
    return this.applyOperation(id, (lot, context) => consumeFromLot(lot, request, context));
  }

  adjust(id: string, target: { remainingWeightG?: number; count?: number }) {
    return this.applyOperation(id, (lot, context) => adjustRemaining(lot, target, context));
  }

  discard(id: string): Promise<OperationResult> {
    return this.applyOperation(id, (lot, context) => discardRemaining(lot, context));
  }

  setOpened(id: string, opened: boolean): Promise<InventoryLot> {
    return this.updateDetails(id, async (lot) => markOpened(lot, opened, clockNow(this.clock)));
  }

  setStorage(id: string, storage: StorageType): Promise<InventoryLot> {
    if (storage === "frozen") return this.freeze(id);
    return this.updateDetails(id, async (lot) => changeStorage(lot, storage, clockNow(this.clock)));
  }

  /** Move to the freezer and extend the expiration date when a frozen shelf life is known. */
  freeze(id: string): Promise<InventoryLot> {
    return this.updateDetails(id, async (lot) => {
      const definition = await this.repos.ingredients.getById(lot.ingredientDefinitionId);
      return freezeLot(lot, definition ?? undefined, clockToday(this.clock), clockNow(this.clock));
    });
  }

  async deleteLot(id: string): Promise<void> {
    await this.repos.atomic((tx) => tx.inventory.deleteLot(id));
  }

  private async requireLot(id: string): Promise<InventoryLot> {
    const lot = await this.repos.inventory.getLot(id);
    if (!lot) throw new LotNotFoundError(id);
    return lot;
  }

  /** Metadata changes (no transaction), still guarded so they never undo a concurrent quantity change. */
  private updateDetails(
    id: string,
    change: (lot: InventoryLot) => Promise<InventoryLot>,
  ): Promise<InventoryLot> {
    return retryOnStaleWrite(async () => {
      const existing = await this.requireLot(id);
      const updated = await change(existing);
      await this.repos.inventory.updateLotIfUnchanged(updated, existing);
      return updated;
    });
  }

  private applyOperation(
    id: string,
    operation: (
      lot: InventoryLot,
      context: { transactionId: string; now: string },
    ) => OperationResult,
  ): Promise<OperationResult> {
    return retryOnStaleWrite(async () => {
      const lot = await this.requireLot(id);
      const result = operation(lot, { transactionId: newId(), now: clockNow(this.clock) });
      if (result.ok) {
        await this.repos.atomic(async (tx) => {
          await tx.inventory.addTransaction(result.transaction);
          await tx.inventory.updateLotIfUnchanged(result.lot, lot);
        });
      }
      return result;
    });
  }
}
