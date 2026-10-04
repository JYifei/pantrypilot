/** UI / content locales supported by the app. */
export const SUPPORTED_LOCALES = ["zh-CN", "en-US", "ja-JP"] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

/**
 * Text that exists in several languages. Simplified Chinese is required because
 * it is the primary UI language for V0.1; other languages are optional.
 */
export interface LocalizedText {
  zhCN: string;
  enUS?: string;
  jaJP?: string;
}

const LOCALE_TO_KEY: Record<LocaleCode, keyof LocalizedText> = {
  "zh-CN": "zhCN",
  "en-US": "enUS",
  "ja-JP": "jaJP",
};

/** Fallback order when the requested language is missing. */
const FALLBACK_KEYS: (keyof LocalizedText)[] = ["enUS", "zhCN", "jaJP"];

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Pick the best available string for a locale, falling back to English, then Chinese. */
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
