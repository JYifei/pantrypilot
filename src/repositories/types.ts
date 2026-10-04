import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { InventoryLot, InventoryTransaction } from "@/domain/inventory/types";
import type { NutritionSource } from "@/domain/nutrition/types";
import type { Recipe } from "@/domain/recipes/types";
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
  /** Insert or overwrite without checks. For new lots and backup import. */
  saveLot(lot: InventoryLot): Promise<void>;
  /**
   * Overwrite an existing lot only if its stored quantities and `updatedAt`
   * still equal `expected` (the version that was read). Otherwise the write
   * fails with StaleWriteError and, inside `atomic`, nothing is committed.
   */
  updateLotIfUnchanged(lot: InventoryLot, expected: InventoryLot): Promise<void>;
  /** Deletes the lot and its transactions. */
  deleteLot(id: string): Promise<void>;
  countLotsForIngredient(ingredientDefinitionId: string): Promise<number>;
  addTransaction(transaction: InventoryTransaction): Promise<void>;
  listTransactions(inventoryLotId?: string): Promise<InventoryTransaction[]>;
  /** Remove every lot and transaction. Used by backup import. */
  deleteAll(): Promise<void>;
}

export interface RecipeRepository {
  listAll(): Promise<Recipe[]>;
  getById(id: string): Promise<Recipe | null>;
  listUserCreated(): Promise<Recipe[]>;
  /** Insert or update a recipe (built-in or user-created). */
  save(recipe: Recipe): Promise<void>;
  /** Delete a user-created recipe. Built-ins are ignored. */
  delete(id: string): Promise<void>;
  /** Remove built-in recipes that are no longer shipped. */
  deleteBuiltinExcept(keepIds: readonly string[]): Promise<void>;
  deleteAllUserCreated(): Promise<void>;
}

export interface SettingsRepository {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
  /** Internal key/value metadata (e.g. built-in dataset version). */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

/** A completed retry-safe operation (idempotency record). */
export interface AppliedOperation {
  id: string;
  kind: string;
  /** Canonical JSON of the request, to detect an ID reused for a different request. */
  requestJson: string;
  resultJson: string;
  createdAt: string;
}

export interface OperationRepository {
  get(id: string): Promise<AppliedOperation | null>;
  /** Fails if the ID already exists, so concurrent duplicates cannot both commit. */
  record(operation: AppliedOperation): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface RepositorySet {
  ingredients: IngredientRepository;
  inventory: InventoryRepository;
  recipes: RecipeRepository;
  settings: SettingsRepository;
  operations: OperationRepository;
}

export interface Repositories extends RepositorySet {
  /**
   * Run `work` with repositories whose writes are buffered, then commit all
   * buffered writes in one database transaction: all of them or none.
   * Reads inside `work` see committed data, not the buffered writes, so
   * validate before calling and only write inside.
   */
  atomic<T>(work: (repos: RepositorySet) => Promise<T>): Promise<T>;
  /** Run reads that must observe one consistent state (e.g. an export). */
  readConsistent<T>(read: () => Promise<T>): Promise<T>;
}
