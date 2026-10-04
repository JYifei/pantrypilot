/** Values that can be bound to SQL parameters. Booleans are stored as 0 / 1. */
export type SqlValue = string | number | null;

export type SqlRow = Record<string, unknown>;

export interface ExecuteOptions {
  /**
   * The statement must change exactly this many rows. Used for compare-and-set
   * updates: a mismatch means the row changed since it was read.
   */
  expectRowsAffected?: number;
}

export interface SqlStatement {
  sql: string;
  params: SqlValue[];
  expectRowsAffected?: number;
}

/** A guarded statement changed an unexpected number of rows; nothing was committed. */
export class StaleWriteError extends Error {
  constructor(
    readonly statementIndex: number,
    readonly rowsAffected: number,
  ) {
    super(`Statement ${statementIndex} affected ${rowsAffected} rows; the data changed meanwhile`);
    this.name = "StaleWriteError";
  }
}

/** The change was applied in memory but could not be saved; it has been reverted. */
export class PersistError extends Error {
  constructor(cause: unknown) {
    super(`Could not persist the database: ${String(cause)}`, { cause });
    this.name = "PersistError";
  }
}

/**
 * Minimal async SQL interface used by repositories.
 *
 * Implemented by the Tauri SQL plugin (desktop app) and by sql.js (tests and
 * browser preview). Use `?` positional placeholders — both drivers support them.
 *
 * Separate `execute` calls are independent: on desktop they may run on
 * different pooled connections. Anything that must succeed or fail as a whole
 * goes through `transaction`.
 */
export interface SqlDatabase {
  execute(
    sql: string,
    params?: SqlValue[],
    options?: ExecuteOptions,
  ): Promise<{ rowsAffected: number }>;
  select<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /**
   * Run all statements in one database transaction. If any statement fails or
   * a guarded statement affects an unexpected number of rows (StaleWriteError),
   * everything is rolled back. Resolves with the rows affected per statement.
   */
  transaction(statements: readonly SqlStatement[]): Promise<number[]>;
  /**
   * Run reads while this app's writes are held back, so they observe a single
   * consistent state. `read` must not write (that would deadlock).
   */
  withWritesPaused<T>(read: () => Promise<T>): Promise<T>;
  /** Human-readable description of where data lives (for the settings screen). */
  readonly description: string;
  readonly kind: "tauri" | "sqljs";
}
