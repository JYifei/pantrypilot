import type { SqlDatabase } from "@/db/database";
import { createSqliteRepositories, type Repositories } from "@/repositories";
import { BackupService } from "./backupService";
import { systemClock, type Clock } from "./clock";
import { IngredientService } from "./ingredientService";
import { InventoryService } from "./inventoryService";
import { ensureBuiltinData } from "./seedService";

export interface AppServices {
  database: SqlDatabase;
  repositories: Repositories;
  inventory: InventoryService;
  ingredients: IngredientService;
  backup: BackupService;
}

/** Wire repositories and services together and make sure built-in data exists. */
export async function createAppServices(
  database: SqlDatabase,
  clock: Clock = systemClock,
): Promise<AppServices> {
  const repositories = createSqliteRepositories(database);
  await ensureBuiltinData(repositories);
  return {
    database,
    repositories,
    inventory: new InventoryService(repositories, clock),
    ingredients: new IngredientService(repositories, clock),
    backup: new BackupService(repositories, clock),
  };
}
