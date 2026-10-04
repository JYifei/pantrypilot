import { daysBetween, isValidIsoDate, type IsoDate } from "../common/dates";

/**
 * Visual urgency of a lot's expiration date relative to today.
 * - expired: date is in the past
 * - today: expires today
 * - tomorrow: expires in 1 day
 * - soon: expires in 2–3 days
 * - normal: later than that
 * - unknown: no (valid) expiration date recorded
 */
export type ExpirationStatus = "expired" | "today" | "tomorrow" | "soon" | "normal" | "unknown";

export const EXPIRING_SOON_DAYS = 3;

export function daysUntilExpiration(
  expirationDate: IsoDate | undefined,
  today: IsoDate,
): number | null {
  if (!expirationDate || !isValidIsoDate(expirationDate)) return null;
  return daysBetween(today, expirationDate);
}

export function getExpirationStatus(
  expirationDate: IsoDate | undefined,
  today: IsoDate,
): ExpirationStatus {
  const days = daysUntilExpiration(expirationDate, today);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= EXPIRING_SOON_DAYS) return "soon";
  return "normal";
}

/** Today, tomorrow or within the next few days (but not yet expired). */
export function isExpiringSoon(status: ExpirationStatus): boolean {
  return status === "today" || status === "tomorrow" || status === "soon";
}

/** Sort comparator: earliest expiration first, lots without a date last. */
export function compareByExpiration(
  a: { expirationDate?: IsoDate },
  b: { expirationDate?: IsoDate },
): number {
  const aValid = a.expirationDate && isValidIsoDate(a.expirationDate);
  const bValid = b.expirationDate && isValidIsoDate(b.expirationDate);
  if (aValid && bValid) return a.expirationDate!.localeCompare(b.expirationDate!);
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}
