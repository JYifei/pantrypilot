import initSqlJs from "sql.js";
import { createSqlJsDatabase, type SqlJsOptions } from "@/db/sqljsDatabase";
import type { SqlDatabase } from "@/db/database";
import { createAppServices } from "@/services/appServices";
import type { Clock } from "@/services/clock";

/** A fresh, migrated in-memory SQLite database (sql.js) for tests. */
export async function createTestDatabase(options: SqlJsOptions = {}): Promise<SqlDatabase> {
  const SQL = await initSqlJs();
  return createSqlJsDatabase(SQL, options);
}

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

export async function createTestServices(clock?: Clock, options: SqlJsOptions = {}) {
  const db = await createTestDatabase(options);
  return createAppServices(db, clock);
}
