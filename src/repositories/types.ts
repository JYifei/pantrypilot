import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { InventoryLot, InventoryTransaction } from "@/domain/inventory/types";
import type { NutritionSource } from "@/domain/nutrition/types";
import type { AppSettings } from "@/domain/settings/settings";

/**
 * Persistence boundary. UI code never sees SQL; it talks to services, which
 * talk to these interfaces. A future sync backend or alternative store only
 * needs new implementations of these.
 */

export interface IngredientRepository {
  listAll(): Promise<IngredientDefinition[]>;
  getById(id: string): Promise<IngredientDefinition | null>;
  listUserCreated(): Promise<IngredientDefinition[]>;
  /** Insert or update a definition (built-in or user-created). */
  save(definition: IngredientDefinition): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAllUserCreated(): Promise<void>;
  listSources(): Promise<NutritionSource[]>;
  saveSource(source: NutritionSource, isBuiltin: boolean): Promise<void>;
}

export interface InventoryRepository {
  listLots(): Promise<InventoryLot[]>;
  getLot(id: string): Promise<InventoryLot | null>;
  /** Insert or update. */
  saveLot(lot: InventoryLot): Promise<void>;
  /** Deletes the lot and (via cascade) its transactions. */
  deleteLot(id: string): Promise<void>;
  countLotsForIngredient(ingredientDefinitionId: string): Promise<number>;
  addTransaction(transaction: InventoryTransaction): Promise<void>;
  listTransactions(inventoryLotId?: string): Promise<InventoryTransaction[]>;
  /** Remove every lot and transaction. Used by backup import. */
  deleteAll(): Promise<void>;
}

export interface SettingsRepository {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
  /** Internal key/value metadata (e.g. built-in dataset version). */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface Repositories {
  ingredients: IngredientRepository;
  inventory: InventoryRepository;
  settings: SettingsRepository;
}
