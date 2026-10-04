import type { Database, SqlJsStatic } from "sql.js";
import {
  PersistError,
  StaleWriteError,
  type SqlDatabase,
  type SqlRow,
  type SqlStatement,
  type SqlValue,
} from "./database";
import { MIGRATIONS } from "./migrations";
import { createWriteLock } from "./writeLock";

/**
 * Apply pending migrations to a sql.js database, tracking applied versions in
 * `schema_migrations`. (The Tauri plugin keeps its own `_sqlx_migrations` table.)
 */
export function applyMigrations(db: Database): number[] {
  db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const applied = new Set<number>();
  const result = db.exec("SELECT version FROM schema_migrations");
  for (const row of result[0]?.values ?? []) applied.add(Number(row[0]));

  const newlyApplied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.run("BEGIN");
    try {
      db.exec(migration.sql);
      db.run("INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.description,
        new Date().toISOString(),
      ]);
      db.run("COMMIT");
      newlyApplied.push(migration.version);
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
  }
  return newlyApplied;
}

export interface SqlJsOptions {
  /** Existing database bytes to load (e.g. from localStorage). */
  data?: Uint8Array;
  /**
   * Called with the full database file after every committed write. If it
   * throws, the in-memory database is reverted to the last persisted bytes and
   * the write fails with PersistError.
   */
  onPersist?: (bytes: Uint8Array) => void;
  description?: string;
}

/** Wrap a sql.js database in the SqlDatabase interface, applying migrations first. */
export function createSqlJsDatabase(SQL: SqlJsStatic, options: SqlJsOptions = {}): SqlDatabase {
  const open = (data?: Uint8Array) => {
    const instance = data ? new SQL.Database(data) : new SQL.Database();
    instance.run("PRAGMA foreign_keys = ON");
    return instance;
  };
  let db = open(options.data);
  applyMigrations(db);
  let lastPersisted = options.data;

  const persist = () => {
    if (!options.onPersist) return;
    const bytes = db.export();
    // export() reopens the database, which resets connection pragmas.
    db.run("PRAGMA foreign_keys = ON");
    try {
      options.onPersist(bytes);
      lastPersisted = bytes;
    } catch (error) {
      db.close();
      db = open(lastPersisted);
      throw new PersistError(error);
    }
  };
  persist();

  /** Synchronous, so no other JavaScript can run between BEGIN and COMMIT. */
  const runTransaction = (statements: readonly SqlStatement[]): number[] => {
    const affected: number[] = [];
    db.run("BEGIN");
    try {
      statements.forEach((statement, index) => {
        db.run(statement.sql, statement.params);
        const rows = db.getRowsModified();
        const expected = statement.expectRowsAffected;
        if (expected !== undefined && rows !== expected) throw new StaleWriteError(index, rows);
        affected.push(rows);
      });
      db.run("COMMIT");
    } catch (error) {
      try {
        db.run("ROLLBACK");
      } catch {
        // SQLite may already have rolled back on its own.
      }
      throw error;
    }
    persist();
    return affected;
  };

  const withWriteLock = createWriteLock();

  return {
    kind: "sqljs",
    description: options.description ?? "in-memory (sql.js)",
    execute(sql: string, params: SqlValue[] = [], executeOptions = {}) {
      return withWriteLock(async () => {
        const [rowsAffected] = runTransaction([
          { sql, params, expectRowsAffected: executeOptions.expectRowsAffected },
        ]);
        return { rowsAffected: rowsAffected ?? 0 };
      });
    },
    async select<T extends SqlRow = SqlRow>(sql: string, params: SqlValue[] = []) {
      const statement = db.prepare(sql);
      try {
        statement.bind(params);
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
    transaction(statements: readonly SqlStatement[]) {
      if (statements.length === 0) return Promise.resolve([]);
      return withWriteLock(async () => runTransaction(statements));
    },
    withWritesPaused(read) {
      return withWriteLock(read);
    },
  };
}
