import type { Database, SqlJsStatic } from "sql.js";
import type { SqlDatabase, SqlRow, SqlValue } from "./database";
import { MIGRATIONS } from "./migrations";

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
  /** Called after every write with the full database file. */
  onPersist?: (bytes: Uint8Array) => void;
  description?: string;
}

/** Wrap a sql.js database in the SqlDatabase interface, applying migrations first. */
export function createSqlJsDatabase(SQL: SqlJsStatic, options: SqlJsOptions = {}): SqlDatabase {
  const db = options.data ? new SQL.Database(options.data) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  applyMigrations(db);
  options.onPersist?.(db.export());

  return {
    kind: "sqljs",
    description: options.description ?? "in-memory (sql.js)",
    async execute(sql: string, params: SqlValue[] = []) {
      db.run(sql, params);
      const rowsAffected = db.getRowsModified();
      options.onPersist?.(db.export());
      return { rowsAffected };
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
  };
}
