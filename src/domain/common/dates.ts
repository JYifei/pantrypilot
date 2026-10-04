/**
 * Date helpers.
 *
 * Calendar dates (purchase / expiration) are stored as local `YYYY-MM-DD`
 * strings with no time zone, because a supermarket label says "2026-10-05",
 * not an instant in time. Timestamps (createdAt, updatedAt) are ISO 8601 strings.
 */

export type IsoDate = string;
export type IsoDateTime = string;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function toUtcMs(isoDate: IsoDate): number {
  if (!isValidIsoDate(isoDate)) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Today's calendar date in the user's local time zone. */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(isoDate: IsoDate, days: number): IsoDate {
  const date = new Date(toUtcMs(isoDate) + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

export function nowIsoDateTime(now: Date = new Date()): IsoDateTime {
  return now.toISOString();
}
