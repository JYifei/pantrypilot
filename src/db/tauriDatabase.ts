import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import {
  StaleWriteError,
  type SqlDatabase,
  type SqlRow,
  type SqlStatement,
  type SqlValue,
} from "./database";
import { createWriteLock } from "./writeLock";

/** Error shape returned by the `run_transaction` command in src-tauri/src/transaction.rs. */
type TransactionCommandError =
  | { kind: "databaseNotLoaded" }
  | { kind: "staleWrite"; statementIndex: number; rowsAffected: number }
  | { kind: "sql"; statementIndex: number | null; message: string };

function toError(error: unknown): Error {
  const e = error as Partial<TransactionCommandError> | undefined;
  if (e?.kind === "staleWrite") {
    const stale = e as Extract<TransactionCommandError, { kind: "staleWrite" }>;
    return new StaleWriteError(stale.statementIndex, stale.rowsAffected);
  }
  if (e?.kind === "sql") {
    const sql = e as Extract<TransactionCommandError, { kind: "sql" }>;
    return new Error(`SQL error in statement ${sql.statementIndex ?? "-"}: ${sql.message}`);
  }
  if (e?.kind === "databaseNotLoaded") return new Error("Database is not loaded");
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Open the app database through the official Tauri SQL plugin.
 * Migrations registered in src-tauri/src/lib.rs run automatically on load.
 * Transactions run in Rust on the plugin's own connection pool.
 */
export async function openTauriDatabase(url: string, description: string): Promise<SqlDatabase> {
  const db = await Database.load(url);
  const withWriteLock = createWriteLock();
  return {
    kind: "tauri",
    description,
    execute(sql: string, params: SqlValue[] = [], options = {}) {
      return withWriteLock(async () => {
        const result = await db.execute(sql, params);
        const expected = options.expectRowsAffected;
        if (expected !== undefined && result.rowsAffected !== expected) {
          throw new StaleWriteError(0, result.rowsAffected);
        }
        return { rowsAffected: result.rowsAffected };
      });
    },
    async select<T extends SqlRow = SqlRow>(sql: string, params: SqlValue[] = []) {
      return db.select<T[]>(sql, params);
    },
    transaction(statements: readonly SqlStatement[]) {
      if (statements.length === 0) return Promise.resolve([]);
      return withWriteLock(async () => {
        try {
          return await invoke<number[]>("run_transaction", { db: url, statements });
        } catch (error) {
          throw toError(error);
        }
      });
    },
    withWritesPaused(read) {
      return withWriteLock(read);
    },
  };
}
