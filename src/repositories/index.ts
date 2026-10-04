import type { SqlDatabase } from "@/db/database";
import { SqliteIngredientRepository } from "./sqlite/SqliteIngredientRepository";
import { SqliteInventoryRepository } from "./sqlite/SqliteInventoryRepository";
import { SqliteSettingsRepository } from "./sqlite/SqliteSettingsRepository";
import type { Repositories } from "./types";

export type * from "./types";

export function createSqliteRepositories(db: SqlDatabase): Repositories {
  return {
    ingredients: new SqliteIngredientRepository(db),
    inventory: new SqliteInventoryRepository(db),
    settings: new SqliteSettingsRepository(db),
  };
}
