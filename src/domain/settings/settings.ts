import { z } from "zod";
import { SUPPORTED_LOCALES, type LocaleCode } from "../common/localizedText";

export const THEMES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEMES)[number];

/** ISO 4217 currency codes offered in the UI. */
export const CURRENCIES = ["JPY", "CNY", "USD", "EUR", "KRW", "TWD", "HKD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/**
 * Region influences future defaults such as which nutrition dataset to prefer
 * and which supermarket vocabulary to show first.
 */
export const REGIONS = ["JP", "CN", "TW", "HK", "KR", "US", "EU", "OTHER"] as const;
export type RegionCode = (typeof REGIONS)[number];

export interface AppSettings {
  language: LocaleCode;
  theme: ThemePreference;
  currency: CurrencyCode;
  region: RegionCode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh-CN",
  theme: "system",
  currency: "JPY",
  region: "JP",
};

export const appSettingsSchema = z.object({
  language: z.enum(SUPPORTED_LOCALES),
  theme: z.enum(THEMES),
  currency: z.enum(CURRENCIES),
  region: z.enum(REGIONS),
});

/**
 * Merge stored key/value pairs onto the defaults, dropping anything invalid
 * (e.g. a value written by a newer app version).
 */
export function normalizeSettings(raw: Record<string, unknown>): AppSettings {
  const result: AppSettings = { ...DEFAULT_SETTINGS };
  const shape = appSettingsSchema.shape;
  for (const key of Object.keys(shape) as (keyof AppSettings)[]) {
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) (result as Record<keyof AppSettings, unknown>)[key] = parsed.data;
  }
  return result;
}
