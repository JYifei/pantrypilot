/** Values that can be bound to SQL parameters. Booleans are stored as 0 / 1. */
export type SqlValue = string | number | null;

export type SqlRow = Record<string, unknown>;

/**
 * Minimal async SQL interface used by repositories.
 *
 * Implemented by the Tauri SQL plugin (desktop app) and by sql.js (tests and
 * browser preview). Use `?` positional placeholders — both drivers support them.
 *
 * Note: the Tauri plugin uses a connection pool, so multi-statement
 * transactions (BEGIN … COMMIT across calls) are not reliable. Repositories
 * keep each write to a single statement and order writes so that a failure
 * leaves consistent data.
 */
export interface SqlDatabase {
  execute(sql: string, params?: SqlValue[]): Promise<{ rowsAffected: number }>;
  select<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Human-readable description of where data lives (for the settings screen). */
  readonly description: string;
  readonly kind: "tauri" | "sqljs";
}
