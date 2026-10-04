import type { SqlValue } from "@/db/database";

/** Small helpers for converting between SQLite rows and domain objects. */

export function toSqlBool(value: boolean | undefined): SqlValue {
  return value === undefined ? null : value ? 1 : 0;
}

export function fromSqlBool(value: unknown): boolean | undefined {
  return value === null || value === undefined ? undefined : Number(value) !== 0;
}

export function toSqlOptional(value: string | number | undefined): SqlValue {
  return value === undefined ? null : value;
}

export function fromSqlString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

export function fromSqlNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Drop keys whose value is undefined so objects compare cleanly after a round trip. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
