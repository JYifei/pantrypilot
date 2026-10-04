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
import type { Repositories } from "@/repositories";
import { clockNow, clockToday, systemClock, type Clock } from "./clock";

/** Fields a user provides when adding or editing a lot. */
export type LotInput = Omit<InventoryLot, "id" | "createdAt" | "updatedAt">;

export class LotNotFoundError extends Error {
  constructor(id: string) {
    super(`Inventory lot not found: ${id}`);
    this.name = "LotNotFoundError";
  }
}

/**
 * Application service for inventory use cases. Applies pure domain operations
 * and persists their results. Each change writes the transaction before the
 * lot update, so an interrupted write leaves an audit entry rather than a
 * silent quantity change.
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
    await this.repos.inventory.saveLot(lot);
    await this.repos.inventory.addTransaction(
      createAddTransaction(lot, { transactionId: newId(), now }),
    );
    return lot;
  }

  /** Edit lot details. A changed remaining quantity is recorded as an adjustment. */
  async updateLot(id: string, input: LotInput): Promise<InventoryLot> {
    const existing = await this.requireLot(id);
    const now = clockNow(this.clock);
    const updated: InventoryLot = {
      ...input,
      id,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    const weightChanged = updated.remainingWeightG !== existing.remainingWeightG;
    const countChanged = updated.count !== existing.count;
    if (weightChanged || countChanged) {
      await this.repos.inventory.addTransaction({
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
    await this.repos.inventory.saveLot(updated);
    return updated;
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

  async setOpened(id: string, opened: boolean): Promise<InventoryLot> {
    const lot = markOpened(await this.requireLot(id), opened, clockNow(this.clock));
    await this.repos.inventory.saveLot(lot);
    return lot;
  }

  async setStorage(id: string, storage: StorageType): Promise<InventoryLot> {
    if (storage === "frozen") return this.freeze(id);
    const lot = changeStorage(await this.requireLot(id), storage, clockNow(this.clock));
    await this.repos.inventory.saveLot(lot);
    return lot;
  }

  /** Move to the freezer and extend the expiration date when a frozen shelf life is known. */
  async freeze(id: string): Promise<InventoryLot> {
    const lot = await this.requireLot(id);
    const definition = await this.repos.ingredients.getById(lot.ingredientDefinitionId);
    const frozen = freezeLot(
      lot,
      definition ?? undefined,
      clockToday(this.clock),
      clockNow(this.clock),
    );
    await this.repos.inventory.saveLot(frozen);
    return frozen;
  }

  deleteLot(id: string): Promise<void> {
    return this.repos.inventory.deleteLot(id);
  }

  private async requireLot(id: string): Promise<InventoryLot> {
    const lot = await this.repos.inventory.getLot(id);
    if (!lot) throw new LotNotFoundError(id);
    return lot;
  }

  private async applyOperation(
    id: string,
    operation: (
      lot: InventoryLot,
      context: { transactionId: string; now: string },
    ) => OperationResult,
  ): Promise<OperationResult> {
    const lot = await this.requireLot(id);
    const result = operation(lot, { transactionId: newId(), now: clockNow(this.clock) });
    if (result.ok) {
      await this.repos.inventory.addTransaction(result.transaction);
      await this.repos.inventory.saveLot(result.lot);
    }
    return result;
  }
}
