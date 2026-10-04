import type { LocaleCode } from "@/domain/common/localizedText";
import type { NutrientInfo, NutrientUnit } from "@/domain/nutrition/types";

/** Locale-aware formatting helpers. Units are SI symbols and are not translated. */

export function formatNumber(value: number, locale: LocaleCode, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** 251 → "251 g", 1500 → "1.5 kg", 2.35 → "2.4 g". */
export function formatWeight(grams: number, locale: LocaleCode): string {
  if (Math.abs(grams) >= 1000) return `${formatNumber(grams / 1000, locale, 2)} kg`;
  return `${formatNumber(grams, locale, Math.abs(grams) < 10 ? 1 : 0)} g`;
}

export function formatCurrency(amount: number, currency: string, locale: LocaleCode): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${formatNumber(amount, locale, 2)} ${currency}`;
  }
}

/** Format a `YYYY-MM-DD` calendar date without shifting it through a time zone. */
export function formatDate(isoDate: string, locale: LocaleCode, today?: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const sameYear = today ? today.slice(0, 4) === isoDate.slice(0, 4) : false;
  return new Intl.DateTimeFormat(locale, {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const UNIT_SYMBOL: Record<NutrientUnit, string> = { kcal: "kcal", g: "g", mg: "mg", mcg: "µg" };

export function nutrientUnitSymbol(unit: NutrientUnit): string {
  return UNIT_SYMBOL[unit];
}

export function formatNutrient(value: number, info: NutrientInfo, locale: LocaleCode): string {
  return `${formatNumber(value, locale, info.decimals)} ${UNIT_SYMBOL[info.unit]}`;
}
