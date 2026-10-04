import Database from "@tauri-apps/plugin-sql";
import type { SqlDatabase, SqlRow, SqlValue } from "./database";

/**
 * Open the app database through the official Tauri SQL plugin.
 * Migrations registered in src-tauri/src/lib.rs run automatically on load.
 */
export async function openTauriDatabase(url: string, description: string): Promise<SqlDatabase> {
  const db = await Database.load(url);
  return {
    kind: "tauri",
    description,
    async execute(sql: string, params: SqlValue[] = []) {
      const result = await db.execute(sql, params);
      return { rowsAffected: result.rowsAffected };
    },
    async select<T extends SqlRow = SqlRow>(sql: string, params: SqlValue[] = []) {
      return db.select<T[]>(sql, params);
    },
  };
}
