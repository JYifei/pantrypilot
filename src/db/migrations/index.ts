import initialSchema from "./0001_initial_schema.sql?raw";
import recipes from "./0002_recipes.sql?raw";
import appliedOperations from "./0003_applied_operations.sql?raw";

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

/**
 * Ordered list of schema migrations.
 *
 * The same SQL files are registered on the Rust side (src-tauri/src/lib.rs)
 * with identical version numbers; the Tauri SQL plugin applies them when the
 * database is opened. Keep both lists in sync.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: "initial_schema", sql: initialSchema },
  { version: 2, description: "recipes", sql: recipes },
  { version: 3, description: "applied_operations", sql: appliedOperations },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
