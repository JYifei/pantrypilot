/**
 * UI / content locales offered in the app. The app targets Japan: Japanese is
 * the reference wording and Chinese the reading language. Adding a locale means
 * a locale file, an entry here and a LocalizedText slot.
 */
export const SUPPORTED_LOCALES = ["zh-CN", "ja-JP"] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

/**
 * Text that exists in several languages. Simplified Chinese is required (it is
 * the default UI language); `enUS` is kept only so older data and backups that
 * contain English still load. It is never shown.
 */
export interface LocalizedText {
  zhCN: string;
  enUS?: string;
  jaJP?: string;
}

const LOCALE_TO_KEY: Record<LocaleCode, keyof LocalizedText> = {
  "zh-CN": "zhCN",
  "ja-JP": "jaJP",
};

/** Fallback order when the requested language is missing. */
const FALLBACK_KEYS: (keyof LocalizedText)[] = ["zhCN", "jaJP"];

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Pick the best available string for a locale, falling back to Chinese, then Japanese. */
export function localize(text: LocalizedText, locale: LocaleCode): string {
  const preferred = text[LOCALE_TO_KEY[locale]];
  if (preferred && preferred.trim() !== "") return preferred;
  for (const key of FALLBACK_KEYS) {
    const value = text[key];
    if (value && value.trim() !== "") return value;
  }
  return "";
}

/** All non-empty translations, used for multilingual search. */
export function allLocalizedValues(text: LocalizedText): string[] {
  return [text.zhCN, text.enUS, text.jaJP].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
}
